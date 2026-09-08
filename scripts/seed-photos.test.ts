import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_PHOTO_BYTES, checkPhotoUpload, sniffImageType } from "../src/lib/photo";

/**
 * The seeded headshots are checked-in binaries (TOK-25), so nothing at runtime would notice
 * a truncated download or a placeholder that never got replaced. This asserts the assets the
 * seed reads are real photographs the upload path will accept — the seed hands them to the
 * same `saveProviderPhoto` a doula's own upload goes through, so a reject here is a demo
 * with a faceless profile.
 */
const SEED_PHOTOS = ["maya-chen.jpg", "sam-ortega.jpg"];
const SEED_PHOTO_DIR = join(process.cwd(), "public", "seed");

/** A silhouette or a 1×1 placeholder compresses far smaller than a photograph does. */
const MIN_PHOTO_BYTES = 40 * 1024;

describe("seeded provider headshots (TOK-25)", () => {
  it.each(SEED_PHOTOS)("%s exists and holds real image bytes", (file) => {
    const path = join(SEED_PHOTO_DIR, file);
    const size = statSync(path).size;
    const bytes = new Uint8Array(readFileSync(path));

    expect(sniffImageType(bytes)).toMatch(/^image\/(jpeg|png)$/);
    expect(size).toBeGreaterThan(MIN_PHOTO_BYTES);
    expect(size).toBeLessThan(MAX_PHOTO_BYTES);
    expect(bytes.byteLength).toBe(size);
  });

  it.each(SEED_PHOTOS)("%s passes the upload rules the seed hands it to", (file) => {
    const bytes = new Uint8Array(readFileSync(join(SEED_PHOTO_DIR, file)));
    const sniffed = sniffImageType(bytes);
    expect(sniffed).not.toBeNull();
    // The seed declares image/jpeg; the check must pass on the declared type too.
    expect(checkPhotoUpload({ contentType: "image/jpeg", sizeBytes: bytes.byteLength })).toEqual({
      ok: true,
      contentType: "image/jpeg",
    });
  });

  it("gives the two demo tenants different faces", () => {
    const [maya, sam] = SEED_PHOTOS.map((file) => readFileSync(join(SEED_PHOTO_DIR, file)));
    expect(maya.equals(sam)).toBe(false);
  });

  it("records where the photos came from", () => {
    const attribution = readFileSync(join(SEED_PHOTO_DIR, "ATTRIBUTION.md"), "utf8");
    for (const file of SEED_PHOTOS) expect(attribution).toContain(file);
    expect(attribution).toContain("License");
  });
});
