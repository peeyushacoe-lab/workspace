import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export function isS3Configured(): boolean {
  return !!(
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  );
}

function getClient(): S3Client {
  if (!isS3Configured()) {
    throw new Error("File storage is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.");
  }
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export const bucketName = process.env.R2_BUCKET_NAME ?? "cybersage-attachments";

export async function uploadToR2(file: Buffer, key: string, contentType: string) {
  const client = getClient();
  await client.send(
    new PutObjectCommand({ Bucket: bucketName, Key: key, Body: file, ContentType: contentType }),
  );
  return { key, url: `${process.env.R2_PUBLIC_URL ?? ""}/${key}` };
}

export async function getAttachmentUrl(key: string, filename?: string): Promise<string> {
  const client = getClient();
  const disposition = filename
    ? `attachment; filename="${filename.replace(/"/g, '\\"')}"`
    : "attachment";
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
      ResponseContentDisposition: disposition,
    }),
    { expiresIn: 3600 },
  );
}
