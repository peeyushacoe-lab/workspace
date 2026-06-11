import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isS3Configured, uploadToR2, bucketName } from "@/lib/s3";
import { checkRateLimit } from "@/lib/rate-limit";
import { emitEvent } from "@/lib/events";

// Base64 upload variant of /api/drive/upload — used by the desktop client
// which cannot easily send multipart/form-data over IPC.
const MAX_FILE_SIZE = 100 * 1024 * 1024;

const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".dll", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".vbs",
  ".jar", ".class", ".scr", ".com", ".pif", ".reg", ".inf",
]);

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed: rlOk } = await checkRateLimit(`upload:${user.id}`, 30, 60 * 60);
  if (!rlOk) return NextResponse.json({ error: "Upload rate limit reached" }, { status: 429 });

  if (!isS3Configured()) return NextResponse.json({ error: "Storage not configured" }, { status: 503 });

  const body = await request.json() as { name: string; type: string; size: number; base64: string; folderId?: string | null };

  if (!body.name || !body.base64) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  if (body.size > MAX_FILE_SIZE) return NextResponse.json({ error: "File exceeds 100 MB" }, { status: 413 });

  const ext = "." + body.name.split(".").pop()?.toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ error: `File type ${ext} is not allowed` }, { status: 415 });
  }

  const buffer = Buffer.from(body.base64, "base64");
  const key = `drive/${user.id}/${Date.now()}-${body.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const mime = body.type || "application/octet-stream";

  const { url } = await uploadToR2(buffer, key, mime);

  const record = await prisma.driveFile.create({
    data: {
      name: body.name,
      mimeType: mime,
      size: BigInt(body.size),
      folderId: body.folderId ?? null,
      ownerId: user.id,
      storageKey: key,
      storageUrl: url,
    },
  });

  await prisma.driveFileVersion.create({
    data: { fileId: record.id, versionNum: 1, storageKey: key, size: BigInt(body.size), uploadedBy: user.id },
  });

  emitEvent("FILE_UPLOADED", {
    fileId: record.id, fileName: record.name, fileSize: body.size,
    mimeType: mime, actorId: user.id, folderId: body.folderId ?? undefined,
  });

  return NextResponse.json({ ...record, size: record.size.toString(), bucket: bucketName }, { status: 201 });
}
