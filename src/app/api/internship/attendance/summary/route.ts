import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Returns working days (Mon-Fri) between two date strings inclusive
function workingDaysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const cur = new Date(from + "T12:00:00Z");
  const end = new Date(to + "T12:00:00Z");
  while (cur <= end) {
    const dow = cur.getUTCDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) days.push(toDateStr(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !MENTOR_ROLES.includes(user.role as typeof MENTOR_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? toDateStr(new Date(Date.now() - 29 * 86400_000));
  const to   = searchParams.get("to")   ?? toDateStr(new Date());

  const fromDate = new Date(from + "T00:00:00.000Z");
  const toDate   = new Date(to   + "T23:59:59.999Z");

  // All active interns
  const interns = await prisma.user.findMany({
    where: { role: "INTERNSHIP", isActive: true },
    select: { id: true, fullName: true, avatarUrl: true },
    orderBy: { fullName: "asc" },
  });

  if (interns.length === 0) return NextResponse.json([]);

  // All punch events in range
  const punches = await prisma.auditLog.findMany({
    where: {
      actorId: { in: interns.map(i => i.id) },
      action: "INTERN_PUNCH_IN",
      createdAt: { gte: fromDate, lte: toDate },
    },
    select: { actorId: true, createdAt: true },
  });

  // All overrides in range (treat override with punchIn as present)
  const overrides = await prisma.auditLog.findMany({
    where: {
      action: "INTERN_ATTENDANCE_OVERRIDE",
      targetType: "attendance",
      createdAt: { gte: fromDate, lte: toDate },
    },
    select: { targetId: true, metadata: true },
    orderBy: { createdAt: "desc" },
  });

  const workingDays = workingDaysBetween(from, to);
  const totalWorkingDays = workingDays.length;

  // Build a set of "internId:YYYY-MM-DD" for days they punched in
  const presentSet = new Set<string>();
  for (const p of punches) {
    const dateStr = toDateStr(p.createdAt);
    presentSet.add(`${p.actorId}:${dateStr}`);
  }

  // Process overrides — targetId is "internId:YYYY-MM-DD"
  const seenOverrides = new Set<string>();
  for (const ov of overrides) {
    if (!ov.targetId || seenOverrides.has(ov.targetId)) continue;
    seenOverrides.add(ov.targetId);
    const meta = ov.metadata as { punchIn?: string | null } | null;
    if (meta?.punchIn) {
      presentSet.add(ov.targetId); // has a punchIn = present
    }
  }

  const result = interns.map(intern => {
    const presentDays = workingDays.filter(d => presentSet.has(`${intern.id}:${d}`));
    const absentDays  = workingDays.filter(d => !presentSet.has(`${intern.id}:${d}`));

    return {
      intern: { id: intern.id, fullName: intern.fullName, avatarUrl: intern.avatarUrl },
      totalWorkingDays,
      daysPresent: presentDays.length,
      daysAbsent: absentDays.length,
      attendanceRate: totalWorkingDays > 0 ? Math.round((presentDays.length / totalWorkingDays) * 100) : 0,
      absentDates: absentDays,
      presentDates: presentDays,
    };
  });

  return NextResponse.json({ from, to, totalWorkingDays, interns: result });
}
