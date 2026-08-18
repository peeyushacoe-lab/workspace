import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac/can";
import { logAudit } from "@/lib/audit";
import {
  ClientAccessError,
  clientRightsFor,
  derivedFeeStatus,
  parseMoneyToMinor,
} from "@/lib/clients";

const updateSchema = z.object({
  description: z.string().min(1).max(300).optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  kind: z.enum(["RETAINER", "PROJECT", "MILESTONE", "EXPENSE"]).optional(),
  deliverableId: z.string().nullable().optional(),
  dueAt: z.string().nullable().optional(),
  // ── Ledger fields: Finance only ──
  invoiceRef: z.string().max(120).nullable().optional(),
  markInvoiced: z.boolean().optional(),
  paidAmount: z.union([z.string(), z.number()]).optional(),
  writeOff: z.boolean().optional(),
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

// PATCH /api/clients/fees/[id]
//
// The split that matters:
//   * Commercial terms (what we agreed to charge) belong to whoever can edit the
//     client — the owning Business Manager.
//   * Ledger facts (invoice raised, money received, written off) belong to
//     Finance and to nobody else, including the BM who recorded the fee and the
//     Ops Manager who oversees the book.
//
// A BM marking their own fee "paid" would make the revenue figure self-reported.
// That is the entire reason `clients.finance.manage` exists as a separate key.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("clients.finance.read");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  const fee = await prisma.clientFee.findUnique({
    where: { id },
    include: { client: { select: { id: true, ownerId: true, name: true } } },
  });
  if (!fee) return NextResponse.json({ error: "Fee not found" }, { status: 404 });

  const rights = await clientRightsFor(user.id, fee.client);
  if (!rights.canRead) return NextResponse.json({ error: "Fee not found" }, { status: 404 });

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

  const touchesLedger =
    data.paidAmount !== undefined ||
    data.markInvoiced !== undefined ||
    data.invoiceRef !== undefined ||
    data.writeOff !== undefined;
  const touchesTerms =
    data.description !== undefined ||
    data.amount !== undefined ||
    data.kind !== undefined ||
    data.deliverableId !== undefined ||
    data.dueAt !== undefined;

  if (touchesLedger && !rights.canManageMoney) {
    return NextResponse.json(
      {
        error:
          "Recording invoices and payments is Finance's call. Ask Finance to confirm, or raise a request on the client.",
        suggestRequest: true,
      },
      { status: 403 },
    );
  }
  if (touchesTerms && !rights.canEdit && !rights.canManageMoney) {
    return NextResponse.json(
      {
        error: "This client belongs to another manager. Raise a request and its owner will action it.",
        suggestRequest: true,
      },
      { status: 403 },
    );
  }

  // A paid fee's amount is frozen. Editing the total after money has landed
  // silently changes what "paid in full" means and would make the outstanding
  // balance wrong in either direction.
  if (data.amount !== undefined && fee.paidMinor > 0) {
    return NextResponse.json(
      { error: "This fee has payments recorded against it — its amount can no longer be changed." },
      { status: 409 },
    );
  }

  let amountMinor: number | undefined;
  if (data.amount !== undefined) {
    const parsedAmount = parseMoneyToMinor(data.amount);
    if (parsedAmount === null) {
      return NextResponse.json({ error: "Enter a valid, non-negative amount." }, { status: 400 });
    }
    amountMinor = parsedAmount;
  }

  let paidMinor: number | undefined;
  if (data.paidAmount !== undefined) {
    const parsedPaid = parseMoneyToMinor(data.paidAmount);
    if (parsedPaid === null) {
      return NextResponse.json({ error: "Enter a valid, non-negative payment." }, { status: 400 });
    }
    if (parsedPaid > (amountMinor ?? fee.amountMinor)) {
      return NextResponse.json(
        { error: "Payment recorded is more than the fee itself. Check the figure." },
        { status: 400 },
      );
    }
    paidMinor = parsedPaid;
  }

  const nextAmount = amountMinor ?? fee.amountMinor;
  const nextPaid = paidMinor ?? fee.paidMinor;
  const nextDueAt =
    data.dueAt !== undefined ? (data.dueAt ? new Date(data.dueAt) : null) : fee.dueAt;

  // Status is derived from the numbers, never typed in — see derivedFeeStatus.
  const baseStatus = data.writeOff
    ? "WRITTEN_OFF"
    : data.markInvoiced && fee.status === "DRAFT"
      ? "INVOICED"
      : fee.status;
  const status = data.writeOff
    ? ("WRITTEN_OFF" as const)
    : derivedFeeStatus(
        { amountMinor: nextAmount, paidMinor: nextPaid, status: baseStatus, dueAt: nextDueAt },
      );

  const paymentConfirmed = paidMinor !== undefined && paidMinor > fee.paidMinor;

  const updated = await prisma.clientFee.update({
    where: { id },
    data: {
      ...(data.description !== undefined ? { description: data.description.trim() } : {}),
      ...(amountMinor !== undefined ? { amountMinor } : {}),
      ...(data.kind !== undefined ? { kind: data.kind } : {}),
      ...(data.deliverableId !== undefined ? { deliverableId: data.deliverableId } : {}),
      ...(data.dueAt !== undefined ? { dueAt: nextDueAt } : {}),
      ...(data.invoiceRef !== undefined ? { invoiceRef: data.invoiceRef?.trim() || null } : {}),
      ...(data.markInvoiced && !fee.invoicedAt ? { invoicedAt: new Date() } : {}),
      ...(paidMinor !== undefined ? { paidMinor } : {}),
      ...(paymentConfirmed
        ? { paidAt: new Date(), confirmedById: user.id }
        : {}),
      status,
    },
    include: {
      recordedBy: { select: { id: true, fullName: true } },
      confirmedBy: { select: { id: true, fullName: true } },
      deliverable: { select: { id: true, title: true } },
    },
  });

  await logAudit({
    actorId: user.id,
    // Money arriving is its own audit action. "Who said this was paid" is the
    // question an auditor asks, and it should not be buried in a generic update.
    action: paymentConfirmed ? "CLIENT_FEE_PAYMENT_CONFIRMED" : "CLIENT_FEE_UPDATED",
    targetType: "ClientFee",
    targetId: id,
    metadata: {
      clientId: fee.clientId,
      fields: Object.keys(data),
      ...(paymentConfirmed
        ? { paidFromMinor: fee.paidMinor, paidToMinor: nextPaid, currency: fee.currency }
        : {}),
      status,
    },
  });

  return NextResponse.json({ fee: updated });
}

// DELETE /api/clients/fees/[id] — only while it is still a draft with no money
// against it. A fee that has been invoiced is part of the ledger: write it off
// instead, so the trail survives.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("clients.finance.read");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  const fee = await prisma.clientFee.findUnique({
    where: { id },
    include: { client: { select: { id: true, ownerId: true } } },
  });
  if (!fee) return NextResponse.json({ error: "Fee not found" }, { status: 404 });

  const rights = await clientRightsFor(user.id, fee.client);
  if (!rights.canEdit && !rights.canManageMoney) {
    return accessResponse(
      new ClientAccessError(403, "This client belongs to another manager.", true),
    );
  }
  if (fee.status !== "DRAFT" || fee.paidMinor > 0) {
    return NextResponse.json(
      { error: "This fee is already on the ledger. Write it off rather than deleting it." },
      { status: 409 },
    );
  }

  await prisma.clientFee.delete({ where: { id } });
  await logAudit({
    actorId: user.id,
    action: "CLIENT_FEE_DELETED",
    targetType: "ClientFee",
    targetId: id,
    metadata: { clientId: fee.clientId, amountMinor: fee.amountMinor },
  });

  return NextResponse.json({ ok: true });
}
