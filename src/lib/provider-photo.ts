import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { fileObjects, providerProfiles } from "@/db/schema";
import { putObject } from "@/lib/adapters/s3";
import { writeAudit } from "@/lib/audit";
import { newId } from "@/lib/ids";
import { ensureProviderProfile, findProviderProfile } from "@/lib/provider-profile";
import {
  MAX_PHOTO_BYTES,
  PROVIDER_PHOTO_PURPOSE,
  type PhotoErrorCode,
  checkPhotoUpload,
  photoObjectKey,
  sniffImageType,
} from "@/lib/photo";

export type PhotoResult = { ok: true; fileId: string } | { ok: false; code: PhotoErrorCode };

/**
 * Stores a provider photo and repoints the profile at it, replacing any previous photo.
 * Callers must have already proven the actor is staff in this org — the profile row is
 * created here if she does not have one yet, so `no_profile` cannot come back (TOK-63).
 */
export async function saveProviderPhoto(input: {
  organizationId: string;
  userId: string;
  file: File;
}): Promise<PhotoResult> {
  const declared = checkPhotoUpload({ contentType: input.file.type, sizeBytes: input.file.size });
  if (!declared.ok) return declared;

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  // file.size is client-reported; the buffer we actually hold is the one that must fit.
  if (bytes.byteLength === 0) return { ok: false, code: "empty" };
  if (bytes.byteLength > MAX_PHOTO_BYTES) return { ok: false, code: "size" };

  const contentType = sniffImageType(bytes);
  if (!contentType) return { ok: false, code: "unreadable" };

  const db = getDb();
  // A doula the caller has already vouched for is entitled to a profile, so a missing row
  // is created here rather than turned into a dead end on her first upload (TOK-63).
  const profile = await ensureProviderProfile({
    organizationId: input.organizationId,
    userId: input.userId,
  });

  const fileId = newId();
  const key = photoObjectKey({ organizationId: input.organizationId, fileId, contentType });
  const stored = await putObject({
    organizationId: input.organizationId,
    key,
    body: Buffer.from(bytes),
    contentType,
  });

  await db.insert(fileObjects).values({
    id: fileId,
    organizationId: input.organizationId,
    bucket: stored.bucket,
    objectKey: stored.key,
    contentType,
    sizeBytes: bytes.byteLength,
    purpose: PROVIDER_PHOTO_PURPOSE,
    // Without S3 there is nothing to read back from, so keep the bytes with the row.
    inlineData: stored.provider === "stub" ? Buffer.from(bytes).toString("base64") : null,
  });

  await db
    .update(providerProfiles)
    .set({ photoFileId: fileId, updatedAt: new Date() })
    .where(eq(providerProfiles.id, profile.id));

  await discardPhotoFile(profile.photoFileId, input.organizationId);

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.userId,
    action: "provider_profile.photo_updated",
    entityType: "provider_profile",
    entityId: profile.id,
  });

  return { ok: true, fileId };
}

/** No profile means no photo to remove, so this stays a read — nothing is created here. */
export async function clearProviderPhoto(input: { organizationId: string; userId: string }) {
  const db = getDb();
  const profile = await findProviderProfile(input);
  if (!profile?.photoFileId) return;

  await db
    .update(providerProfiles)
    .set({ photoFileId: null, updatedAt: new Date() })
    .where(eq(providerProfiles.id, profile.id));
  await discardPhotoFile(profile.photoFileId, input.organizationId);

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.userId,
    action: "provider_profile.photo_removed",
    entityType: "provider_profile",
    entityId: profile.id,
  });
}

/**
 * Drops the replaced row so a stale id stops resolving at `/api/media/[id]`. Scoped by
 * purpose and org so this can never reach signed evidence or another tenant's file.
 */
async function discardPhotoFile(fileId: string | null, organizationId: string) {
  if (!fileId) return;
  const db = getDb();
  await db
    .delete(fileObjects)
    .where(
      and(
        eq(fileObjects.id, fileId),
        eq(fileObjects.organizationId, organizationId),
        eq(fileObjects.purpose, PROVIDER_PHOTO_PURPOSE),
      ),
    );
}
