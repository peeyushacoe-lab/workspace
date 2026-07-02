import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { isHRManager } from "@/lib/hr";

// GET /api/hr/summary — HR dashboard stats (HR managers only)
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isHRManager(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayEnd = new Date(+todayStart + 86400_000 - 1);
  const in30d = new Date(+now + 30 * 86400_000);

  const [staffCount, internCount, pendingLeave, onLeaveToday, upcomingHolidays, users, incompleteOnboarding] =
    await Promise.all([
      prisma.user.count({ where: { role: { not: "INTERNSHIP" as never }, isActive: true } }),
      prisma.user.count({ where: { role: "INTERNSHIP", isActive: true } }),
      prisma.leaveRequest.count({ where: { status: "PENDING" } }),
      prisma.leaveRequest.findMany({
        where: { status: "APPROVED", startDate: { lte: todayEnd }, endDate: { gte: todayStart } },
        include: { user: { select: { id: true, fullName: true, avatarUrl: true, role: true } } },
      }),
      prisma.companyHoliday.findMany({
        where: { date: { gte: todayStart, lte: in30d } },
        orderBy: { date: "asc" },
        take: 5,
      }),
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, role: true, department: true, createdAt: true },
      }),
      prisma.onboardingItem.groupBy({
        by: ["userId"],
        where: { completedAt: null, kind: "ONBOARDING" },
        _count: { id: true },
      }),
    ]);

  // Headcount by role and department
  const byRole: Record<string, number> = {};
  const byDepartment: Record<string, number> = {};
  let newLast30d = 0;
  const cutoff = +now - 30 * 86400_000;
  for (const u of users) {
    byRole[u.role] = (byRole[u.role] ?? 0) + 1;
    const dept = u.department?.trim() || "Unassigned";
    byDepartment[dept] = (byDepartment[dept] ?? 0) + 1;
    if (+u.createdAt > cutoff) newLast30d++;
  }

  return NextResponse.json({
    staffCount,
    internCount,
    pendingLeave,
    onLeaveToday,
    upcomingHolidays,
    byRole,
    byDepartment,
    newLast30d,
    openOnboardingUsers: incompleteOnboarding.length,
  });
}
