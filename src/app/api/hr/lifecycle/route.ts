import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { uploadToR2 } from "@/lib/s3";
import { isHRManager, canManageLifecycle, MENTOR_MGMT_ROLES, DEFAULT_ONBOARDING, DEFAULT_OFFBOARDING, readLifecycle, writeLifecycle, getSignatory } from "@/lib/hr";
import { generateOnboardingLetter, generateOffboardingLetter, generateNocLetter, makeRef, type LetterSignatory } from "@/lib/hr-letters";
import { getAttachmentUrl } from "@/lib/s3";
import { sendEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications";

/**
 * Employee lifecycle — onboarding & offboarding letters + NOC.
 * State lives in user.preferences.hr.lifecycle (JSON — no migration); see @/lib/hr.
 */

type Prefs = Record<string, unknown>;

/** Resolve who signs the letter (falls back to the first configured signatory, then the actor). */
async function resolveSignatory(signatoryId: unknown, actorName: string): Promise<LetterSignatory> {
  const sig = await getSignatory(typeof signatoryId === "string" ? signatoryId : null).catch(() => null);
  if (!sig) return { name: actorName || "People Operations", title: "People Operations" };
  let signatureBytes: Uint8Array | null = null;
  if (sig.signatureKey) {
    try {
      const url = await getAttachmentUrl(sig.signatureKey, undefined, true);
      const res = await fetch(url);
      if (res.ok) signatureBytes = new Uint8Array(await res.arrayBuffer());
    } catch {
      /* letter still works without the image */
    }
  }
  return { name: sig.name, title: sig.title, signatureBytes, signatureMime: sig.signatureMime ?? null };
}

function readHrField(preferences: unknown, field: string): string | undefined {
  if (!preferences || typeof preferences !== "object") return undefined;
  const hr = (preferences as Prefs).hr;
  if (!hr || typeof hr !== "object") return undefined;
  const v = (hr as Prefs)[field];
  return typeof v === "string" && v ? v : undefined;
}

function readEmployeeId(preferences: unknown): string | null {
  if (!preferences || typeof preferences !== "object") return null;
  const v = (preferences as Prefs).employeeId ?? readHrField(preferences, "employeeId");
  return typeof v === "string" && v ? v : null;
}

async function storeLetter(opts: {
  userId: string;
  actorId: string;
  bytes: Uint8Array;
  fileName: string;
  title: string;
  category: "OFFER_LETTER" | "CERTIFICATE" | "OTHER";
}) {
  const key = `hr-documents/${opts.userId}/${Date.now()}-${opts.fileName}`;
  await uploadToR2(Buffer.from(opts.bytes), key, "application/pdf");
  return prisma.hRDocument.create({
    data: {
      userId: opts.userId,
      uploadedById: opts.actorId,
      title: opts.title,
      category: opts.category as never,
      fileName: opts.fileName,
      storageKey: key,
      mimeType: "application/pdf",
      size: opts.bytes.byteLength,
    },
  });
}

async function emailLetter(opts: {
  to: { name: string; email: string };
  subject: string;
  body: string;
  fileName: string;
  bytes: Uint8Array;
}) {
  try {
    await sendEmail(
      opts.subject,
      opts.body,
      { name: opts.to.name, email: opts.to.email, status: "hr" },
      undefined, undefined, undefined, undefined, undefined,
      [{ filename: opts.fileName, content: Buffer.from(opts.bytes) }],
    );
  } catch (err) {
    console.error("[hr/lifecycle] email failed:", (err as Error).message);
  }
}

async function applyChecklist(userId: string, kind: "ONBOARDING" | "OFFBOARDING", actorId: string) {
  const existing = await prisma.onboardingItem.count({ where: { userId, kind } });
  if (existing > 0) return;
  const template = kind === "ONBOARDING" ? DEFAULT_ONBOARDING : DEFAULT_OFFBOARDING;
  await prisma.onboardingItem.createMany({
    data: template.map((t, i) => ({
      userId, kind, title: t.title, description: t.description, order: i, createdById: actorId,
    })),
  });
}

// GET /api/hr/lifecycle           → my lifecycle
// GET /api/hr/lifecycle?userId=…  → that user's lifecycle (HR only)
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const targetId = searchParams.get("userId");

  const target = await prisma.user.findUnique({
    where: { id: targetId ?? user.id },
    select: { preferences: true, role: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Own lifecycle is always readable; others need HR, or MGMT for interns.
  if (targetId && targetId !== user.id && !canManageLifecycle(user.role, target.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ lifecycle: readLifecycle(target.preferences) });
}

// POST /api/hr/lifecycle — HR actions
// { action: "onboard", userId }
// { action: "offboard", userId, type: "RESIGNATION"|"TERMINATION", lastWorkingDay, reason? }
// { action: "mark-signed", userId }
// { action: "issue-noc", userId }
export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // HR manages everyone; mentors (MGMT) manage interns — verified against the
  // target's role after it is loaded below.
  if (!isHRManager(actor.role) && !(MENTOR_MGMT_ROLES as readonly string[]).includes(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const action = String(body.action ?? "");
  const userId = String(body.userId ?? "");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, email: true, jobTitle: true, department: true, preferences: true, createdAt: true, role: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!canManageLifecycle(actor.role, target.role)) {
    return NextResponse.json({ error: "Mentors can only manage intern lifecycles" }, { status: 403 });
  }
  if (target.id === actor.id && action !== "onboard") {
    return NextResponse.json({ error: "You cannot offboard yourself" }, { status: 400 });
  }

  const person = {
    fullName: target.fullName,
    email: target.email,
    employeeId: readEmployeeId(target.preferences),
    jobTitle: target.jobTitle ?? readHrField(target.preferences, "jobTitle"),
    department: target.department ?? readHrField(target.preferences, "department"),
  };
  const lifecycle = readLifecycle(target.preferences);
  const signatory = await resolveSignatory(body.signatoryId, actor.fullName ?? "");

  // ── onboard ────────────────────────────────────────────────────────────────
  if (action === "onboard") {
    const ref = makeRef("ONB");
    const startDateStr = readHrField(target.preferences, "startDate");
    const bytes = await generateOnboardingLetter({
      person,
      ref,
      joiningDate: startDateStr ? new Date(startDateStr) : target.createdAt,
      reportingManager: readHrField(target.preferences, "reportingManager"),
      signatory,
    });
    const fileName = `onboarding-letter-${ref}.pdf`;
    const doc = await storeLetter({ userId, actorId: actor.id, bytes, fileName, title: `Onboarding letter ${ref}`, category: "OFFER_LETTER" });
    await applyChecklist(userId, "ONBOARDING", actor.id);
    const updated = await writeLifecycle(userId, {
      status: "ONBOARDING", ref, letterDocId: doc.id, letterSentAt: new Date().toISOString(),
      signedDocId: undefined, signedReturnedAt: undefined, confidentialityAckAt: undefined, signedVerifiedAt: undefined,
    });
    await emailLetter({
      to: { name: target.fullName, email: target.email },
      subject: `Welcome to Cybersage — your onboarding letter (${ref})`,
      body: `Hi ${target.fullName.split(" ")[0]},\n\nWelcome aboard! Your onboarding letter is attached.\n\nPlease sign it and return it via the My HR page within 7 days. Your onboarding checklist is waiting for you there too.\n\n— People Operations, Cybersage`,
      fileName, bytes,
    });
    await createNotification({
      userId, type: "SYSTEM", title: "Your onboarding letter is ready",
      body: "Download it from My HR, sign it and return it within 7 days.", link: "/hr",
    }).catch(() => {});
    return NextResponse.json({ ok: true, lifecycle: updated });
  }

  // ── offboard ───────────────────────────────────────────────────────────────
  if (action === "offboard") {
    const type = body.type === "TERMINATION" ? "TERMINATION" : body.type === "RESIGNATION" ? "RESIGNATION" : null;
    if (!type) return NextResponse.json({ error: "type must be RESIGNATION or TERMINATION" }, { status: 400 });
    const lwd = typeof body.lastWorkingDay === "string" ? new Date(body.lastWorkingDay) : null;
    if (!lwd || isNaN(lwd.getTime())) return NextResponse.json({ error: "lastWorkingDay required" }, { status: 400 });
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 300) : undefined;

    const ref = makeRef("OFF");
    const bytes = await generateOffboardingLetter({
      person, ref, type, lastWorkingDay: lwd, reason,
      handoverOwner: readHrField(target.preferences, "reportingManager"),
      signatory,
    });
    const fileName = `exit-letter-${ref}.pdf`;
    const doc = await storeLetter({ userId, actorId: actor.id, bytes, fileName, title: `Exit letter ${ref} (${type.toLowerCase()})`, category: "OTHER" });
    await applyChecklist(userId, "OFFBOARDING", actor.id);
    const updated = await writeLifecycle(userId, {
      status: "OFFBOARDING", type, ref, letterDocId: doc.id, letterSentAt: new Date().toISOString(),
      lastWorkingDay: lwd.toISOString(), reason,
      signedDocId: undefined, signedReturnedAt: undefined, confidentialityAckAt: undefined, signedVerifiedAt: undefined,
      nocRef: undefined, nocDocId: undefined, nocIssuedAt: undefined,
    });
    await emailLetter({
      to: { name: target.fullName, email: target.email },
      subject: type === "RESIGNATION"
        ? `Your resignation has been accepted — exit letter (${ref})`
        : `Notice of termination of employment (${ref})`,
      body: `Hi ${target.fullName.split(" ")[0]},\n\nYour exit letter is attached.\n\nPlease sign it and return it via the My HR page, and acknowledge the confidentiality declaration there. Your No Objection Certificate (NOC) will be issued once the signed copy is received and your offboarding checklist is cleared.\n\n— People Operations, Cybersage`,
      fileName, bytes,
    });
    await createNotification({
      userId, type: "SYSTEM", title: "Your exit letter is ready",
      body: "Download it from My HR, sign it and return it to receive your NOC.", link: "/hr",
    }).catch(() => {});
    return NextResponse.json({ ok: true, lifecycle: updated });
  }

  // ── mark-signed (HR verifies the returned signed copy) ─────────────────────
  if (action === "mark-signed") {
    if (!lifecycle.status || lifecycle.status === "EXITED") {
      return NextResponse.json({ error: "No open onboarding/offboarding for this user" }, { status: 400 });
    }
    const updated = await writeLifecycle(userId, {
      signedVerifiedAt: new Date().toISOString(),
      signedReturnedAt: lifecycle.signedReturnedAt ?? new Date().toISOString(),
      // Onboarding completes as soon as HR verifies the signed letter
      ...(lifecycle.status === "ONBOARDING" ? { status: "ACTIVE" as const } : {}),
    });
    await createNotification({
      userId, type: "SYSTEM",
      title: lifecycle.status === "ONBOARDING" ? "Onboarding letter verified — welcome!" : "Signed exit letter verified",
      body: lifecycle.status === "ONBOARDING" ? "Your signed onboarding letter has been verified by HR." : "HR has verified your signed exit letter. Your NOC will follow shortly.",
      link: "/hr",
    }).catch(() => {});
    return NextResponse.json({ ok: true, lifecycle: updated });
  }

  // ── issue-noc ──────────────────────────────────────────────────────────────
  if (action === "issue-noc") {
    if (lifecycle.status !== "OFFBOARDING" || !lifecycle.type) {
      return NextResponse.json({ error: "User is not offboarding" }, { status: 400 });
    }
    if (!lifecycle.signedVerifiedAt && !lifecycle.signedReturnedAt) {
      return NextResponse.json({ error: "Signed exit letter must be returned (or marked received) before issuing the NOC" }, { status: 400 });
    }

    const nocRef = makeRef("NOC");
    const startDateStr = readHrField(target.preferences, "startDate");
    const exitDate = lifecycle.lastWorkingDay ? new Date(lifecycle.lastWorkingDay) : new Date();
    const bytes = await generateNocLetter({
      person, ref: nocRef, type: lifecycle.type,
      joinDate: startDateStr ? new Date(startDateStr) : target.createdAt,
      exitDate,
      signedReturnedAt: lifecycle.signedReturnedAt ? new Date(lifecycle.signedReturnedAt) : null,
      confidentialityAckAt: lifecycle.confidentialityAckAt ? new Date(lifecycle.confidentialityAckAt) : null,
      signatory,
    });
    const fileName = `NOC-${nocRef}.pdf`;
    const doc = await storeLetter({ userId, actorId: actor.id, bytes, fileName, title: `No Objection Certificate ${nocRef}`, category: "CERTIFICATE" });

    // Mark offboarding checklist fully complete
    await prisma.onboardingItem.updateMany({
      where: { userId, kind: "OFFBOARDING", completedAt: null },
      data: { completedAt: new Date() },
    }).catch(() => {});

    const updated = await writeLifecycle(userId, {
      status: "EXITED", nocRef, nocDocId: doc.id, nocIssuedAt: new Date().toISOString(),
    });

    // Reflect exit on the HR record's employment status
    const fresh = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
    const prefs: Prefs = fresh?.preferences && typeof fresh.preferences === "object" ? { ...(fresh.preferences as Prefs) } : {};
    const hr: Prefs = prefs.hr && typeof prefs.hr === "object" ? { ...(prefs.hr as Prefs) } : {};
    hr.employmentStatus = "Terminated";
    hr.endDate = exitDate.toISOString().slice(0, 10);
    prefs.hr = hr;
    await prisma.user.update({ where: { id: userId }, data: { preferences: prefs as never } }).catch(() => {});

    await emailLetter({
      to: { name: target.fullName, email: target.email },
      subject: `Your No Objection Certificate (${nocRef}) — Cybersage`,
      body: `Hi ${target.fullName.split(" ")[0]},\n\nYour exit from Cybersage is complete and your No Objection Certificate is attached. It confirms you are no longer associated with the company and records your confidentiality acknowledgment.\n\nWe wish you all the best.\n\n— People Operations, Cybersage`,
      fileName, bytes,
    });
    await createNotification({
      userId, type: "SYSTEM", title: "Your NOC has been issued",
      body: "Your exit is complete. The certificate is on My HR and in your email.", link: "/hr",
    }).catch(() => {});
    return NextResponse.json({ ok: true, lifecycle: updated });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
