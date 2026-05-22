import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "CISO"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const actorId = searchParams.get("actorId");
  const targetType = searchParams.get("targetType");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
        ...(actorId ? { actorId } : {}),
        ...(targetType ? { targetType } : {}),
        ...(from && to
          ? { createdAt: { gte: new Date(from), lte: new Date(to) } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.auditLog.count({
      where: {
        ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
        ...(actorId ? { actorId } : {}),
        ...(targetType ? { targetType } : {}),
      },
    }),
  ]);

  return NextResponse.json({ logs, total, limit, offset });
}
