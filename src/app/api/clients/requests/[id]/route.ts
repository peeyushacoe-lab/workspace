import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac/can";
import { logAudit } from "@/lib/audit";
import { clientRightsFor } from "@/lib/clients";
import { notifyRequestComment, notifyRequestUpdated } from "@/lib/client-requests";

const patchSchema = z.object({
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED", "DECLINED"]).optional(),
  resolutionNote: z.string().max(2000).optional(),
  comment: z.string().min(1).max(5000).optional(),
});

// PATCH /api/clients/requests/[id] — move a request along, or reply on it.
//
// Who may do what:
//   * Anyone who can read the client may add a comment. A request is a
//     conversation; locking replies to the owner would make it a dead letter.
//   * Only someone who can EDIT the client may change its status. The raiser is
//     the exception — you can always withdraw your own request by declining it.
//     Without that exception a CEO could raise a request and then be unable to
//     say "never mind", leaving the BM chasing something already dropped.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("clients.read");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  const request = await prisma.clientRequest.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, ownerId: true, name: true } },
      comments: { select: { authorId: true } },
    },
  });
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const rights = await clientRightsFor(user.id, request.client);
  if (!rights.canRead) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid update" },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const isRaiser = request.raisedById === user.id;
  const canChangeStatus = rights.canEdit || isRaiser;

  if (data.status !== undefined && !canChangeStatus) {
    return NextResponse.json(
      { error: "Only the client's owner can action this request." },
      { status: 403 },
    );
  }
  // The raiser can withdraw, not self-approve — otherwise "resolved" would stop
  // meaning "the owner dealt with it", which is the only thing it is for.
  if (data.status !== undefined && isRaiser && !rights.canEdit && data.status !== "DECLINED") {
    return NextResponse.json(
      { error: "You can withdraw your own request, but only its owner can resolve it." },
      { status: 403 },
    );
  }

  const closing = data.status === "RESOLVED" || data.status === "DECLINED";

  const updated = await prisma.$transaction(async (tx) => {
    if (data.comment) {
      await tx.clientRequestComment.create({
        data: { requestId: id, authorId: user.id, body: data.comment.trim() },
      });
    }
    if (data.status !== undefined || data.resolutionNote !== undefined) {
      await tx.clientRequest.update({
        where: { id },
        data: {
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.resolutionNote !== undefined
            ? { resolutionNote: data.resolutionNote.trim() || null }
            : {}),
          ...(closing
            ? { resolvedById: user.id, resolvedAt: new Date() }
            : data.status === "OPEN" || data.status === "ACKNOWLEDGED"
              ? { resolvedById: null, resolvedAt: null }
              : {}),
        },
      });
    }
    return tx.clientRequest.findUnique({
      where: { id },
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
  });

  if (data.status !== undefined) {
    await notifyRequestUpdated({
      requestId: id,
      clientId: request.clientId,
      clientName: request.client.name,
      raisedById: request.raisedById,
      actorId: user.id,
      actorName: user.fullName,
      status: data.status,
      note: data.resolutionNote,
    });
  }

  if (data.comment) {
    // Everyone already in the thread hears about a reply — raiser, assignee and
    // anyone who has commented. Otherwise a reply to a request lands nowhere.
    const participants = [
      request.raisedById,
      ...(request.assignedToId ? [request.assignedToId] : []),
      ...request.comments.map((c) => c.authorId),
    ];
    await notifyRequestComment({
      requestId: id,
      clientId: request.clientId,
      clientName: request.client.name,
      authorId: user.id,
      authorName: user.fullName,
      body: data.comment.trim(),
      participantIds: participants,
    });
  }

  await logAudit({
    actorId: user.id,
    action: "CLIENT_REQUEST_UPDATED",
    targetType: "ClientRequest",
    targetId: id,
    metadata: {
      clientId: request.clientId,
      status: data.status ?? request.status,
      commented: Boolean(data.comment),
    },
  });

  return NextResponse.json({ request: updated });
}
