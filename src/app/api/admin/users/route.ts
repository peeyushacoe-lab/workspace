import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 200);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0"), 0);

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.user.count(),
  ]);

  // Batch-fetch last successful login per user — avoids N+1
  const userIds = users.map((u) => u.id);
  const lastLogins = await prisma.loginEvent.findMany({
    where: { userId: { in: userIds }, success: true },
    select: { userId: true, createdAt: true },
    distinct: ["userId"],
    orderBy: { createdAt: "desc" },
  });
  const loginMap = new Map(lastLogins.map((l) => [l.userId, l.createdAt.toISOString()]));

  const result = users.map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    lastLogin: loginMap.get(u.id) ?? null,
  }));

  return NextResponse.json({ users: result, total, limit, offset });
}
