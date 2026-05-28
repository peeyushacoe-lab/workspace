import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.organizationId) return NextResponse.json({ error: "No organization" }, { status: 404 });

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      id: true, name: true, slug: true, domain: true, plan: true,
      maxUsers: true, logoUrl: true, brandColor: true, billingEmail: true,
      trialEndsAt: true, settings: true, createdAt: true,
      _count: { select: { users: true } },
    },
  });
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  return NextResponse.json(org);
}

export async function PATCH(request: NextRequest) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.organizationId) return NextResponse.json({ error: "No organization" }, { status: 404 });
  if (user.orgRole !== "OWNER" && user.orgRole !== "ADMIN" && user.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as {
    name?: string; logoUrl?: string; brandColor?: string; billingEmail?: string; settings?: unknown;
  };

  const allowed: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) allowed.name = body.name.trim();
  if (typeof body.logoUrl === "string") allowed.logoUrl = body.logoUrl;
  if (typeof body.brandColor === "string") allowed.brandColor = body.brandColor;
  if (typeof body.billingEmail === "string") allowed.billingEmail = body.billingEmail;
  if (body.settings !== undefined) allowed.settings = body.settings;

  const org = await prisma.organization.update({
    where: { id: user.organizationId },
    data: allowed,
    select: { id: true, name: true, slug: true, logoUrl: true, brandColor: true, billingEmail: true, settings: true },
  });

  return NextResponse.json(org);
}
