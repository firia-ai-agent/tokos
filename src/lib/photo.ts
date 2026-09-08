/**
 * Provider photo rules (TOK-25).
 *
 * A provider photo is public marketing material — it is rendered on `/p/[slug]` to
 * anonymous visitors — so it must never be confused with the signed-evidence files that
 * share the `file_objects` table. Everything here is pure so the accept/reject decision
 * is testable without S3 or a database.
 */

export const PROVIDER_PHOTO_PURPOSE = "provider_photo";

/** Raster only. SVG is excluded on purpose: it can carry script and this is served same-origin. */
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/**
 * Rejections travel back to the form as a code in the query string, never as prose, so a
 * hand-crafted `?photoError=` cannot put arbitrary text on a signed-in page.
 */
export const PHOTO_ERRORS = {
  type: "Photo must be a JPEG, PNG, or WebP image.",
  empty: "That photo file was empty.",
  size: "Photo must be 2MB or smaller.",
  unreadable: "That file is not a readable JPEG, PNG, or WebP image.",
  no_profile: "There is no provider profile to attach a photo to yet.",
} as const;

export type PhotoErrorCode = keyof typeof PHOTO_ERRORS;

export function photoErrorMessage(code: string | undefined) {
  if (!code) return null;
  return Object.prototype.hasOwnProperty.call(PHOTO_ERRORS, code)
    ? PHOTO_ERRORS[code as PhotoErrorCode]
    : null;
}

export type PhotoRejection = { ok: false; code: PhotoErrorCode };
export type PhotoAcceptance = { ok: true; contentType: (typeof ALLOWED_PHOTO_TYPES)[number] };
export type PhotoCheck = PhotoAcceptance | PhotoRejection;

function isAllowedType(value: string): value is (typeof ALLOWED_PHOTO_TYPES)[number] {
  return (ALLOWED_PHOTO_TYPES as readonly string[]).includes(value);
}

export function checkPhotoUpload(input: { contentType: string; sizeBytes: number }): PhotoCheck {
  // Browsers send `type: ""` for an empty file input, which is how "no photo chosen" arrives.
  const contentType = input.contentType.split(";")[0].trim().toLowerCase();
  if (!isAllowedType(contentType)) return { ok: false, code: "type" };
  if (input.sizeBytes <= 0) return { ok: false, code: "empty" };
  if (input.sizeBytes > MAX_PHOTO_BYTES) return { ok: false, code: "size" };
  return { ok: true, contentType };
}

/**
 * The declared Content-Type comes from the browser and is trivially forged, so the stored
 * bytes decide the type we persist and later serve. Returns null for anything that is not
 * one of the three raster formats we accept.
 */
export function sniffImageType(bytes: Uint8Array): (typeof ALLOWED_PHOTO_TYPES)[number] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((byte, index) => bytes[index] === byte)) {
    return "image/png";
  }
  // RIFF....WEBP
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function photoObjectKey(input: { organizationId: string; fileId: string; contentType: string }) {
  const extension =
    input.contentType === "image/png" ? "png" : input.contentType === "image/webp" ? "webp" : "jpg";
  return `provider-photos/${input.organizationId}/${input.fileId}.${extension}`;
}

/** `/api/media/[id]` is same-origin, so next/image treats it as a local path. */
export function providerPhotoUrl(fileId: string) {
  return `/api/media/${fileId}`;
}

/** Fallback avatar content when a provider has not uploaded a photo yet. */
export function initialsOf(name: string) {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}
