import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, sniffImageType } from "../src/lib/photo";
import { PHOTO_SIZE, renderProviderPhotoPng } from "./provider-portrait";

const NOVA = "#2A7A78";
const CEDAR = "#5C4A3A";

/**
 * An independent CRC32 so the test judges the encoder's chunk framing rather than trusting
 * the same table that wrote it. A browser drops a PNG whose chunk CRCs do not check out,
 * and nothing else in the stack would notice before the demo does.
 */
function crc32(bytes: Buffer) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunks(png: Buffer) {
  const found: { type: string; body: Buffer; crcOk: boolean }[] = [];
  let at = 8; // past the signature
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const end = at + 8 + length;
    found.push({
      type: png.toString("ascii", at + 4, at + 8),
      body: png.subarray(at + 8, end),
      crcOk: png.readUInt32BE(end) === crc32(png.subarray(at + 4, end)),
    });
    at = end + 4;
  }
  return found;
}

/** Undoes the encoder's scanline packing so pixels can be read back. */
function scanlines(png: Buffer) {
  const idat = chunks(png).find((entry) => entry.type === "IDAT");
  if (!idat) throw new Error("no IDAT chunk");
  return inflateSync(idat.body);
}

function pixelAt(raw: Buffer, x: number, y: number) {
  const stride = PHOTO_SIZE * 3 + 1;
  const at = y * stride + 1 + x * 3;
  return [raw[at], raw[at + 1], raw[at + 2]];
}

describe("seeded provider photo bytes (TOK-25)", () => {
  const png = renderProviderPhotoPng(NOVA);

  it("passes the upload rules the seed hands them to", () => {
    expect(sniffImageType(png)).toBe("image/png");
    expect(png.byteLength).toBeGreaterThan(0);
    expect(png.byteLength).toBeLessThan(MAX_PHOTO_BYTES);
  });

  it("writes well-formed chunks a decoder will accept", () => {
    const found = chunks(png);
    expect(found.map((entry) => entry.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(found.every((entry) => entry.crcOk)).toBe(true);
  });

  it("declares a square 8-bit truecolor image", () => {
    const [ihdr] = chunks(png);
    expect(ihdr.body.readUInt32BE(0)).toBe(PHOTO_SIZE);
    expect(ihdr.body.readUInt32BE(4)).toBe(PHOTO_SIZE);
    expect([...ihdr.body.subarray(8)]).toEqual([8, 2, 0, 0, 0]);
  });

  it("packs every scanline with the filter byte the header promises", () => {
    const raw = scanlines(png);
    const stride = PHOTO_SIZE * 3 + 1;
    expect(raw.byteLength).toBe(PHOTO_SIZE * stride);
    const filters = new Set<number>();
    for (let y = 0; y < PHOTO_SIZE; y += 1) filters.add(raw[y * stride]);
    expect([...filters]).toEqual([0]);
  });

  it("draws a figure rather than a flat wash", () => {
    const raw = scanlines(png);
    const head = pixelAt(raw, PHOTO_SIZE / 2, Math.round(PHOTO_SIZE * 0.4));
    const corner = pixelAt(raw, 4, 4);
    const sum = (rgb: number[]) => rgb.reduce((total, channel) => total + channel, 0);
    expect(sum(head)).toBeLessThan(sum(corner));
  });

  it("is deterministic per tenant color, so a reseed does not churn the demo", () => {
    expect(renderProviderPhotoPng(NOVA).equals(png)).toBe(true);
    expect(renderProviderPhotoPng(CEDAR).equals(png)).toBe(false);
  });
});
