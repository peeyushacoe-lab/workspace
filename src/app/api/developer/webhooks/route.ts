import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { userId: user.id },
    select: { id: true, url: true, events: true, isActive: true, createdAt: true, lastTriggeredAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ endpoints });
}

export async function POST(request: NextRequest) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { url?: string; events?: string[] };
  if (!body.url?.trim()) return NextResponse.json({ error: "url is required" }, { status: 400 });

  try { new URL(body.url); } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const secret = `whsec_${crypto.randomBytes(24).toString("hex")}`;

  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      userId: user.id,
      organizationId: user.organizationId ?? null,
      url: body.url.trim(),
      events: body.events ?? ["message.created"],
      secret,
    },
    select: { id: true, url: true, events: true, isActive: true, createdAt: true },
  });

  return NextResponse.json({ ...endpoint, secret }, { status: 201 });
}
