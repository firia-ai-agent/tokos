import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { fileObjects } from "@/db/schema";
import { signedGetUrl } from "@/lib/adapters/s3";
import { PROVIDER_PHOTO_PURPOSE } from "@/lib/photo";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Serves provider photos, which are public by design — `/p/[slug]` renders them for
 * anonymous visitors, and the next/image optimizer refetches them without cookies.
 *
 * The purpose filter is the security boundary, not a convenience: `file_objects` also
 * holds signed contract evidence, so anything that is not a provider photo is a 404 here
 * regardless of who is asking.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });

  const db = getDb();
  const [file] = await db
    .select()
    .from(fileObjects)
    .where(and(eq(fileObjects.id, id), eq(fileObjects.purpose, PROVIDER_PHOTO_PURPOSE)))
    .limit(1);
  if (!file) return new Response("Not found", { status: 404 });

  const headers = {
    "Content-Type": file.contentType,
    "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "X-Content-Type-Options": "nosniff",
  };

  if (file.inlineData) {
    return new Response(Buffer.from(file.inlineData, "base64"), { headers });
  }

  const url = await signedGetUrl(file.bucket, file.objectKey);
  if (!url) return new Response("Not found", { status: 404 });
  return Response.redirect(url, 307);
}
