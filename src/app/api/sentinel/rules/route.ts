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
  const category = searchParams.get("category") ?? undefined;
  const active = searchParams.get("active");

  const rules = await prisma.detectionRule.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(active !== null ? { isActive: active === "true" } : {}),
    },
    orderBy: [{ severity: "asc" }, { hitCount: "desc" }],
  });

  return NextResponse.json(rules);
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
    severity?: string;
    logic: { conditions: Array<{ field: string; op: string; value: string }>; logic?: "AND" | "OR" };
    action?: string;
    category?: string;
  };

  if (!body.name || !body.logic?.conditions?.length) {
    return NextResponse.json({ error: "name and logic.conditions required" }, { status: 400 });
  }

  const rule = await prisma.detectionRule.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      severity: body.severity ?? "MEDIUM",
      logic: body.logic,
      action: body.action ?? "ALERT",
      category: body.category ?? null,
    },
  });

  return NextResponse.json(rule, { status: 201 });
}
