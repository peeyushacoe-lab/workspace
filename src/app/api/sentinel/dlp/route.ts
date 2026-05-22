import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SECURITY_ROLES = ["ADMIN", "CEO", "CISO", "CYBER_SECURITY"] as const;
type SecurityRole = (typeof SECURITY_ROLES)[number];

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!SECURITY_ROLES.includes(user.role as SecurityRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const policies = await prisma.dLPPolicy.findMany({
    include: { _count: { select: { violations: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(policies);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!SECURITY_ROLES.includes(user.role as SecurityRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as {
    name: string;
    description?: string;
    scope: string[];
    patterns: Array<{ type: "regex" | "keyword" | "pattern"; value: string }>;
    action?: string;
    severity?: string;
  };

  if (!body.name || !body.patterns?.length) {
    return NextResponse.json({ error: "name and patterns required" }, { status: 400 });
  }

  const policy = await prisma.dLPPolicy.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      scope: body.scope ?? [],
      patterns: body.patterns,
      action: body.action ?? "ALERT",
      severity: body.severity ?? "MEDIUM",
      createdById: user.id,
    },
  });

  return NextResponse.json(policy, { status: 201 });
}
