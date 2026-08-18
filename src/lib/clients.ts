import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac/can";
import type {
  ClientStatus,
  DeliverableStatus,
  FeeKind,
  FeeStatus,
  ClientRequestStatus,
  ClientRequestPriority,
} from "@/generated/prisma/enums";

// Pure utilities are in clients-shared.ts so client components can import them
// without pulling in prisma/can/next-headers. Re-export everything here so
// server-side callers only need one import path.
export * from "@/lib/clients-shared";

// ─── Client book domain rules ─────────────────────────────────────────────────
//
// One place decides who may change a client record, because the answer is not a
// single permission key — it is a permission AND a record. `clients.write` says
// "this person manages clients"; it does not say *which* clients. A Business
// Manager holds `clients.write` for their own book and must be refused on a
// peer's, and no permission check alone can express that.
//
// Every mutating client route calls `assertCanEditClient` (or one of the
// wrappers below) before touching data. Do not re-derive these rules at a call
// site — a second copy is how the India book ends up editable from the UK.

/** Effective rights a viewer has over one specific client record. */
export type ClientRights = {
  canRead: boolean;
  /** Edit the client, its deliverables, and draft fees. */
  canEdit: boolean;
  /** Reassign the owner, delete the client. */
  canAdmin: boolean;
  /** See money at all. */
  canSeeMoney: boolean;
  /** Raise invoices and confirm payments — Finance only. */
  canManageMoney: boolean;
  /**
   * True when the viewer can see this record but not change it. This is the
   * CEO/CISO/COO case, and it is what makes the "raise a request" affordance
   * appear instead of an edit button.
   */
  isReadOnly: boolean;
};

export type ClientOwnership = { id: string; ownerId: string | null };

/**
 * Resolve a viewer's rights over one client.
 *
 * Ownership rule: `clients.admin` edits anyone's book (Ops Manager, Admin).
 * `clients.write` edits only records you own. Everyone else with
 * `clients.read` is a spectator.
 */
export async function clientRightsFor(
  userId: string,
  client: ClientOwnership | null,
): Promise<ClientRights> {
  const [read, write, admin, moneyRead, moneyManage] = await Promise.all([
    can(userId, "clients.read"),
    can(userId, "clients.write"),
    can(userId, "clients.admin"),
    can(userId, "clients.finance.read"),
    can(userId, "clients.finance.manage"),
  ]);

  const owns = client != null && client.ownerId === userId;
  const canEdit = admin || (write && owns);

  return {
    canRead: read,
    canEdit,
    canAdmin: admin,
    canSeeMoney: moneyRead,
    canManageMoney: moneyManage,
    isReadOnly: read && !canEdit,
  };
}

/** Rights for creating a NEW client (no record to own yet). */
export async function canCreateClient(userId: string): Promise<boolean> {
  return (await can(userId, "clients.write")) || (await can(userId, "clients.admin"));
}

export class ClientAccessError extends Error {
  constructor(
    public status: 403 | 404,
    message: string,
    /** Set when the refusal is "you may look but not touch" — the UI turns this into a request prompt. */
    public readonly suggestRequest = false,
  ) {
    super(message);
    this.name = "ClientAccessError";
  }
}

/**
 * Load a client and assert the viewer may edit it. Throws `ClientAccessError`
 * (404 if it does not exist, 403 if it is not theirs to change).
 */
export async function assertCanEditClient(userId: string, clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, ownerId: true, name: true, organizationId: true },
  });
  if (!client) throw new ClientAccessError(404, "Client not found");

  const rights = await clientRightsFor(userId, client);
  if (!rights.canRead) throw new ClientAccessError(404, "Client not found");
  if (!rights.canEdit) {
    throw new ClientAccessError(
      403,
      "This client belongs to another manager. Raise a request on the record and its owner will action it.",
      true,
    );
  }
  return { client, rights };
}

/** Load a client and assert the viewer may at least see it. */
export async function assertCanReadClient(userId: string, clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, ownerId: true, name: true, organizationId: true },
  });
  if (!client) throw new ClientAccessError(404, "Client not found");
  const rights = await clientRightsFor(userId, client);
  if (!rights.canRead) throw new ClientAccessError(404, "Client not found");
  return { client, rights };
}

// ─── Money ────────────────────────────────────────────────────────────────────
//
// Amounts are integer minor units everywhere — in the database, over the wire,
// and in component state. They become a decimal string exactly once, here, at
// render time. See the note above the Client models in schema.prisma.

/** "12345" minor units + "GBP" → "£123.45". Falls back to a plain code prefix. */
export function formatMoney(amountMinor: number, currency = "GBP"): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  }
}

/**
 * Parse user input ("1,250.50", "1250.5", "£1250") into integer minor units.
 * Returns null on anything that is not a clean, non-negative amount — callers
 * must treat null as a validation failure rather than coercing it to zero.
 */
export function parseMoneyToMinor(input: string | number): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) return null;
    return Math.round(input * 100);
  }
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned || (cleaned.match(/\./g) ?? []).length > 1) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  // Round rather than truncate: 0.1 + 0.2 style float error must not lose a penny.
  return Math.round(value * 100);
}

