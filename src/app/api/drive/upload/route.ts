import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isS3Configured, uploadToR2, bucketName } from "@/lib/s3";
import { checkRateLimit } from "@/lib/rate-limit";
import { emitEvent } from "@/lib/events";
import { previewQueue } from "@/lib/queues/preview.queue";
import { securitySyncQueue } from "@/lib/queues/security-sync.queue";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

const ALLOWED_MIME_TYPES = new Set([
  // Images — include all common variants browsers/OSes may send
  "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp",
  "image/svg+xml", "image/bmp", "image/tiff", "image/avif",
  "image/heic", "image/heif",   // iOS / macOS HEIC photos
  "image/x-png", "image/pjpeg", // legacy browser MIME aliases
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Text
  "text/plain", "text/csv", "text/markdown", "text/html",
  // Data
  "application/json", "application/xml", "text/xml",
  // Archives
  "application/zip", "application/x-zip-compressed", "application/gzip",
  // Media
  "video/mp4", "video/webm", "video/quicktime",
  "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm",
  // Code/misc
  "application/octet-stream",
]);

const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".dll", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".vbs", ".js",
  ".jsx", ".ts", ".tsx", ".php", ".py", ".rb", ".pl", ".jar", ".class",
  ".scr", ".com", ".pif", ".reg", ".inf",
]);

function isAllowedFile(fileName: string, mimeType: string): string | null {
  const ext = "." + fileName.split(".").pop()?.toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return `File type ${ext} is not allowed for security reasons`;
  }
  const effectiveMime = mimeType || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(effectiveMime)) {
    return `MIME type '${effectiveMime}' is not permitted`;
  }
  return null;
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed: rlOk, retryAfter } = await checkRateLimit(`upload:${user.id}`, 30, 60 * 60);
  if (!rlOk) {
    return NextResponse.json({ error: "Upload rate limit reached. Try again later.", retryAfter }, { status: 429 });
  }

  if (!isS3Configured()) {
    return NextResponse.json(
      {
        error: "File storage is not configured.",
        hint: "Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME in your .env",
      },
      { status: 503 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const folderId = formData.get("folderId") as string | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 100 MB limit" }, { status: 413 });
  }

  const mimeError = isAllowedFile(file.name, file.type);
  if (mimeError) {
    return NextResponse.json({ error: mimeError }, { status: 415 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const key = `drive/${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const { url } = await uploadToR2(buffer, key, file.type || "application/octet-stream");

  // Check if a file with the same name already exists in this folder for this owner
  const existingFile = await prisma.driveFile.findFirst({
    where: {
      name: file.name,
      ownerId: user.id,
      folderId: folderId ?? null,
      isTrashed: false,
    },
  });

  let record;
  if (existingFile) {
    // Version bump: get current max versionNum
    const maxVersion = await prisma.driveFileVersion.aggregate({
      where: { fileId: existingFile.id },
      _max: { versionNum: true },
    });
    const nextVersionNum = (maxVersion._max.versionNum ?? 1) + 1;

    // Update the file to point to the new storage key
    record = await prisma.driveFile.update({
      where: { id: existingFile.id },
      data: {
        storageKey: key,
        storageUrl: url,
        size: BigInt(file.size),
        mimeType: file.type || "application/octet-stream",
      },
    });

    // Create new version record
    await prisma.driveFileVersion.create({
      data: {
        fileId: record.id,
        versionNum: nextVersionNum,
        storageKey: key,
        size: BigInt(file.size),
        uploadedBy: user.id,
      },
    });
  } else {
    // Brand new file
    record = await prisma.driveFile.create({
      data: {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: BigInt(file.size),
        folderId: folderId ?? null,
        ownerId: user.id,
        storageKey: key,
        storageUrl: url,
      },
    });

    await prisma.driveFileVersion.create({
      data: {
        fileId: record.id,
        versionNum: 1,
        storageKey: key,
        size: BigInt(file.size),
        uploadedBy: user.id,
      },
    });
  }

  emitEvent("FILE_UPLOADED", {
    fileId: record.id,
    fileName: record.name,
    fileSize: file.size,
    mimeType: record.mimeType,
    actorId: user.id,
    folderId: folderId ?? undefined,
  });

  previewQueue.add("generate-preview", {
    fileId: record.id,
    fileName: record.name,
    mimeType: record.mimeType,
    s3Key: key,
    actorId: user.id,
  }).catch(() => {});

  securitySyncQueue.add("scan-file", {
    type: "ANALYZE_FILE",
    fileId: record.id,
    fileName: record.name,
    mimeType: record.mimeType,
    s3Key: key,
  }).catch(() => {});

  return NextResponse.json(
    {
      ...record,
      size: record.size.toString(),
      bucket: bucketName,
    },
    { status: 201 }
  );
}
