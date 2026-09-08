import { describe, expect, it } from "vitest";
import {
  MAX_PHOTO_BYTES,
  checkPhotoUpload,
  initialsOf,
  photoErrorMessage,
  photoObjectKey,
  providerPhotoUrl,
  sniffImageType,
} from "./photo";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const webp = new Uint8Array([
  ...[0x52, 0x49, 0x46, 0x46], // RIFF
  ...[0x00, 0x00, 0x00, 0x00],
  ...[0x57, 0x45, 0x42, 0x50], // WEBP
]);

describe("provider photo upload rules (TOK-25)", () => {
  it("accepts the three raster types we serve", () => {
    for (const contentType of ["image/jpeg", "image/png", "image/webp"]) {
      expect(checkPhotoUpload({ contentType, sizeBytes: 1024 })).toEqual({ ok: true, contentType });
    }
  });

  it("normalizes the charset parameter and casing browsers may attach", () => {
    expect(checkPhotoUpload({ contentType: "IMAGE/JPEG; charset=binary", sizeBytes: 10 })).toEqual({
      ok: true,
      contentType: "image/jpeg",
    });
  });

  it("rejects SVG, which could carry script from a same-origin URL", () => {
    expect(checkPhotoUpload({ contentType: "image/svg+xml", sizeBytes: 1024 })).toEqual({
      ok: false,
      code: "type",
    });
  });

  it("rejects non-images and the empty file input of an untouched form", () => {
    expect(checkPhotoUpload({ contentType: "application/pdf", sizeBytes: 1024 }).ok).toBe(false);
    expect(checkPhotoUpload({ contentType: "text/html", sizeBytes: 1024 }).ok).toBe(false);
    expect(checkPhotoUpload({ contentType: "", sizeBytes: 0 })).toEqual({ ok: false, code: "type" });
  });

  it("rejects an empty or oversized file", () => {
    expect(checkPhotoUpload({ contentType: "image/png", sizeBytes: 0 })).toEqual({
      ok: false,
      code: "empty",
    });
    expect(checkPhotoUpload({ contentType: "image/png", sizeBytes: MAX_PHOTO_BYTES }).ok).toBe(true);
    expect(checkPhotoUpload({ contentType: "image/png", sizeBytes: MAX_PHOTO_BYTES + 1 })).toEqual({
      ok: false,
      code: "size",
    });
  });
});

describe("photo error surfacing (TOK-25)", () => {
  it("resolves the codes the action can redirect with", () => {
    expect(photoErrorMessage("size")).toBe("Photo must be 2MB or smaller.");
    expect(photoErrorMessage("unreadable")).toContain("not a readable");
  });

  it("renders nothing for an absent or hand-crafted code", () => {
    expect(photoErrorMessage(undefined)).toBeNull();
    expect(photoErrorMessage("")).toBeNull();
    expect(photoErrorMessage("Your account is suspended, call 555-0100")).toBeNull();
    expect(photoErrorMessage("toString")).toBeNull();
    expect(photoErrorMessage("__proto__")).toBeNull();
  });
});

describe("provider photo urls (TOK-25)", () => {
  it("points at the media route the profile pages read", () => {
    expect(providerPhotoUrl("66666666-6666-4666-8666-666666666666")).toBe(
      "/api/media/66666666-6666-4666-8666-666666666666",
    );
  });
});

describe("provider photo byte sniffing (TOK-25)", () => {
  it("identifies the accepted formats from their magic bytes", () => {
    expect(sniffImageType(jpeg)).toBe("image/jpeg");
    expect(sniffImageType(png)).toBe("image/png");
    expect(sniffImageType(webp)).toBe("image/webp");
  });

  it("refuses bytes that are not one of those formats, whatever the upload claimed", () => {
    expect(sniffImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("<!doctype html>"))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });

  it("does not read a truncated RIFF header as WebP", () => {
    expect(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00]))).toBeNull();
  });
});

describe("provider photo storage keys (TOK-25)", () => {
  const organizationId = "11111111-1111-4111-8111-111111111111";
  const fileId = "66666666-6666-4666-8666-666666666666";

  it("namespaces the key by organization and file id", () => {
    expect(photoObjectKey({ organizationId, fileId, contentType: "image/png" })).toBe(
      `provider-photos/${organizationId}/${fileId}.png`,
    );
    expect(photoObjectKey({ organizationId, fileId, contentType: "image/webp" })).toMatch(/\.webp$/);
    expect(photoObjectKey({ organizationId, fileId, contentType: "image/jpeg" })).toMatch(/\.jpg$/);
  });
});

describe("initials fallback (TOK-25)", () => {
  it("uses first and last initials", () => {
    expect(initialsOf("Maya Chen")).toBe("MC");
    expect(initialsOf("Sam")).toBe("S");
    expect(initialsOf("ada b. lovelace")).toBe("AL");
  });

  it("survives punctuation, extra spaces, and empty names", () => {
    expect(initialsOf("  Riley   Voss  ")).toBe("RV");
    expect(initialsOf("Jordan (Jo) Rivera")).toBe("JR");
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("   ")).toBe("?");
  });
});
