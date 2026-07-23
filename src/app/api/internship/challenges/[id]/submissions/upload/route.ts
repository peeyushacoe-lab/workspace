import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { isS3Configured, uploadToR2 } from "@/lib/s3";
import { checkRateLimit } from "@/lib/rate-limit";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;
const HUB_ROLES = ["INTERNSHIP", ...MENTOR_ROLES] as const;

async function isMentorUser(userId: string, role: string): Promise<boolean> {
  if (MENTOR_ROLES.includes(role as typeof MENTOR_ROLES[number])) return true;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  const prefs = (user?.preferences as Record<string, unknown> | null) ?? {};
  const granted: string[] = Array.isArray(prefs.grantedRoles) ? (prefs.grantedRoles as string[]) : [];
  return granted.includes("Mentor");
}

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB — report files only, not full evidence archives

// Only report-style documents are accepted here — screenshots/evidence belong in the
// notes/links fields or a Drive folder, this endpoint exists specifically so teams can
// attach their PDF/Word report directly on the competition page (no separate file host needed).
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const ALLOWED_EXTENSIONS = new Set([".pdf", ".doc", ".docx"]);

function isAllowedReportFile(fileName: string, mimeType: string): string | null {
  const ext = "." + (fileName.split(".").pop()?.toLowerCase() ?? "");
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return "Only PDF (.pdf) or Word (.doc, .docx) files can be attached to a submission";
  }
  const baseMime = (mimeType || "application/octet-stream").split(";")[0].trim();
  // Some browsers send application/octet-stream for .docx — extension check above already
  // narrowed this down, so don't hard-fail on MIME alone, just prefer the known types.
  if (baseMime !== "application/octet-stream" && !ALLOWED_MIME_TYPES.has(baseMime)) {
    return "Only PDF (.pdf) or Word (.doc, .docx) files can be attached to a submission";
  }
  return null;
}

// Uploads a team's PDF/Word report to R2 and returns {name, url, type, size} — the caller
// (submission form) then includes that in the POST to .../submissions to attach it.
// This intentionally does NOT create a DriveFile record: challenge report attachments are
// scoped to the challenge, not the submitter's personal Drive, and don't need preview/
// indexing/security-scan queue jobs a full Drive upload triggers.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentUser();
  if (!session || !HUB_ROLES.includes(session.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { id } = await params;

  const { allowed: rlOk, retryAfter } = await checkRateLimit(`challenge-upload:${session.id}`, 20, 60 * 60);
  if (!rlOk) {
    return NextResponse.json({ error: "Upload rate limit reached. Try again later.", retryAfter }, { status: 429 });
  }

  if (!isS3Configured()) {
    return NextResponse.json(
      { error: "File storage is not configured.", hint: "Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME in your .env" },
      { status: 503 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const teamId = formData.get("teamId") as string | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!teamId) return NextResponse.json({ error: "teamId is required" }, { status: 400 });

  const team = await prisma.challengeTeam.findUnique({ where: { id: teamId } });
  if (!team || team.challengeId !== id) {
    return NextResponse.json({ error: "Team does not belong to this challenge" }, { status: 400 });
  }
  const mentor = await isMentorUser(session.id, session.role);
  const isMember = team.memberIds.includes(session.id) || team.leadId === session.id;
  if (!mentor && !isMember) {
    return NextResponse.json({ error: "Only members of this team can upload a submission file" }, { status: 403 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 25 MB limit" }, { status: 413 });
  }
  const mimeError = isAllowedReportFile(file.name, file.type);
  if (mimeError) return NextResponse.json({ error: mimeError }, { status: 415 });

  const cleanMime = (file.type || "application/octet-stream").split(";")[0].trim();
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `challenges/${id}/${teamId}/${Date.now()}-${safeName}`;

  await uploadToR2(buffer, key, cleanMime);

  // Store our own download-proxy path (never a raw R2 URL — see CLAUDE.md Attachment
  // Downloads note) so this works whether or not R2_PUBLIC_URL is configured, and so
  // access can be gated by session on every download.
  const proxyUrl = `/api/internship/challenges/files?key=${encodeURIComponent(key)}&name=${encodeURIComponent(file.name)}`;

  return NextResponse.json(
    { name: file.name, url: proxyUrl, type: cleanMime, size: file.size },
    { status: 201 },
  );
}
