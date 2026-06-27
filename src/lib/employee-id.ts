import { prisma } from "@/lib/prisma";

/**
 * Employee ID scheme
 * ──────────────────
 * Interns (role INTERNSHIP):  SI{4-digit global intern sequence}{join year}
 *   e.g. first intern in 2026 → SI00012026, second → SI00022026
 *
 * Sage staff (all other roles): SE{2-digit role code}{per-role sequence}{join year}
 *   e.g. first CISO  → SE0112026  (code 01, seq 1)
 *        second CISO → SE0122026  (code 01, seq 2)
 *        first CEO   → SE0212026  (code 02, seq 1)
 *
 * IDs are persisted in user.preferences.hr.employeeId (JSON — no schema migration).
 */

// Fixed 2-digit role codes for Sage staff. Interns use the SI scheme instead.
export const ROLE_CODES: Record<string, string> = {
  CISO: "01",
  CEO: "02",
  COO: "03",
  R_AND_D: "04",
  OPS_MANAGER: "05",
  ADMIN: "06",
  DEVELOPER: "07",
  CYBER_SECURITY: "08",
  QA: "09",
  MARKETING: "10",
  RESEARCH: "11",
  FINANCE: "12",
  OPERATIONS: "13",
  SUPPORT: "14",
};

/** Safely read preferences.hr.employeeId from a user's preferences JSON. */
export function readEmployeeId(preferences: unknown): string | null {
  if (!preferences || typeof preferences !== "object") return null;
  const hr = (preferences as Record<string, unknown>).hr;
  if (!hr || typeof hr !== "object") return null;
  const id = (hr as Record<string, unknown>).employeeId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Generate the next employee ID for a given role.
 * Sequences are derived from existing IDs (not row counts) so they stay unique
 * even after a user is deleted. Returns null for roles with no defined scheme.
 */
export async function generateEmployeeId(role: string): Promise<string | null> {
  const year = new Date().getFullYear();
  const users = await prisma.user.findMany({
    where: { role: role as never },
    select: { preferences: true },
  });
  const existing = users
    .map((u) => readEmployeeId(u.preferences))
    .filter((x): x is string => !!x);

  if (role === "INTERNSHIP") {
    // SI + 4-digit global intern sequence + year. Sequence sits at chars 2..6.
    const seqs = existing
      .filter((id) => id.startsWith("SI"))
      .map((id) => parseInt(id.slice(2, 6), 10))
      .filter((n) => !Number.isNaN(n));
    const next = (seqs.length ? Math.max(...seqs) : 0) + 1;
    return `SI${String(next).padStart(4, "0")}${year}`;
  }

  const code = ROLE_CODES[role];
  if (!code) return null; // role has no employee-ID scheme

  // SE + code + per-role sequence + 4-digit year. Sequence = the middle slice
  // between the "SE{code}" prefix and the trailing 4-digit year.
  const prefix = `SE${code}`;
  const seqs = existing
    .filter((id) => id.startsWith(prefix) && id.length > prefix.length + 4)
    .map((id) => parseInt(id.slice(prefix.length, id.length - 4), 10))
    .filter((n) => !Number.isNaN(n));
  const next = (seqs.length ? Math.max(...seqs) : 0) + 1;
  return `SE${code}${next}${year}`;
}
