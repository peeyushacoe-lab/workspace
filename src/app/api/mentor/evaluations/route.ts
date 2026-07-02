import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;
const RUBRIC = ["technical", "communication", "initiative", "reliability", "teamwork"] as const;

function isMentor(role: string) {
  return (MENTOR_ROLES as readonly string[]).includes(role);
}

// GET /api/mentor/evaluations?internId=...
// Mentors: any intern. Interns: only their own (id ignored, forced to self).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  let internId = searchParams.get("internId");

  if (user.role === "INTERNSHIP") internId = user.id;
  else if (!isMentor(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!internId) return NextResponse.json({ error: "internId required" }, { status: 400 });

  const evaluations = await prisma.internEvaluation.findMany({
    where: { internId },
    include: { mentor: { select: { id: true, fullName: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ evaluations });
}

// POST /api/mentor/evaluations — { internId, period, isFinal?, scores: {...1-5}, strengths?, improvements?, comment? }
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isMentor(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body?.internId || !body?.period || typeof body.scores !== "object" || body.scores === null) {
    return NextResponse.json({ error: "internId, period and scores required" }, { status: 400 });
  }

  const scores: Record<string, number> = {};
  for (const k of RUBRIC) {
    const v = Number(body.scores[k]);
    if (!Number.isFinite(v) || v < 1 || v > 5) {
      return NextResponse.json({ error: `Score "${k}" must be 1-5` }, { status: 400 });
    }
    scores[k] = v;
  }
  const overall = Math.round((RUBRIC.reduce((sum, k) => sum + scores[k], 0) / RUBRIC.length) * 10) / 10;

  const intern = await prisma.user.findFirst({ where: { id: body.internId, role: "INTERNSHIP" }, select: { id: true } });
  if (!intern) return NextResponse.json({ error: "Intern not found" }, { status: 404 });

  const created = await prisma.internEvaluation.create({
    data: {
      internId: body.internId,
      mentorId: user.id,
      period: String(body.period).slice(0, 60),
      isFinal: Boolean(body.isFinal),
      scores,
      overall,
      strengths: typeof body.strengths === "string" ? body.strengths.slice(0, 2000) : null,
      improvements: typeof body.improvements === "string" ? body.improvements.slice(0, 2000) : null,
      comment: typeof body.comment === "string" ? body.comment.slice(0, 2000) : null,
    },
    include: { mentor: { select: { id: true, fullName: true, avatarUrl: true } } },
  });

  await prisma.notification
    .create({
      data: {
        userId: body.internId,
        type: "SYSTEM",
        title: "New evaluation",
        body: `${user.fullName} evaluated your ${created.period} performance (${overall}/5)`,
        link: "/internship",
      },
    })
    .catch(() => {});

  return NextResponse.json(created, { status: 201 });
}

// DELETE /api/mentor/evaluations?id=... — author or ADMIN
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isMentor(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const evaluation = await prisma.internEvaluation.findUnique({ where: { id } });
  if (!evaluation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (evaluation.mentorId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.internEvaluation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
