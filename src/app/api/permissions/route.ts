import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["ADMIN", "CEO"] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

const VALID_RESOURCES = ["email", "drive", "chat", "meet", "admin", "sentinel", "ai", "calendar", "docs", "automation"] as const;
const VALID_ACTIONS = ["read", "write", "delete", "share", "admin"] as const;

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get("userId") ?? user.id;

  // Non-admins can only see their own permissions
  if (targetUserId !== user.id && !ADMIN_ROLES.includes(user.role as AdminRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const permissions = await prisma.permission.findMany({
    where: { userId: targetUserId },
    orderBy: [{ resource: "asc" }, { action: "asc" }],
  });

  return NextResponse.json(permissions);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role as AdminRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as {
    userId: string;
    resource: string;
    action: string;
    granted?: boolean;
  };

  if (!body.userId || !body.resource || !body.action) {
    return NextResponse.json({ error: "userId, resource, action required" }, { status: 400 });
  }
  if (!VALID_RESOURCES.includes(body.resource as never)) {
    return NextResponse.json({ error: `Invalid resource. Must be one of: ${VALID_RESOURCES.join(", ")}` }, { status: 400 });
  }
  if (!VALID_ACTIONS.includes(body.action as never)) {
    return NextResponse.json({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` }, { status: 400 });
  }

  const permission = await prisma.permission.upsert({
    where: { userId_resource_action: { userId: body.userId, resource: body.resource, action: body.action } },
    create: { userId: body.userId, resource: body.resource, action: body.action, granted: body.granted ?? true, grantedBy: user.id },
    update: { granted: body.granted ?? true, grantedBy: user.id },
  });

  return NextResponse.json(permission, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_ROLES.includes(user.role as AdminRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const resource = searchParams.get("resource");
  const action = searchParams.get("action");

  if (!userId || !resource || !action) {
    return NextResponse.json({ error: "userId, resource, action required" }, { status: 400 });
  }

  await prisma.permission.deleteMany({ where: { userId, resource, action } });
  return NextResponse.json({ ok: true });
}
