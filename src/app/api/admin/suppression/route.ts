import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const entries = await prisma.suppressionList.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(entries);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { email?: string; reason?: string };

  if (!body.email?.trim()) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  const reason = body.reason ?? "MANUAL";

  // Check if already suppressed
  const existing = await prisma.suppressionList.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already suppressed" }, { status: 409 });
  }

  const entry = await prisma.suppressionList.create({
    data: { email, reason },
  });

  return NextResponse.json(entry, { status: 201 });
}
