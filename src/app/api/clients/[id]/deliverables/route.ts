import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac/can";
import { logAudit } from "@/lib/audit";
import { ClientAccessError, assertCanEditClient, assertCanReadClient } from "@/lib/clients";

const createSchema = z.object({
  title: z.string().min(1, "Title is required").max(300),
  description: z.string().max(5000).optional(),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DELIVERED", "ACCEPTED"]).optional(),
  dueDate: z.string().optional(),
  ownerId: z.string().optional(),
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

// GET /api/clients/[id]/deliverables
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("clients.read");
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    await assertCanReadClient(auth.user.id, id);
  } catch (err) {
    return accessResponse(err);
  }

  const deliverables = await prisma.clientDeliverable.findMany({
    where: { clientId: id },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    include: { owner: { select: { id: true, fullName: true, avatarUrl: true } } },
  });
  return NextResponse.json({ deliverables });
}

// POST /api/clients/[id]/deliverables — what we owe this client.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("clients.read");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  let client;
  try {
    ({ client } = await assertCanEditClient(user.id, id));
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
      { error: parsed.error.issues[0]?.message ?? "Invalid deliverable" },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const deliverable = await prisma.clientDeliverable.create({
    data: {
      clientId: id,
      title: data.title.trim(),
      description: data.description?.trim() || null,
      status: data.status ?? "NOT_STARTED",
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      // Defaults to the client's owner rather than the creator: the Ops Manager
      // adding a deliverable to a BM's client is recording the BM's work.
      ownerId: data.ownerId ?? client.ownerId ?? user.id,
    },
    include: { owner: { select: { id: true, fullName: true, avatarUrl: true } } },
  });

  await logAudit({
    actorId: user.id,
    action: "CLIENT_DELIVERABLE_CREATED",
    targetType: "ClientDeliverable",
    targetId: deliverable.id,
    metadata: { clientId: id, title: deliverable.title },
  });

  return NextResponse.json({ deliverable }, { status: 201 });
}