/** Outstanding balance on a fee, never negative. */
export function outstandingMinor(fee: { amountMinor: number; paidMinor: number }): number {
  return Math.max(0, fee.amountMinor - fee.paidMinor);
}

/**
 * The status a fee should hold given what has actually been paid. Status is
 * derived, not typed in by hand, so a "PAID" row can never disagree with its
 * own numbers. WRITTEN_OFF is terminal and is left alone.
 */
export function derivedFeeStatus(
  fee: { amountMinor: number; paidMinor: number; status: FeeStatus; dueAt?: Date | null },
  now: Date = new Date(),
): FeeStatus {
  if (fee.status === "WRITTEN_OFF" || fee.status === "DRAFT") return fee.status;
  if (fee.paidMinor >= fee.amountMinor && fee.amountMinor > 0) return "PAID";
  if (fee.paidMinor > 0) return "PART_PAID";
  if (fee.dueAt && fee.dueAt < now) return "OVERDUE";
  return "INVOICED";
}

/**
 * Apply derivedFeeStatus() to a fee for DISPLAY only — does not write to the
 * database. The hourly overdue sweep (src/workers/cleanup.worker.ts,
 * CLIENT_FEES_OVERDUE) is what persists OVERDUE so aggregates like
 * /api/clients/revenue-summary stay correct between runs; this closes the gap
 * in between, so a fee that quietly passed its due date ten minutes ago does
 * not still read "Invoiced" in the UI until the sweep next runs.
 */
export function withDisplayStatus<T extends { amountMinor: number; paidMinor: number; status: FeeStatus; dueAt?: Date | null }>(
  fee: T,
): T {
  const status = derivedFeeStatus(fee);
  return status === fee.status ? fee : { ...fee, status };
}

// ─── Presentation ─────────────────────────────────────────────────────────────
// Labels and Atrium token classes live together so a status can never render
// with the right word and the wrong colour.

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  PROSPECT: "Prospect",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  CHURNED: "Churned",
};

export const CLIENT_STATUS_TONE: Record<ClientStatus, string> = {
  PROSPECT: "text-accent bg-accent-soft border-accent/25",
  ACTIVE: "text-ok bg-ok-soft border-ok/25",
  ON_HOLD: "text-warn bg-warn-soft border-warn/25",
  CHURNED: "text-muted bg-surface-sunken border-border",
};

export const DELIVERABLE_STATUS_LABELS: Record<DeliverableStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DELIVERED: "Delivered",
  ACCEPTED: "Accepted",
};

export const DELIVERABLE_STATUS_TONE: Record<DeliverableStatus, string> = {
  NOT_STARTED: "text-muted bg-surface-sunken border-border",
  IN_PROGRESS: "text-accent bg-accent-soft border-accent/25",
  BLOCKED: "text-crit bg-crit-soft border-crit/25",
  DELIVERED: "text-violet bg-violet-soft border-violet/25",
  ACCEPTED: "text-ok bg-ok-soft border-ok/25",
};

export const FEE_KIND_LABELS: Record<FeeKind, string> = {
  RETAINER: "Retainer",
  PROJECT: "Project",
  MILESTONE: "Milestone",
  EXPENSE: "Expense",
};

export const FEE_STATUS_LABELS: Record<FeeStatus, string> = {
  DRAFT: "Draft",
  INVOICED: "Invoiced",
  PART_PAID: "Part paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  WRITTEN_OFF: "Written off",
};

export const FEE_STATUS_TONE: Record<FeeStatus, string> = {
  DRAFT: "text-muted bg-surface-sunken border-border",
  INVOICED: "text-accent bg-accent-soft border-accent/25",
  PART_PAID: "text-warn bg-warn-soft border-warn/25",
  PAID: "text-ok bg-ok-soft border-ok/25",
  OVERDUE: "text-crit bg-crit-soft border-crit/25",
  WRITTEN_OFF: "text-muted bg-surface-sunken border-border",
};

export const REQUEST_STATUS_LABELS: Record<ClientRequestStatus, string> = {
  OPEN: "Open",
  ACKNOWLEDGED: "Acknowledged",
  RESOLVED: "Resolved",
  DECLINED: "Declined",
};

export const REQUEST_STATUS_TONE: Record<ClientRequestStatus, string> = {
  OPEN: "text-warn bg-warn-soft border-warn/25",
  ACKNOWLEDGED: "text-accent bg-accent-soft border-accent/25",
  RESOLVED: "text-ok bg-ok-soft border-ok/25",
  DECLINED: "text-muted bg-surface-sunken border-border",
};

export const REQUEST_PRIORITY_LABELS: Record<ClientRequestPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const REQUEST_PRIORITY_TONE: Record<ClientRequestPriority, string> = {
  LOW: "text-muted bg-surface-sunken border-border",
  NORMAL: "text-muted bg-surface-sunken border-border",
  HIGH: "text-warn bg-warn-soft border-warn/25",
  URGENT: "text-crit bg-crit-soft border-crit/25",
};
