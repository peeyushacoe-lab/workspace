import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const VALID_EVENTS = [
  "email.received", "email.sent", "file.uploaded", "file.shared",
  "chat.message", "meet.started", "meet.ended",
  "sentinel.alert", "dlp.violation", "user.created", "user.updated",
] as const;

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { userId: user.id },
    include: { _count: { select: { deliveries: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(endpoints.map((e) => ({ ...e, secret: e.secret ? "••••••••" : null })));
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { url: string; events?: string[]; secret?: string };
  if (!body.url) return NextResponse.json({ error: "url required" }, { status: 400 });

  try { new URL(body.url); } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const events = (body.events ?? []).filter((e) => VALID_EVENTS.includes(e as never));
  const secret = body.secret ?? crypto.randomBytes(20).toString("hex");

  const endpoint = await prisma.webhookEndpoint.create({
    data: { userId: user.id, url: body.url, events, secret },
  });

  return NextResponse.json({ ...endpoint, secret }, { status: 201 });
}
