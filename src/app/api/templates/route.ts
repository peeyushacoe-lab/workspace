import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await prisma.emailTemplate.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(templates);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { name?: string; subject?: string; body?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Template name is required" }, { status: 400 });
  }

  const template = await prisma.emailTemplate.create({
    data: {
      userId: user.id,
      name: body.name.trim(),
      subject: body.subject ?? "",
      body: body.body ?? "",
    },
  });

  return NextResponse.json(template, { status: 201 });
}
