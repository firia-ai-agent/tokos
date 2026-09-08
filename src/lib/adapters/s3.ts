import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { hasS3 } from "@/lib/env";

export const STUB_BUCKET = "tokos-local-stub";

function client() {
  return new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
}

export async function putObject(input: {
  organizationId: string;
  key: string;
  body: Buffer | string;
  contentType: string;
}) {
  if (!hasS3()) {
    return {
      provider: "stub" as const,
      bucket: STUB_BUCKET,
      key: input.key,
    };
  }

  const bucket = process.env.S3_BUCKET!;
  await client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }),
  );
  return { provider: "s3" as const, bucket, key: input.key };
}

/**
 * Presigns a *read*. This has to be GetObjectCommand — presigning a PutObjectCommand
 * yields an upload URL, which a browser <img> can never load.
 */
export async function signedGetUrl(bucket: string, key: string) {
  if (!hasS3() || bucket === STUB_BUCKET) return null;
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 60 * 15 },
  );
}
