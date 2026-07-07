import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { getCurrentUser } from "@/lib/session";
import { uploadToR2, getAttachmentUrl } from "@/lib/s3";
import { isHRManager, listSignatories, SIGNATORIES_KEY, DEFAULT_SIGNATORIES, type Signatory } from "@/lib/hr";

const MAX_SIG_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED = new Set(["image/png", "image/jpeg"]);

/**
 * Letter signatories — whose name (and signature image) goes on
 * onboarding/offboarding letters and NOCs. The company stamp is always
 * hard-coded (public/cybersage-stamp.png) and is NOT configurable here.
 */

// GET /api/hr/signatories → { signatories: [{ id, name, title, builtIn, hasSignature, signatureUrl? }] }
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isHRManager(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const all = await listSignatories();
  const signatories = await Promise.all(
    all.map(async (s) => ({
      id: s.id,
      name: s.name,
      title: s.title,
      builtIn: !!s.builtIn,
      hasSignature: !!s.signatureKey,
      signatureUrl: s.signatureKey ? await getAttachmentUrl(s.signatureKey, undefined, true).catch(() => null) : null,
      updatedAt: s.updatedAt ?? null,
    })),
  );
  return NextResponse.json({ signatories });
}

// POST /api/hr/signatories — multipart form: id? (update), name, title, signature? (png/jpeg)
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isHRManager(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Multipart form expected" }, { status: 400 });

  const id = String(form.get("id") || `sig-${Date.now().toString(36)}`);
  const existing = (await listSignatories()).find((s) => s.id === id);
  const name = String(form.get("name") || existing?.name || "").trim().slice(0, 80);
  const title = String(form.get("title") || existing?.title || "").trim().slice(0, 80);
  if (!name || !title) return NextResponse.json({ error: "Name and title are required" }, { status: 400 });

  let signatureKey = existing?.signatureKey;
  let signatureMime = existing?.signatureMime;
  const file = form.get("signature");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_SIG_SIZE) return NextResponse.json({ error: "Signature image exceeds 2 MB" }, { status: 413 });
    if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Signature must be a PNG or JPEG" }, { status: 415 });
    signatureKey = `hr-signatures/${id}-${Date.now()}.${file.type === "image/png" ? "png" : "jpg"}`;
    await uploadToR2(Buffer.from(await file.arrayBuffer()), signatureKey, file.type);
    signatureMime = file.type;
  }

  const record: Signatory = { id, name, title, signatureKey, signatureMime, updatedAt: new Date().toISOString() };
  await redis.hset(SIGNATORIES_KEY, id, JSON.stringify(record));
  return NextResponse.json({ ok: true, signatory: { ...record, hasSignature: !!signatureKey } }, { status: 201 });
}

// DELETE /api/hr/signatories?id=…
// Custom signatories are removed; built-in defaults are reset (override cleared).
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isHRManager(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await redis.hdel(SIGNATORIES_KEY, id);
  const isBuiltIn = DEFAULT_SIGNATORIES.some((s) => s.id === id);
  return NextResponse.json({ ok: true, reset: isBuiltIn });
}
