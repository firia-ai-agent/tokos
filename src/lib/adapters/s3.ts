import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { hasS3 } from "@/lib/env";

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

export async function putSignedEvidence(input: {
  organizationId: string;
  key: string;
  body: Buffer | string;
  contentType: string;
}) {
  if (!hasS3()) {
    return {
      provider: "stub" as const,
      bucket: "tokos-local-stub",
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

export async function signedGetUrl(bucket: string, key: string) {
  if (!hasS3()) return null;
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 60 * 15 },
  );
}
