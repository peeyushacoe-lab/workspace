import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSessionUserFromCookieStore, type SessionUser } from "@/lib/auth";
import { signPayload } from "@/lib/session-crypto";
import { getSessionPerms } from "@/lib/rbac/session-perms";
import { sessionCookieOptions } from "@/lib/cookie-options";

// ─── Session cookie refresh (RFC-001, PR6) ────────────────────────────────────
// The portal layout redirects here when the cookie's permEpoch is behind the DB
// (i.e. an admin changed the user's roles/permissions). This route handler — which,
// unlike a Server Component, is allowed to set cookies — re-issues `cybersage_user`
// with fresh role, permissions and epoch, then bounces back to `next`.

function safeNext(next: string | null): string {
  // Only allow internal, non-protocol-relative paths.
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/home";
}

export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const cookieUser = getSessionUserFromCookieStore(await cookies());

  if (!cookieUser) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Re-fetch authoritative fields from the DB — role/org may have changed too.
  const dbUser = await prisma.user.findUnique({
    where: { id: cookieUser.id },
    select: {
      id: true, email: true, fullName: true, role: true,
      isActive: true, mustResetPassword: true, mfaEnabled: true,
      organizationId: true, orgRole: true,
    },
  });

  if (!dbUser || !dbUser.isActive) {
    const res = NextResponse.redirect(new URL("/login", request.url));
    res.cookies.delete("cybersage_user");
    res.cookies.delete("cybersage_session");
    return res;
  }

  const { perms, permEpoch } = await getSessionPerms(dbUser.id);

  const sessionUser: SessionUser = {
    id: dbUser.id,
    email: dbUser.email,
    fullName: dbUser.fullName,
    role: dbUser.role,
    mustResetPassword: dbUser.mustResetPassword,
    mfaEnabled: dbUser.mfaEnabled,
    organizationId: dbUser.organizationId,
    orgRole: dbUser.orgRole,
    perms,
    permEpoch,
  };

  const res = NextResponse.redirect(new URL(next, request.url));
  res.cookies.set(
    "cybersage_user",
    signPayload(JSON.stringify(sessionUser)),
    sessionCookieOptions(),
  );
  return res;
}
