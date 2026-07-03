import { prisma } from "@/lib/prisma";

/** Annual leave allowances per type (working days per calendar year). null = untracked/unlimited. */
export const LEAVE_ALLOWANCES: Record<string, number | null> = {
  ANNUAL: 20,
  SICK: 10,
  CASUAL: 5,
  UNPAID: null,
  WFH: null,
  OTHER: null,
};

export const LEAVE_TYPES = ["ANNUAL", "SICK", "CASUAL", "UNPAID", "WFH", "OTHER"] as const;
export type LeaveTypeStr = (typeof LEAVE_TYPES)[number];

export const HR_MGMT_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER", "HR"] as const;

export function isHRManager(role: string) {
  return (HR_MGMT_ROLES as readonly string[]).includes(role);
}

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Working days (Mon–Fri, excluding given holidays) between two dates inclusive. */
export function businessDaysBetween(start: Date, end: Date, holidays: Set<string> = new Set()): number {
  let count = 0;
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 12));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 12));
  while (cur <= last) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6 && !holidays.has(toDateStr(cur))) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

/** Set of yyyy-mm-dd holiday strings for a given year. */
export async function holidaySetForYear(year: number): Promise<Set<string>> {
  const rows = await prisma.companyHoliday.findMany({
    where: { date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    select: { date: true },
  });
  return new Set(rows.map((r) => toDateStr(r.date)));
}

/** Leave days used per type (APPROVED only) for a user in a calendar year. */
export async function leaveUsedByType(userId: string, year: number): Promise<Record<string, number>> {
  const rows = await prisma.leaveRequest.findMany({
    where: {
      userId,
      status: "APPROVED",
      startDate: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
    },
    select: { type: true, days: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) out[r.type] = (out[r.type] ?? 0) + r.days;
  return out;
}

/** Default onboarding checklist applied to new employees. */
export const DEFAULT_ONBOARDING: { title: string; description?: string }[] = [
  { title: "Sign employment contract", description: "Signed copy uploaded to HR documents" },
  { title: "Provide ID document", description: "Passport or national ID for records" },
  { title: "Set up workstation & accounts", description: "Email, chat, drive, MFA enabled" },
  { title: "Complete security awareness training", description: "Phishing, password hygiene, DLP policy" },
  { title: "Read employee handbook", description: "Policies, code of conduct, leave process" },
  { title: "Meet your reporting manager", description: "Intro 1:1 scheduled and completed" },
  { title: "Emergency contact submitted", description: "Filled in via Settings → My HR" },
];

export const DEFAULT_OFFBOARDING: { title: string; description?: string }[] = [
  { title: "Revoke system access", description: "Disable account, rotate shared credentials" },
  { title: "Return company equipment" },
  { title: "Knowledge handover completed" },
  { title: "Final leave balance settled" },
  { title: "Exit interview conducted" },
];
