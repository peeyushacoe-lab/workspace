import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { uploadToR2 } from "@/lib/s3";
import { isHRManager } from "@/lib/hr";

const CATEGORIES = ["CONTRACT", "OFFER_LETTER", "ID_DOCUMENT", "CERTIFICATE", "POLICY", "PAYSLIP", "OTHER"] as const;
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
const BLOCKED_EXT = new Set(["exe", "dll", "bat", "cmd", "sh", "ps1", "msi", "vbs", "scr", "com", "pif", "reg", "inf", "jar", "class"]);

const UPLOADER_SELECT = { id: true, fullName: true, avatarUrl: true } as const;

// GET /api/hr/documents            → my documents
// GET /api/hr/documents?userId=... → that user's documents (HR managers only)
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const targetId = searchParams.get("userId");
  if (targetId && targetId !== user.id && !isHRManager(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const documents = await prisma.hRDocument.findMany({
    where: { userId: targetId ?? user.id },
    include: { uploadedBy: { select: UPLOADER_SELECT } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ documents });
}

// POST /api/hr/documents — multipart form: file, title, category, userId?
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Multipart form expected" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File exceeds 20 MB" }, { status: 413 });

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (BLOCKED_EXT.has(ext)) return NextResponse.json({ error: "File type not allowed" }, { status: 415 });

  const targetId = String(form.get("userId") || user.id);
  if (targetId !== user.id && !isHRManager(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rawCategory = String(form.get("category") || "OTHER");
  const category = (CATEGORIES as readonly string[]).includes(rawCategory) ? rawCategory : "OTHER";
  const title = String(form.get("title") || file.name).slice(0, 200);

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `hr-documents/${targetId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
  await uploadToR2(buffer, key, file.type || "application/octet-stream");

  const created = await prisma.hRDocument.create({
    data: {
      userId: targetId,
      uploadedById: user.id,
      title,
      category: category as never,
      fileName: file.name,
      storageKey: key,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    },
    include: { uploadedBy: { select: UPLOADER_SELECT } },
  });
  return NextResponse.json(created, { status: 201 });
}

// DELETE /api/hr/documents?id=... — HR managers, or owner if they uploaded it themselves
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const doc = await prisma.hRDocument.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const canDelete = isHRManager(user.role) || (doc.userId === user.id && doc.uploadedById === user.id);
  if (!canDelete) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.hRDocument.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
