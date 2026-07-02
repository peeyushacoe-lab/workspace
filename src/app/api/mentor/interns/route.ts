import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;

// GET /api/mentor/interns — roster with per-intern aggregates (mentors only)
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !MENTOR_ROLES.includes(user.role as (typeof MENTOR_ROLES)[number])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [interns, weekCount, assignments] = await Promise.all([
    prisma.user.findMany({
      where: { role: "INTERNSHIP" },
      select: {
        id: true, fullName: true, email: true, avatarUrl: true, isActive: true,
        createdAt: true, preferences: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.internWeek.count(),
    prisma.mentorAssignment.findMany({
      include: { mentor: { select: { id: true, fullName: true, avatarUrl: true } } },
    }),
  ]);

  const internIds = interns.map((i) => i.id);
  const [moduleAgg, weekComps, reviews, evals, certs, pendingSubs] = await Promise.all([
    prisma.internModuleCompletion.groupBy({
      by: ["internId"],
      where: { internId: { in: internIds } },
      _avg: { score: true },
      _count: { id: true },
    }),
    prisma.internWeekCompletion.groupBy({
      by: ["internId"],
      where: { internId: { in: internIds } },
      _count: { id: true },
    }),
    prisma.internReview.findMany({
      where: { submission: { submitterId: { in: internIds } }, score: { not: null } },
      select: { score: true, submission: { select: { submitterId: true } } },
    }),
    prisma.internEvaluation.findMany({
      where: { internId: { in: internIds } },
      orderBy: { createdAt: "desc" },
      select: { internId: true, overall: true, period: true, isFinal: true, createdAt: true },
    }),
    prisma.internCertificate.groupBy({
      by: ["internId"],
      where: { internId: { in: internIds } },
      _count: { id: true },
    }),
    prisma.internSubmission.groupBy({
      by: ["submitterId"],
      where: { submitterId: { in: internIds }, status: "submitted" },
      _count: { id: true },
    }),
  ]);

  const modByIntern = Object.fromEntries(moduleAgg.map((m) => [m.internId, m]));
  const weeksByIntern = Object.fromEntries(weekComps.map((w) => [w.internId, w._count.id]));
  const certByIntern = Object.fromEntries(certs.map((c) => [c.internId, c._count.id]));
  const pendingByIntern = Object.fromEntries(pendingSubs.map((p) => [p.submitterId, p._count.id]));
  const assignByIntern = Object.fromEntries(assignments.map((a) => [a.internId, a.mentor]));

  const reviewScores: Record<string, number[]> = {};
  for (const r of reviews) {
    (reviewScores[r.submission.submitterId] ??= []).push(r.score as number);
  }
  const latestEval: Record<string, (typeof evals)[number]> = {};
  for (const e of evals) if (!latestEval[e.internId]) latestEval[e.internId] = e;

  const rows = interns.map((i) => {
    const prefs = (i.preferences ?? {}) as { hr?: { employeeId?: string; startDate?: string; endDate?: string } };
    const scores = reviewScores[i.id] ?? [];
    return {
      id: i.id,
      fullName: i.fullName,
      email: i.email,
      avatarUrl: i.avatarUrl,
      isActive: i.isActive,
      joinedAt: i.createdAt,
      employeeId: prefs.hr?.employeeId ?? null,
      startDate: prefs.hr?.startDate ?? null,
      endDate: prefs.hr?.endDate ?? null,
      mentor: assignByIntern[i.id] ?? null,
      quizAvg: modByIntern[i.id]?._avg.score != null ? Math.round(modByIntern[i.id]._avg.score as number) : null,
      modulesDone: modByIntern[i.id]?._count.id ?? 0,
      weeksDone: weeksByIntern[i.id] ?? 0,
      weekCount,
      taskAvg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      reviewedTasks: scores.length,
      pendingSubmissions: pendingByIntern[i.id] ?? 0,
      latestEval: latestEval[i.id] ?? null,
      certificates: certByIntern[i.id] ?? 0,
    };
  });

  return NextResponse.json({ interns: rows });
}
