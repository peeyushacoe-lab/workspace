import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendInviteEmail } from "@/lib/email";
import { generateEmployeeId } from "@/lib/employee-id";
import bcrypt from "bcrypt";
import crypto from "crypto";

const VALID_ROLES = new Set([
  "ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER",
  "DEVELOPER", "CYBER_SECURITY", "QA", "MARKETING",
  "RESEARCH", "FINANCE", "OPERATIONS", "SUPPORT", "INTERNSHIP",
]);

type ImportRow = { email: string; fullName: string; role: string };

type RowResult = {
  email: string;
  status: "created" | "skipped" | "error";
  reason?: string;
  // Only populated when Resend is not configured and email could not be sent
  tempPassword?: string;
};

export async function POST(request: Request) {
  const currentUser = getSessionUserFromCookieStore(await cookies());
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { users } = (await request.json()) as { users?: ImportRow[] };

  if (!Array.isArray(users) || users.length === 0) {
    return NextResponse.json({ error: "No users provided" }, { status: 400 });
  }

  if (users.length > 200) {
    return NextResponse.json({ error: "Maximum 200 users per import" }, { status: 400 });
  }

  const results: RowResult[] = [];

  for (const row of users) {
    const email = row.email?.trim().toLowerCase();
    const fullName = row.fullName?.trim();
    const role = row.role?.trim().toUpperCase();

    if (!email || !email.includes("@")) {
      results.push({ email: email ?? "(empty)", status: "error", reason: "Invalid email" });
      continue;
    }
    if (!fullName) {
      results.push({ email, status: "error", reason: "Missing full name" });
      continue;
    }
    if (!VALID_ROLES.has(role)) {
      results.push({ email, status: "error", reason: `Invalid role: ${role}` });
      continue;
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      results.push({ email, status: "skipped", reason: "User already exists" });
      continue;
    }

    try {
      // 16 bytes = 128-bit entropy temp password
      const tempPassword = crypto.randomBytes(16).toString("hex");
      const passwordHash = await bcrypt.hash(tempPassword, 12);

      const employeeId = await generateEmployeeId(role).catch(() => null);

      await prisma.user.create({
        data: {
          email,
          fullName,
          role: role as Parameters<typeof prisma.user.create>[0]["data"]["role"],
          passwordHash,
          ...(employeeId ? { preferences: { hr: { employeeId } } } : {}),
          mustResetPassword: true,
          invitedBy: currentUser.id,
        },
      });

      await logAudit({
        actorId: currentUser.id,
        action: "USER_CREATE",
        metadata: { email, fullName, role, method: "csv_import" },
      });

      // Attempt to deliver credentials via email — prefer not exposing them in the API response
      let emailSent = false;
      try {
        await sendInviteEmail({
          toPersonalEmail: email,
          fullName,
          workEmail: email,
          tempPassword,
          invitedByName: currentUser.fullName,
        });
        emailSent = true;
      } catch {
        // Resend not configured or delivery failed — fall back to returning in response
      }

      results.push({
        email,
        status: "created",
        // Only include tempPassword if email delivery failed (admin must distribute manually)
        ...(emailSent ? {} : { tempPassword }),
      });
    } catch {
      results.push({ email, status: "error", reason: "Database error" });
    }
  }

  const created = results.filter(r => r.status === "created").length;
  const skipped = results.filter(r => r.status === "skipped").length;
  const errors = results.filter(r => r.status === "error").length;

  // Prevent this response from being cached anywhere — it may contain temp passwords
  return NextResponse.json(
    { results, summary: { created, skipped, errors } },
    { headers: { "Cache-Control": "no-store, no-cache", "Pragma": "no-cache" } }
  );
}
