import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      avatarUrl: true,
      jobTitle: true,
      department: true,
    },
    orderBy: { fullName: "asc" },
  });

  // Group by department (fall back to "Other" when department is null/empty)
  const departments: Record<string, typeof users> = {};
  for (const u of users) {
    const dept = u.department?.trim() || "Other";
    if (!departments[dept]) departments[dept] = [];
    departments[dept].push(u);
  }

  return NextResponse.json({ departments, total: users.length });
}
