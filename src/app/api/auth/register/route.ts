import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { signPayload, generateSessionToken } from "@/lib/session-crypto";
import { createSession } from "@/lib/session-tracker";
import { logAudit } from "@/lib/audit";
import { emitEvent } from "@/lib/events";
import { checkRateLimit } from "@/lib/rate-limit";
import type { SessionUser } from "@/lib/auth";
import bcrypt from "bcrypt";

const PLAN_LIMITS: Record<string, { maxUsers: number; trialDays: number }> = {
  free:       { maxUsers: 5,         trialDays: 0 },
  starter:    { maxUsers: 25,        trialDays: 14 },
  pro:        { maxUsers: 1_000_000, trialDays: 14 },
  enterprise: { maxUsers: 1_000_000, trialDays: 30 },
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "workspace";
}

function getClientIp(req: NextRequest) {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0]!.trim() : (req.headers.get("x-real-ip") ?? "unknown");
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { allowed } = await checkRateLimit(`register:${ip}`, 5, 60 * 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many registration attempts. Please try again later." }, { status: 429 });
  }

  const { fullName, email, company, password, plan } = await request.json() as {
    fullName?: string;
    email?: string;
    company?: string;
    password?: string;
    plan?: string;
  };

  // Validation
  if (!fullName?.trim() || !email?.trim() || !company?.trim() || !password) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  const selectedPlan = PLAN_LIMITS[plan ?? "free"] ? (plan ?? "free") : "free";
  const limits = PLAN_LIMITS[selectedPlan]!;

  try {
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Generate a unique org slug
    const baseSlug = slugify(company);
    let slug = baseSlug;
    let suffix = 1;
    while (await prisma.organization.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const trialEndsAt = limits.trialDays > 0
      ? new Date(Date.now() + limits.trialDays * 24 * 60 * 60 * 1000)
      : null;

    const { user, org } = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: company.trim(),
          slug,
          plan: selectedPlan.toUpperCase(),
          maxUsers: limits.maxUsers,
          trialEndsAt,
          billingEmail: normalizedEmail,
        },
      });

      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          fullName: fullName.trim(),
          passwordHash,
          role: "ADMIN",
          orgRole: "OWNER",
          organizationId: org.id,
          company: company.trim(),
        },
      });

      // Create a default mailbox for this user
      await tx.mailbox.create({
        data: {
          email: normalizedEmail,
          displayName: fullName.trim(),
          organizationId: org.id,
          accessLogs: { create: { userId: user.id, role: "OWNER" } },
        },
      });

      return { user, org };
    });

    await logAudit({
      actorId: user.id,
      action: "USER_CREATE",
      targetType: "User",
      targetId: user.id,
      ipAddress: ip,
      metadata: { email: normalizedEmail, org: org.slug, plan: selectedPlan },
    });

    emitEvent("USER_LOGIN", {
      userId: user.id,
      email: user.email,
      role: user.role,
      ipAddress: ip,
      success: true,
    });

    // Sign the user in immediately
    const sessionUser: SessionUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      mustResetPassword: false,
      organizationId: org.id,
      orgRole: "OWNER",
    };

    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    };

    const sessionToken = generateSessionToken();
    createSession(user.id, sessionToken, request).catch(() => {});

    const response = NextResponse.json({ ok: true }, { status: 201 });
    response.cookies.set("cybersage_session", sessionToken, cookieOptions);
    response.cookies.set("cybersage_user", signPayload(JSON.stringify(sessionUser)), cookieOptions);
    return response;
  } catch (err) {
    console.error("[register] error:", err);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
