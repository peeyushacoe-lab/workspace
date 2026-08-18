import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac/can";
import { logAudit } from "@/lib/audit";
import { ClientAccessError, assertCanReadClient } from "@/lib/clients";
import { notifyRequestRaised, requestRecipients } from "@/lib/client-requests";

const createSchema = z.object({
  subject: z.string().min(1, "Say what you need in the subject").max(200),
  body: z.string().min(1, "Add some detail so the owner can act on it").max(5000),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  deliverableId: z.string().nullable().optional(),
  feeId: z.string().nullable().optional(),
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

// GET /api/clients/[id]/requests
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("clients.read");
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    await assertCanReadClient(auth.user.id, id);
  } catch (err) {
    return accessResponse(err);
  }

  const requests = await prisma.clientRequest.findMany({
    where: { clientId: id },
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
  });
  return NextResponse.json({ requests });
}

// POST /api/clients/[id]/requests — raise a request against this client.
//
// Deliberately gated on `clients.read` alone. This is the one write that
// leadership CAN perform, and it is the only one: it creates a request, never
// touches the client, and routes to the owner plus the Ops Manager. Someone who
// can edit the client can also raise one (useful for handing work to a peer),
// so there is no "you are too privileged to ask" case.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("clients.read");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  let client;
  try {
    ({ client } = await assertCanReadClient(user.id, id));
  } catch (err) {
    return accessResponse(err);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Anchoring to a deliverable or fee is what makes a request specific rather
  // than a note. Both must belong to this client or the anchor is meaningless.
  if (data.deliverableId) {
    const d = await prisma.clientDeliverable.findUnique({
      where: { id: data.deliverableId },
      select: { clientId: true },
    });
    if (!d || d.clientId !== id) {
      return NextResponse.json({ error: "That deliverable is not on this client." }, { status: 400 });
    }
  }
  if (data.feeId) {
    const f = await prisma.clientFee.findUnique({
      where: { id: data.feeId },
      select: { clientId: true },
    });
    if (!f || f.clientId !== id) {
      return NextResponse.json({ error: "That fee is not on this client." }, { status: 400 });
    }
  }

  const request = await prisma.clientRequest.create({
    data: {
      clientId: id,
      deliverableId: data.deliverableId ?? null,
      feeId: data.feeId ?? null,
      subject: data.subject.trim(),
      body: data.body.trim(),
      priority: data.priority ?? "NORMAL",
      raisedById: user.id,
      // Snapshot of who owned it when raised. If ownership moves later the
      // request stays with the person who was asked, rather than silently
      // re-pointing at someone who never saw it.
      assignedToId: client.ownerId,
    },
    include: {
      raisedBy: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
      assignedTo: { select: { id: true, fullName: true, avatarUrl: true } },
      comments: true,
    },
  });

  const recipients = await requestRecipients({
    ownerId: client.ownerId,
    organizationId: client.organizationId,
    raisedById: user.id,
  });

  await notifyRequestRaised({
    requestId: request.id,
    clientId: id,
    clientName: client.name,
    subject: request.subject,
    raisedByName: user.fullName,
    recipientIds: recipients,
    priority: request.priority,
  });

  await logAudit({
    actorId: user.id,
    action: "CLIENT_REQUEST_RAISED",
    targetType: "ClientRequest",
    targetId: request.id,
    metadata: {
      clientId: id,
      clientName: client.name,
      subject: request.subject,
      priority: request.priority,
      notified: recipients,
    },
  });

  return NextResponse.json({ request, notified: recipients.length }, { status: 201 });
}
