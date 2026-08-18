import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac/can";
import { logAudit } from "@/lib/audit";
import {
  ClientAccessError,
  assertCanReadClient,
  clientRightsFor,
  parseMoneyToMinor,
  withDisplayStatus,
} from "@/lib/clients";

const createSchema = z.object({
  description: z.string().min(1, "Description is required").max(300),
  // Accepts "1,250.50" or 1250.5 — normalised to integer minor units below.
  amount: z.union([z.string(), z.number()]),
  kind: z.enum(["RETAINER", "PROJECT", "MILESTONE", "EXPENSE"]).optional(),
  currency: z.string().length(3).optional(),
  deliverableId: z.string().nullable().optional(),
  invoiceRef: z.string().max(120).optional(),
  dueAt: z.string().optional(),
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

// GET /api/clients/[id]/fees
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("clients.finance.read");
  if ("error" in auth) return auth.error;
  const { id } = await params;

  try {
    await assertCanReadClient(auth.user.id, id);
  } catch (err) {
    return accessResponse(err);
  }

  const fees = (
    await prisma.clientFee.findMany({
      where: { clientId: id },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      include: {
        recordedBy: { select: { id: true, fullName: true } },
        confirmedBy: { select: { id: true, fullName: true } },
        deliverable: { select: { id: true, title: true } },
      },
    })
  ).map(withDisplayStatus);
  return NextResponse.json({ fees });
}

// POST /api/clients/[id]/fees — raise a fee against a client.
//
// Two roles can land here and they mean different things:
//   * the owning Business Manager records what was agreed → DRAFT
//   * Finance records what has actually been invoiced       → INVOICED
// A BM cannot create a fee already marked invoiced, because "invoiced" is a
// claim about the ledger and the ledger is Finance's.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("clients.finance.read");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  let client;
  try {
    ({ client } = await assertCanReadClient(user.id, id));
  } catch (err) {
    return accessResponse(err);
  }

  const rights = await clientRightsFor(user.id, client);
  if (!rights.canEdit && !rights.canManageMoney) {
    return NextResponse.json(
      {
        error:
          "You can see this client's fees but not add to them. Raise a request and the owner will action it.",
        suggestRequest: true,
      },
      { status: 403 },
    );
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
      { error: parsed.error.issues[0]?.message ?? "Invalid fee" },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const amountMinor = parseMoneyToMinor(data.amount);
  if (amountMinor === null) {
    return NextResponse.json(
      { error: "Enter a valid, non-negative amount." },
      { status: 400 },
    );
  }

  // A deliverable can only carry fees for its own client — otherwise a fee could
  // be attached across the book and quietly show up in another client's total.
  if (data.deliverableId) {
    const deliverable = await prisma.clientDeliverable.findUnique({
      where: { id: data.deliverableId },
      select: { clientId: true },
    });
    if (!deliverable || deliverable.clientId !== id) {
      return NextResponse.json(
        { error: "That deliverable does not belong to this client." },
        { status: 400 },
      );
    }
  }

  const fee = await prisma.clientFee.create({
    data: {
      clientId: id,
      deliverableId: data.deliverableId ?? null,
      kind: data.kind ?? "PROJECT",
      description: data.description.trim(),
      amountMinor,
      currency: data.currency?.toUpperCase() ?? "GBP",
      status: rights.canManageMoney && data.invoiceRef ? "INVOICED" : "DRAFT",
      invoiceRef: data.invoiceRef?.trim() || null,
      invoicedAt: rights.canManageMoney && data.invoiceRef ? new Date() : null,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
      recordedById: user.id,
    },
    include: {
      recordedBy: { select: { id: true, fullName: true } },
      confirmedBy: { select: { id: true, fullName: true } },
      deliverable: { select: { id: true, title: true } },
    },
  });

  await logAudit({
    actorId: user.id,
    action: "CLIENT_FEE_CREATED",
    targetType: "ClientFee",
    targetId: fee.id,
    metadata: {
      clientId: id,
      amountMinor,
      currency: fee.currency,
      status: fee.status,
      description: fee.description,
    },
  });

  return NextResponse.json({ fee }, { status: 201 });
}
