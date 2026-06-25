import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;

// Mentor can manually set punch in/out times for an intern on a specific date
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !MENTOR_ROLES.includes(user.role as typeof MENTOR_ROLES[number])) {
    return NextResponse.json({ error: "Only mentors can override attendance" }, { status: 403 });
  }

  const body = await request.json() as {
    internId: string;
    date: string;        // YYYY-MM-DD
    punchIn?: string;    // ISO datetime
    punchOut?: string;   // ISO datetime
    reason?: string;
  };

  if (!body.internId || !body.date) {
    return NextResponse.json({ error: "internId and date are required" }, { status: 400 });
  }

  // Verify intern exists
  const intern = await prisma.user.findUnique({
    where: { id: body.internId },
    select: { id: true, role: true },
  });
  if (!intern) return NextResponse.json({ error: "Intern not found" }, { status: 404 });

  // Upsert override: delete any existing override for this intern+date then create
  // Note: filter by targetId only (not actorId) so any mentor can update a prior mentor's override
  await prisma.auditLog.deleteMany({
    where: {
      action: "INTERN_ATTENDANCE_OVERRIDE",
      targetType: "attendance",
      targetId: `${body.internId}:${body.date}`,
    },
  });

  const log = await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "INTERN_ATTENDANCE_OVERRIDE",
      targetType: "attendance",
      targetId: `${body.internId}:${body.date}`,
      metadata: {
        internId: body.internId,
        date: body.date,
        punchIn: body.punchIn ?? null,
        punchOut: body.punchOut ?? null,
        reason: body.reason ?? null,
        setBy: user.id,
      },
    },
  });

  return NextResponse.json({ success: true, id: log.id });
}
