import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export function isS3Configured(): boolean {
  return !!(
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  );
}

// ---------------------------------------------------------------------------
// R2_PUBLIC_URL warning — emitted once at module load time.
// Without this var every attachment download is a round-trip through a Vercel
// function (signed URL proxy), which burns execution budget fast on high-traffic
// instances. Set R2_PUBLIC_URL to your R2 bucket's public hostname or a CDN
// in front of it (e.g. https://assets.nexus.cybersage.uk).
// ---------------------------------------------------------------------------
if (
  typeof process !== "undefined" &&
  process.env.NODE_ENV === "production" &&
  isS3Configured() &&
  !process.env.R2_PUBLIC_URL
) {
  console.warn(
    "[s3] WARNING: R2_PUBLIC_URL is not set. All file downloads will be proxied through Vercel functions " +
    "instead of serving directly from R2/CDN. Set R2_PUBLIC_URL in your Vercel environment variables " +
    "to avoid excessive function invocation costs."
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

/** Downloads an object's full body into memory. Used by the account-export
 * worker to bundle Drive files into a zip — for large-scale streaming use
 * a presigned URL (getAttachmentUrl) instead of buffering. */
export async function downloadFromR2(key: string): Promise<Buffer> {
  const client = getClient();
  const result = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
  const body = result.Body;
  if (!body) throw new Error(`Empty body for R2 key: ${key}`);
  const chunks: Uint8Array[] = [];
  // AWS SDK v3 Body is a web/node stream depending on runtime — both are async-iterable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const chunk of body as any) {
    chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
  }
  return Buffer.concat(chunks);
}

export async function getAttachmentUrl(key: string, filename?: string, inline = false): Promise<string> {
  const client = getClient();
  const dispType = inline ? "inline" : "attachment";
  const disposition = filename
    ? `${dispType}; filename="${filename.replace(/"/g, '\\"')}"`
    : dispType;
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
