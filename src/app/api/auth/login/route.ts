import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessPath, getPortalHome, type SessionUser } from "@/lib/auth";
import { signPayload, generateSessionToken } from "@/lib/session-crypto";
import { getSessionPerms } from "@/lib/rbac/session-perms";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { createSession } from "@/lib/session-tracker";
import { emitEvent } from "@/lib/events";
import { securitySyncQueue } from "@/lib/queues/security-sync.queue";
import bcrypt from "bcrypt";

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

async function recordLoginEvent(data: {
  userId: string | null;
  email: string;
  success: boolean;
  ip: string | null;
  userAgent: string | null;
}) {
  try {
    await prisma.loginEvent.create({ data });
    await logAudit({
      actorId: data.userId,
      action: data.success ? "LOGIN_SUCCESS" : "LOGIN_FAILURE",
      ipAddress: data.ip,
      metadata: { email: data.email, userAgent: data.userAgent },
    });
  } catch (error) {
    console.error("Failed to record login event:", error);
  }
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent");

  const { allowed, retryAfter } = await checkRateLimit(`login:${ip}`, 10, 15 * 60);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later.", retryAfter },
      { status: 429 },
    );
  }

  let requestedNext = "";
  let email = "";

  try {
    const formData = await request.formData();
    email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    requestedNext = String(formData.get("next") ?? "");

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    // Always run bcrypt even when user not found — prevents timing-based user enumeration.
    const DUMMY_HASH = "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345";

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, role: true, fullName: true, isActive: true, mustResetPassword: true, mfaEnabled: true, organizationId: true, orgRole: true },
    });

    const hashToCompare = user?.passwordHash ?? DUMMY_HASH;
    const isValidPassword = await bcrypt.compare(password, hashToCompare);

    if (!user || !isValidPassword || !user.isActive) {
      await recordLoginEvent({ userId: user?.id ?? null, email, success: false, ip, userAgent });
      if (user?.id) {
        emitEvent("USER_LOGIN", { userId: user.id, email, role: user.role, ipAddress: ip, success: false, userAgent: userAgent ?? undefined });
        securitySyncQueue.add("analyze-login-fail", { type: "ANALYZE_LOGIN", userId: user.id, email, ipAddress: ip, userAgent: userAgent ?? "", success: false }).catch(() => {});
      }
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    await recordLoginEvent({ userId: user.id, email, success: true, ip, userAgent });

    emitEvent("USER_LOGIN", {
      userId: user.id,
      email: user.email,
      role: user.role,
      ipAddress: ip,
      success: true,
      userAgent: userAgent ?? undefined,
    });

    securitySyncQueue
      .add("analyze-login", {
        type: "ANALYZE_LOGIN",
        userId: user.id,
        email: user.email,
        ipAddress: ip,
        userAgent: userAgent ?? "",
        success: true,
      })
      .catch(() => {});

    // RBAC (RFC-001): embed the user's effective permissions + epoch in the cookie
    // so Edge middleware can gate pages without a DB call.
    const { perms, permEpoch } = await getSessionPerms(user.id);

    const sessionUser: SessionUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      mustResetPassword: user.mustResetPassword,
      mfaEnabled: user.mfaEnabled,
      organizationId: user.organizationId,
      orgRole: user.orgRole,
      perms,
      permEpoch,
    };

    const roleHome = getPortalHome(user.role);
    // Forced password reset takes priority over any requested destination.
    // /api/sso/authorize is explicitly allowed as a next destination (internal SSO flow).
    const isSsoNext = requestedNext.startsWith("/api/sso/authorize");
    const redirectTo = user.mustResetPassword
      ? "/reset-password"
      : isSsoNext || (requestedNext.startsWith("/") && canAccessPath(sessionUser, requestedNext))
        ? requestedNext
        : roleHome;

    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    };

    const sessionToken = generateSessionToken();
    createSession(user.id, sessionToken, request).catch(() => {});

    const response = NextResponse.json(
      { redirectTo },
      { headers: { "Cache-Control": "no-store, no-cache", "Pragma": "no-cache" } }
    );
    response.cookies.set("cybersage_session", sessionToken, cookieOptions);
    response.cookies.set("cybersage_user", signPayload(JSON.stringify(sessionUser)), cookieOptions);

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}
