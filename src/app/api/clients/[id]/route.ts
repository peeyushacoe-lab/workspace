import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission, can } from "@/lib/rbac/can";
import { logAudit } from "@/lib/audit";
import { ClientAccessError, assertCanEditClient, clientRightsFor, withDisplayStatus } from "@/lib/clients";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  legalName: z.string().max(200).nullable().optional(),
  region: z.string().max(80).nullable().optional(),
  industry: z.string().max(80).nullable().optional(),
  website: z.string().max(300).nullable().optional(),
  status: z.enum(["PROSPECT", "ACTIVE", "ON_HOLD", "CHURNED"]).optional(),
  ownerId: z.string().nullable().optional(),
  currency: z.string().length(3).optional(),
  startedAt: z.string().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  primaryContactName: z.string().max(200).nullable().optional(),
  primaryContactEmail: z.string().max(200).nullable().optional(),
  primaryContactPhone: z.string().max(60).nullable().optional(),
});

/** Turn a ClientAccessError into the response it describes. */
function accessResponse(err: unknown) {
  if (err instanceof ClientAccessError) {
    return NextResponse.json(
      { error: err.message, suggestRequest: err.suggestRequest },
      { status: err.status },
    );
  }
  throw err;
}

// GET /api/clients/[id] — the full record: deliverables, fees (if permitted) and
// the request thread.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("clients.read");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, fullName: true, avatarUrl: true, customRole: true, email: true } },
      createdBy: { select: { id: true, fullName: true } },
      deliverables: {
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        include: { owner: { select: { id: true, fullName: true, avatarUrl: true } } },
      },
      requests: {
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        include: {
          raisedBy: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
          assignedTo: { select: { id: true, fullName: true, avatarUrl: true } },
          resolvedBy: { select: { id: true, fullName: true } },
          comments: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { id: true, fullName: true, avatarUrl: true } } },
          },
        },
      },
    },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const rights = await clientRightsFor(user.id, client);
  if (!rights.canRead) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Fees are gated separately from the client itself. Someone without
  // `clients.finance.read` still sees the relationship and its deliverables —
  // they just get no numbers, rather than being locked out of the record.
  const fees = rights.canSeeMoney
    ? (
        await prisma.clientFee.findMany({
          where: { clientId: id },
          orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
          include: {
            recordedBy: { select: { id: true, fullName: true } },
            confirmedBy: { select: { id: true, fullName: true } },
            deliverable: { select: { id: true, title: true } },
          },
        })
      ).map(withDisplayStatus)
    : null;

  return NextResponse.json({ client, fees, rights });
}

// PATCH /api/clients/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("clients.read");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  let existing;
  try {
    ({ client: existing } = await assertCanEditClient(user.id, id));
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

  // Reassigning ownership is an admin act, not an edit. A Business Manager who
  // could set `ownerId` could hand their own client away — or take someone
  // else's by editing it once they had been given temporary access.
  const ownerChanged = "ownerId" in data && data.ownerId !== existing.ownerId;
  if (ownerChanged && !(await can(user.id, "clients.admin"))) {
    return NextResponse.json(
      { error: "Only the Operations Manager can reassign a client's owner." },
      { status: 403 },
    );
  }

  const client = await prisma.client.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.legalName !== undefined ? { legalName: data.legalName?.trim() || null } : {}),
      ...(data.region !== undefined ? { region: data.region?.trim() || null } : {}),
      ...(data.industry !== undefined ? { industry: data.industry?.trim() || null } : {}),
      ...(data.website !== undefined ? { website: data.website?.trim() || null } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(ownerChanged ? { ownerId: data.ownerId ?? null } : {}),
      ...(data.currency !== undefined ? { currency: data.currency.toUpperCase() } : {}),
      ...(data.startedAt !== undefined
        ? { startedAt: data.startedAt ? new Date(data.startedAt) : null }
        : {}),
      ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
      ...(data.primaryContactName !== undefined
        ? { primaryContactName: data.primaryContactName?.trim() || null }
        : {}),
      ...(data.primaryContactEmail !== undefined
        ? { primaryContactEmail: data.primaryContactEmail?.trim() || null }
        : {}),
      ...(data.primaryContactPhone !== undefined
        ? { primaryContactPhone: data.primaryContactPhone?.trim() || null }
        : {}),
    },
    include: { owner: { select: { id: true, fullName: true, avatarUrl: true, customRole: true } } },
  });

  await logAudit({
    actorId: user.id,
    action: ownerChanged ? "CLIENT_OWNER_CHANGED" : "CLIENT_UPDATED",
    targetType: "Client",
    targetId: id,
    metadata: ownerChanged
      ? { from: existing.ownerId, to: data.ownerId ?? null, name: client.name }
      : { fields: Object.keys(data), name: client.name },
  });

  return NextResponse.json({ client });
}

// DELETE /api/clients/[id] — admin only. Deliverables, fees and requests cascade.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("clients.admin");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  const client = await prisma.client.findUnique({ where: { id }, select: { name: true } });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  await prisma.client.delete({ where: { id } });
  await logAudit({
    actorId: user.id,
    action: "CLIENT_DELETED",
    targetType: "Client",
    targetId: id,
    metadata: { name: client.name },
  });

  return NextResponse.json({ ok: true });
}
