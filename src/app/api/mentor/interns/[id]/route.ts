import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;
const PERSON_SELECT = { id: true, fullName: true, avatarUrl: true } as const;

// GET /api/mentor/interns/[id] — full intern profile for mentors
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !MENTOR_ROLES.includes(user.role as (typeof MENTOR_ROLES)[number])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const intern = await prisma.user.findFirst({
    where: { id, role: "INTERNSHIP" },
    select: {
      id: true, fullName: true, email: true, avatarUrl: true, isActive: true,
      createdAt: true, preferences: true, bio: true, phone: true, location: true,
    },
  });
  if (!intern) return NextResponse.json({ error: "Intern not found" }, { status: 404 });

  const [assignment, evaluations, notes, certificates, submissions, moduleCompletions, weekCompletions, weekCount] =
    await Promise.all([
      prisma.mentorAssignment.findUnique({
        where: { internId: id },
        include: { mentor: { select: PERSON_SELECT } },
      }),
      prisma.internEvaluation.findMany({
        where: { internId: id },
        include: { mentor: { select: PERSON_SELECT } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.mentorNote.findMany({
        where: { internId: id },
        include: { mentor: { select: PERSON_SELECT } },
        orderBy: { meetingDate: "desc" },
      }),
      prisma.internCertificate.findMany({
        where: { internId: id },
        include: { issuedBy: { select: PERSON_SELECT } },
        orderBy: { issuedAt: "desc" },
      }),
      prisma.internSubmission.findMany({
        where: { submitterId: id },
        include: {
          task: { select: { id: true, title: true } },
          reviews: { select: { verdict: true, score: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.internModuleCompletion.findMany({
        where: { internId: id },
        select: { score: true, createdAt: true, topic: { select: { title: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.internWeekCompletion.count({ where: { internId: id } }),
      prisma.internWeek.count(),
    ]);

  const prefs = (intern.preferences ?? {}) as { hr?: Record<string, string> };

  return NextResponse.json({
    intern: {
      id: intern.id,
      fullName: intern.fullName,
      email: intern.email,
      avatarUrl: intern.avatarUrl,
      isActive: intern.isActive,
      joinedAt: intern.createdAt,
      bio: intern.bio,
      phone: intern.phone,
      location: intern.location,
      hr: prefs.hr ?? {},
    },
    assignment,
    evaluations,
    notes,
    certificates,
    submissions,
    moduleCompletions,
    weeksDone: weekCompletions,
    weekCount,
  });
}
