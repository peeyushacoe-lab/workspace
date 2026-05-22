import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SECURITY_ROLES = ["ADMIN", "CEO", "CISO", "CYBER_SECURITY"] as const;
type SecurityRole = (typeof SECURITY_ROLES)[number];

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!SECURITY_ROLES.includes(user.role as SecurityRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? undefined;
  const severity = searchParams.get("severity") ?? undefined;
  const q = searchParams.get("q") ?? "";

  const feeds = await prisma.threatIntelFeed.findMany({
    where: {
      ...(type ? { type } : {}),
      ...(severity ? { severity } : {}),
      ...(q ? { value: { contains: q } } : {}),
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { hitCount: "desc" },
    take: 100,
  });

  return NextResponse.json(feeds);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!SECURITY_ROLES.includes(user.role as SecurityRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as {
    type: string;
    value: string;
    confidence?: number;
    severity?: string;
    source?: string;
    description?: string;
    expiresInDays?: number;
  };

  if (!body.type || !body.value) {
    return NextResponse.json({ error: "type and value required" }, { status: 400 });
  }

  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 86_400_000)
    : null;

  const feed = await prisma.threatIntelFeed.upsert({
    where: { type_value: { type: body.type, value: body.value } },
    create: {
      type: body.type,
      value: body.value,
      confidence: body.confidence ?? 50,
      severity: body.severity ?? "MEDIUM",
      source: body.source ?? null,
      description: body.description ?? null,
      expiresAt,
    },
    update: {
      confidence: body.confidence ?? 50,
      severity: body.severity ?? "MEDIUM",
      description: body.description ?? null,
      expiresAt,
    },
  });

  return NextResponse.json(feed, { status: 201 });
}

/**
 * GET /api/sentinel/intel/lookup?type=IP&value=1.2.3.4
 * Quick lookup — used by email/file scanners to check against threat intel.
 */
export async function HEAD(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return new Response(null, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const value = searchParams.get("value");
  if (!type || !value) return new Response(null, { status: 400 });

  const hit = await prisma.threatIntelFeed.findFirst({
    where: { type, value, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
  });

  if (hit) {
    await prisma.threatIntelFeed.update({ where: { id: hit.id }, data: { hitCount: { increment: 1 }, lastHitAt: new Date() } }).catch(() => {});
    return new Response(null, { status: 200, headers: { "X-Threat-Severity": hit.severity, "X-Threat-Confidence": String(hit.confidence) } });
  }

  return new Response(null, { status: 404 });
}
