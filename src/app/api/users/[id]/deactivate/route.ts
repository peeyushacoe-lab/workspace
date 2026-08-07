import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { deactivateUser, reactivateUser } from "@/lib/users/offboard";
import { prisma } from "@/lib/prisma";

/**
 * Offboarding — the normal way someone leaves.
 *
 * POST   → deactivate: revoke all access, keep everything they wrote
 * DELETE → reactivate
 *
 * Separate from `DELETE /api/users/[id]` on purpose. Erasing an account and
 * revoking its access are different intentions with very different blast
 * radii, and putting both behind the same verb is how the wrong one gets
 * chosen. See src/lib/users/offboard.ts.
 */

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  if (id === currentUser.id) {
    return NextResponse.json({ error: "You can't deactivate your own account" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { role: true, isActive: true, fullName: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!target.isActive) {
    return NextResponse.json({ error: "That account is already deactivated" }, { status: 409 });
  }

  // Locking every admin out of the admin plane is not a recoverable state.
  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "Cannot deactivate the last active admin" }, { status: 400 });
    }
  }

  const result = await deactivateUser(id, currentUser.id);
  return NextResponse.json({ ok: true, name: target.fullName, ...result });
}

export async function DELETE(_request: Request, { params }: Params) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id }, select: { isActive: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.isActive) {
    return NextResponse.json({ error: "That account is already active" }, { status: 409 });
  }

  await reactivateUser(id, currentUser.id);
  return NextResponse.json({ ok: true });
}
