import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const ADMIN_ROLES = ["ADMIN", "CEO"] as const;

const upsertSchema = z.object({
  provider:      z.enum(["SAML", "OIDC", "GOOGLE", "MICROSOFT"]),
  entityId:      z.string().optional(),
  metadataUrl:   z.string().url().optional().or(z.literal("")),
  metadataXml:   z.string().optional(),
  clientId:      z.string().optional(),
  clientSecret:  z.string().optional(),
  callbackUrl:   z.string().url().optional().or(z.literal("")),
  isActive:      z.boolean().optional().default(false),
  autoProvision: z.boolean().optional().default(true),
  defaultRole:   z.string().optional().default("DEVELOPER"),
});

/**
 * GET /api/admin/sso
 * Returns all SSO configurations (secrets masked).
 */
export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configs = await prisma.sSOConfig.findMany({ orderBy: { createdAt: "desc" } });

  // Mask client secrets
  return NextResponse.json(
    configs.map((c) => ({
      ...c,
      clientSecret: c.clientSecret ? "••••••••" : null,
    }))
  );
}

/**
 * POST /api/admin/sso
 * Create or update SSO configuration for a provider.
 */
export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = upsertSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation error" }, { status: 400 });
  }

  const d = parsed.data;

  // Deactivate any other active config of the same provider first
  if (d.isActive) {
    await prisma.sSOConfig.updateMany({
      where: { provider: d.provider, isActive: true },
      data: { isActive: false },
    });
  }

  const config = await prisma.sSOConfig.create({
    data: {
      provider:      d.provider,
      entityId:      d.entityId ?? null,
      metadataUrl:   d.metadataUrl || null,
      metadataXml:   d.metadataXml ?? null,
      clientId:      d.clientId ?? null,
      clientSecret:  d.clientSecret ?? null,
      callbackUrl:   d.callbackUrl || null,
      isActive:      d.isActive,
      autoProvision: d.autoProvision,
      defaultRole:   d.defaultRole as never,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId:    user.id,
      action:     "SSO_CONFIG_UPDATED",
      targetType: "SSOConfig",
      targetId:   config.id,
      metadata:   { provider: d.provider, isActive: d.isActive } as object,
    },
  }).catch(() => {});

  return NextResponse.json({ ...config, clientSecret: config.clientSecret ? "••••••••" : null }, { status: 201 });
}

/**
 * DELETE /api/admin/sso?id=
 */
export async function DELETE(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.sSOConfig.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
