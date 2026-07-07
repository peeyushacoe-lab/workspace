import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { uploadToR2 } from "@/lib/s3";
import { readLifecycle, writeLifecycle } from "@/lib/hr";
import { createNotification } from "@/lib/notifications";

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg"]);

/**
 * POST /api/hr/lifecycle/return — employee returns their signed letter.
 * Multipart form: file (signed PDF/scan), ack ("true" — confidentiality acknowledgment, required).
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { preferences: true, fullName: true } });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const lifecycle = readLifecycle(me.preferences);
  if (lifecycle.status !== "ONBOARDING" && lifecycle.status !== "OFFBOARDING") {
    return NextResponse.json({ error: "You have no letter awaiting signature" }, { status: 400 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Multipart form expected" }, { status: 400 });

  if (String(form.get("ack")) !== "true") {
    return NextResponse.json(
      { error: "You must acknowledge the confidentiality declaration — you may not leak or retain any Cybersage product details after your association ends." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Signed letter file required" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File exceeds 20 MB" }, { status: 413 });
  const mime = file.type || "application/octet-stream";
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_MIME.has(mime) && !["pdf", "png", "jpg", "jpeg"].includes(ext)) {
    return NextResponse.json({ error: "Upload the signed letter as a PDF or image" }, { status: 415 });
  }

  const kindLabel = lifecycle.status === "ONBOARDING" ? "onboarding" : "exit";
  const key = `hr-documents/${user.id}/${Date.now()}-signed-${kindLabel}-letter-${file.name.replace(/[^\w.\-]/g, "_")}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await uploadToR2(buffer, key, mime);

  const doc = await prisma.hRDocument.create({
    data: {
      userId: user.id,
      uploadedById: user.id,
      title: `Signed ${kindLabel} letter${lifecycle.ref ? ` ${lifecycle.ref}` : ""}`,
      category: "CONTRACT" as never,
      fileName: file.name,
      storageKey: key,
      mimeType: mime,
      size: file.size,
    },
  });

  const now = new Date().toISOString();
  const updated = await writeLifecycle(user.id, {
    signedDocId: doc.id,
    signedReturnedAt: now,
    confidentialityAckAt: now,
  });

  // Let every HR manager know the signed copy is back
  const hrUsers = await prisma.user.findMany({ where: { role: "HR" as never }, select: { id: true } }).catch(() => []);
  await Promise.all(
    hrUsers.map((h) =>
      createNotification({
        userId: h.id,
        type: "SYSTEM",
        title: `${me.fullName} returned their signed ${kindLabel} letter`,
        body: "Confidentiality acknowledged. Review it in HR → People.",
        link: "/admin/hr?tab=people",
      }).catch(() => {}),
    ),
  );

  return NextResponse.json({ ok: true, lifecycle: updated });
}
