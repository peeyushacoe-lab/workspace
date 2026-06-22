import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Roles allowed to configure external email forwarding
const FORWARDING_ROLES = ["CEO", "CISO", "R_AND_D", "OPS_MANAGER", "ADMIN"] as const;
type ForwardingRole = (typeof FORWARDING_ROLES)[number];

function canForward(role: string): role is ForwardingRole {
  return FORWARDING_ROLES.includes(role as ForwardingRole);
}

/**
 * GET /api/settings/forwarding
 * Returns the current user's forwarding settings.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canForward(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { personalEmail: true, preferences: true },
  });

  const prefs = (record?.preferences ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    personalEmail: record?.personalEmail ?? "",
    forwardingEnabled: prefs.externalForwardEnabled === true,
    keepCopy: prefs.forwardKeepCopy !== false, // default true
  });
}

const putSchema = z.object({
  personalEmail:    z.string().email("Must be a valid email").or(z.literal("")).optional(),
  forwardingEnabled: z.boolean().optional(),
  keepCopy:         z.boolean().optional(),
});

/**
 * PUT /api/settings/forwarding
 * Update forwarding settings.
 */
export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canForward(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as unknown;
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { personalEmail, forwardingEnabled, keepCopy } = parsed.data;

  // Read existing prefs so we only patch, not overwrite
  const existing = await prisma.user.findUnique({
    where: { id: user.id },
    select: { preferences: true },
  });
  const prefs = ((existing?.preferences ?? {}) as Record<string, unknown>);

  if (forwardingEnabled !== undefined) prefs.externalForwardEnabled = forwardingEnabled;
  if (keepCopy !== undefined) prefs.forwardKeepCopy = keepCopy;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(personalEmail !== undefined ? { personalEmail: personalEmail || null } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      preferences: prefs as any,
    },
  });

  return NextResponse.json({ ok: true });
}
