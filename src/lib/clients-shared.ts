// Pure utility functions and presentation constants for the clients module.
// This file is safe to import in client components — it has no server-side
// dependencies (no prisma, no next/headers, no rbac/can).
// Server-side functions live in clients.ts and re-export everything from here.

import type {
  ClientStatus,
  DeliverableStatus,
  FeeKind,
  FeeStatus,
  ClientRequestStatus,
  ClientRequestPriority,
} from "@/generated/prisma/enums";

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
 * Returns null on anything that is not a clean, non-negative amount.
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
  return Math.round(value * 100);
}

/** Outstanding balance on a fee, never negative. */
export function outstandingMinor(fee: { amountMinor: number; paidMinor: number }): number {
  return Math.max(0, fee.amountMinor - fee.paidMinor);
}

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
