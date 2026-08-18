import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac/can";
import { logAudit } from "@/lib/audit";
import { ClientAccessError, assertCanEditClient } from "@/lib/clients";

const updateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DELIVERED", "ACCEPTED"]).optional(),
  dueDate: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
});

function accessResponse(err: unknown) {
  if (err instanceof ClientAccessError) {
    return NextResponse.json(
      { error: err.message, suggestRequest: err.suggestRequest },
      { status: err.status },
    );
  }
  throw err;
}

/**
 * A deliverable has no owner of its own for access purposes — rights are
 * inherited from its client, so there is exactly one ownership rule in the
 * system rather than two that can drift apart.
 */
async function authorizeViaClient(userId: string, deliverableId: string) {
  const deliverable = await prisma.clientDeliverable.findUnique({
    where: { id: deliverableId },
    select: { id: true, clientId: true, title: true, status: true },
  });
  if (!deliverable) throw new ClientAccessError(404, "Deliverable not found");
  await assertCanEditClient(userId, deliverable.clientId);
  return deliverable;
}

// PATCH /api/clients/deliverables/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("clients.read");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  let existing;
  try {
    existing = await authorizeViaClient(user.id, id);
  } catch (err) {
    return accessResponse(err);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid update" },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // deliveredAt is derived from status, never set by the client. It is the
  // timestamp people later argue about, so it has to come from the server clock
  // at the moment the status actually moved — and clear again if it moves back.
  const movingToDelivered =
    data.status !== undefined &&
    (data.status === "DELIVERED" || data.status === "ACCEPTED") &&
    existing.status !== "DELIVERED" &&
    existing.status !== "ACCEPTED";
  const movingOffDelivered =
    data.status !== undefined && data.status !== "DELIVERED" && data.status !== "ACCEPTED";

  const deliverable = await prisma.clientDeliverable.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title.trim() } : {}),
      ...(data.description !== undefined
        ? { description: data.description?.trim() || null }
        : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.dueDate !== undefined
        ? { dueDate: data.dueDate ? new Date(data.dueDate) : null }
        : {}),
      ...(data.ownerId !== undefined ? { ownerId: data.ownerId } : {}),
      ...(movingToDelivered ? { deliveredAt: new Date() } : {}),
      ...(movingOffDelivered ? { deliveredAt: null } : {}),
    },
    include: { owner: { select: { id: true, fullName: true, avatarUrl: true } } },
  });

  await logAudit({
    actorId: user.id,
    action: "CLIENT_DELIVERABLE_UPDATED",
    targetType: "ClientDeliverable",
    targetId: id,
    metadata: { clientId: existing.clientId, fields: Object.keys(data) },
  });

  return NextResponse.json({ deliverable });
}

// DELETE /api/clients/deliverables/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("clients.read");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  let existing;
  try {
    existing = await authorizeViaClient(user.id, id);
  } catch (err) {
    return accessResponse(err);
  }

  await prisma.clientDeliverable.delete({ where: { id } });
  await logAudit({
    actorId: user.id,
    action: "CLIENT_DELIVERABLE_DELETED",
    targetType: "ClientDeliverable",
    targetId: id,
    metadata: { clientId: existing.clientId, title: existing.title },
  });

  return NextResponse.json({ ok: true });
}
