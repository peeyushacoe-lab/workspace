import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

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

export const HR_MGMT_ROLES = ["HR"] as const;

export function isHRManager(role: string) {
  return role === "HR";
}

/** Leadership roles that mentor interns (mirror of internship API MENTOR_ROLES). */
export const MENTOR_MGMT_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;

/**
 * Lifecycle access: HR manages everyone; mentors (MGMT) manage interns only.
 * Pass the target's role when known — with no target role, only HR qualifies.
 */
export function canManageLifecycle(actorRole: string, targetRole?: string | null): boolean {
  if (isHRManager(actorRole)) return true;
  if (targetRole === "INTERNSHIP") {
    return (MENTOR_MGMT_ROLES as readonly string[]).includes(actorRole);
  }
  return false;
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

/* ── Employee lifecycle (onboarding / offboarding letters + NOC) ──────────────
 * State lives in user.preferences.hr.lifecycle — JSON, no migration needed.
 */

export interface Lifecycle {
  status?: "ONBOARDING" | "ACTIVE" | "OFFBOARDING" | "EXITED";
  type?: "RESIGNATION" | "TERMINATION";
  ref?: string;
  letterDocId?: string;
  letterSentAt?: string;
  signedDocId?: string;
  signedReturnedAt?: string;
  confidentialityAckAt?: string;
  signedVerifiedAt?: string;
  lastWorkingDay?: string;
  reason?: string;
  nocRef?: string;
  nocDocId?: string;
  nocIssuedAt?: string;
}

type PrefsObj = Record<string, unknown>;

export function readLifecycle(preferences: unknown): Lifecycle {
  if (!preferences || typeof preferences !== "object") return {};
  const hr = (preferences as PrefsObj).hr;
  if (!hr || typeof hr !== "object") return {};
  const lc = (hr as PrefsObj).lifecycle;
  return lc && typeof lc === "object" ? (lc as Lifecycle) : {};
}

/* ── Letter signatories ───────────────────────────────────────────────────────
 * Who signs onboarding/offboarding letters & NOCs. Stored in a Redis hash
 * (hr:signatories, id → JSON) — no migration. Two built-in defaults always
 * exist; uploading a signature for a default id stores an override in Redis.
 */

export interface Signatory {
  id: string;
  name: string;
  title: string;
  signatureKey?: string; // R2 key of the uploaded signature image
  signatureMime?: string;
  builtIn?: boolean;
  updatedAt?: string;
}

export const SIGNATORIES_KEY = "hr:signatories";

export const DEFAULT_SIGNATORIES: Signatory[] = [
  { id: "sig-ceo", name: "Khurram Qamar", title: "Chief Executive Officer", builtIn: true },
  { id: "sig-ciso", name: "Peeyush Kumar", title: "Chief Information Security Officer", builtIn: true },
];

/** All signatories: built-in defaults merged with (and overridden by) Redis entries. */
export async function listSignatories(): Promise<Signatory[]> {
  let stored: Record<string, string> = {};
  try {
    stored = await redis.hgetall(SIGNATORIES_KEY);
  } catch {
    /* redis unavailable → defaults only */
  }
  const byId = new Map<string, Signatory>(DEFAULT_SIGNATORIES.map((s) => [s.id, { ...s }]));
  for (const [id, raw] of Object.entries(stored)) {
    try {
      const parsed = JSON.parse(raw) as Signatory;
      const base = byId.get(id);
      byId.set(id, { ...base, ...parsed, id, builtIn: base?.builtIn ?? false });
    } catch {
      /* skip corrupt entry */
    }
  }
  return [...byId.values()].sort((a, b) => (a.builtIn === b.builtIn ? a.name.localeCompare(b.name) : a.builtIn ? -1 : 1));
}

export async function getSignatory(id: string | undefined | null): Promise<Signatory | null> {
  const all = await listSignatories();
  if (!id) return all[0] ?? null;
  return all.find((s) => s.id === id) ?? all[0] ?? null;
}

/** Merge a lifecycle patch into user.preferences.hr.lifecycle. */
export async function writeLifecycle(userId: string, patch: Partial<Lifecycle>): Promise<Lifecycle> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  const prefs: PrefsObj = user?.preferences && typeof user.preferences === "object" ? { ...(user.preferences as PrefsObj) } : {};
  const hr: PrefsObj = prefs.hr && typeof prefs.hr === "object" ? { ...(prefs.hr as PrefsObj) } : {};
  const lifecycle = { ...(hr.lifecycle && typeof hr.lifecycle === "object" ? (hr.lifecycle as Lifecycle) : {}), ...patch };
  hr.lifecycle = lifecycle;
  prefs.hr = hr;
  await prisma.user.update({ where: { id: userId }, data: { preferences: prefs as never } });
  return lifecycle;
}
