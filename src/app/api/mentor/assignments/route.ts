import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;

function isMentor(role: string) {
  return (MENTOR_ROLES as readonly string[]).includes(role);
}

// GET /api/mentor/assignments — all assignments + available mentors
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isMentor(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [assignments, mentors] = await Promise.all([
    prisma.mentorAssignment.findMany({
      include: {
        mentor: { select: { id: true, fullName: true, avatarUrl: true } },
        intern: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: { in: MENTOR_ROLES as never }, isActive: true },
      select: { id: true, fullName: true, avatarUrl: true, role: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  return NextResponse.json({ assignments, mentors });
}

// PUT /api/mentor/assignments — { internId, mentorId } (mentorId null/empty = unassign)
export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isMentor(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body?.internId) return NextResponse.json({ error: "internId required" }, { status: 400 });

  if (!body.mentorId) {
    await prisma.mentorAssignment.deleteMany({ where: { internId: body.internId } });
    return NextResponse.json({ ok: true, assigned: false });
  }

  const [intern, mentor] = await Promise.all([
    prisma.user.findFirst({ where: { id: body.internId, role: "INTERNSHIP" }, select: { id: true, fullName: true } }),
    prisma.user.findFirst({ where: { id: body.mentorId, role: { in: MENTOR_ROLES as never } }, select: { id: true, fullName: true } }),
  ]);
  if (!intern || !mentor) return NextResponse.json({ error: "Invalid intern or mentor" }, { status: 400 });

  const assignment = await prisma.mentorAssignment.upsert({
    where: { internId: body.internId },
    create: { internId: body.internId, mentorId: body.mentorId },
    update: { mentorId: body.mentorId },
    include: { mentor: { select: { id: true, fullName: true, avatarUrl: true } } },
  });

  await prisma.notification
    .create({
      data: {
        userId: intern.id,
        type: "SYSTEM",
        title: "Mentor assigned",
        body: `${mentor.fullName} is now your mentor`,
        link: "/internship",
      },
    })
    .catch(() => {});

  return NextResponse.json(assignment);
}
