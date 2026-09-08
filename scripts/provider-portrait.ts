import { deflateSync } from "node:zlib";

/**
 * Seed provider portraits (TOK-25).
 *
 * The demo tenants need a face on `/p/[slug]`, so the portrait is drawn here instead of
 * checked in: no stock photo we have no license for, and no binary in the repo. The output
 * is a real PNG, so the seed can hand it to the same upload path a doula's file takes —
 * magic-byte sniff included — rather than writing rows the app has never validated.
 */

export const PHOTO_SIZE = 512;

type Rgb = [number, number, number];

const WHITE: Rgb = [255, 255, 255];

function parseHex(hex: string): Rgb {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16)) as Rgb;
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return [0, 1, 2].map((channel) => {
    const value = from[channel] + (to[channel] - from[channel]) * amount;
    return Math.min(255, Math.max(0, Math.round(value)));
  }) as Rgb;
}

/** 1 inside the shape, 0 outside, feathered over the edge pixel so it is not stair-stepped. */
function coverage(signedDistance: number) {
  return Math.min(Math.max(0.5 - signedDistance, 0), 1);
}

/** A head-and-shoulders figure on a soft wash of the tenant's brand color. */
export function renderProviderPhotoPng(baseColor: string) {
  const base = parseHex(baseColor);
  const top = mix(base, WHITE, 0.82);
  const bottom = mix(base, WHITE, 0.52);
  const figure = mix(base, WHITE, 0.12);

  const headX = PHOTO_SIZE * 0.5;
  const headY = PHOTO_SIZE * 0.4;
  const headRadius = PHOTO_SIZE * 0.155;
  const bodyX = PHOTO_SIZE * 0.5;
  const bodyY = PHOTO_SIZE * 1.0;
  const bodyRadiusX = PHOTO_SIZE * 0.36;
  const bodyRadiusY = PHOTO_SIZE * 0.45;

  const pixels = Buffer.alloc(PHOTO_SIZE * PHOTO_SIZE * 3);
  for (let y = 0; y < PHOTO_SIZE; y += 1) {
    const background = mix(top, bottom, y / (PHOTO_SIZE - 1));
    for (let x = 0; x < PHOTO_SIZE; x += 1) {
      const head = Math.hypot(x + 0.5 - headX, y + 0.5 - headY) - headRadius;
      const unit = Math.hypot(
        (x + 0.5 - bodyX) / bodyRadiusX,
        (y + 0.5 - bodyY) / bodyRadiusY,
      );
      // The ellipse has no cheap exact distance; scaling by the short radius is close
      // enough to feather one pixel of edge.
      const body = (unit - 1) * Math.min(bodyRadiusX, bodyRadiusY);
      const [red, green, blue] = mix(
        background,
        figure,
        Math.max(coverage(head), coverage(body)),
      );
      const at = (y * PHOTO_SIZE + x) * 3;
      pixels[at] = red;
      pixels[at + 1] = green;
      pixels[at + 2] = blue;
    }
  }
  return encodePng(pixels);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(body.length, 0);
  header.write(type, 4, "ascii");
  const checksum = Buffer.alloc(4);
  // The CRC covers the type and the body, but not the length.
  checksum.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), body])), 0);
  return Buffer.concat([header, body, checksum]);
}

/** Minimal 8-bit truecolor PNG: every scanline uses filter 0, which zlib still packs down. */
function encodePng(rgb: Buffer) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(PHOTO_SIZE, 0);
  header.writeUInt32BE(PHOTO_SIZE, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolor, no alpha
  // Bytes 10-12 stay zero: deflate, adaptive filtering, no interlace.

  const stride = PHOTO_SIZE * 3 + 1;
  const raw = Buffer.alloc(PHOTO_SIZE * stride);
  for (let y = 0; y < PHOTO_SIZE; y += 1) {
    const from = y * PHOTO_SIZE * 3;
    rgb.copy(raw, y * stride + 1, from, from + PHOTO_SIZE * 3);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
