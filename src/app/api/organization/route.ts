import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["ADMIN", "CEO"] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(org ?? { id: null, name: "CyberSage", plan: "ENTERPRISE", domain: null });
}

export async function PUT(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role as AdminRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as { name?: string; domain?: string; plan?: string; settings?: Record<string, unknown> };

  const existing = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  const org = existing
    ? await prisma.organization.update({
        where: { id: existing.id },
        data: { ...(body.name && { name: body.name }), ...(body.domain !== undefined && { domain: body.domain || null }), ...(body.plan && { plan: body.plan }), ...(body.settings && { settings: body.settings as never }) },
      })
    : await prisma.organization.create({
        data: { name: body.name ?? "CyberSage", slug: (body.name ?? "cybersage").toLowerCase().replace(/[^a-z0-9-]/g, "-"), domain: body.domain ?? null, plan: body.plan ?? "ENTERPRISE", settings: (body.settings ?? undefined) as never },
      });

  return NextResponse.json(org);
}
