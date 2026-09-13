import { NextResponse, type NextRequest } from "next/server";
import { clearCookieOptions } from "@/lib/cookie-options";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url));

  // Clear domain-scoped cookies (set with COOKIE_DOMAIN=.cybersage.uk in prod).
  // IMPORTANT: do NOT call response.cookies.delete() for the same names after
  // these — in Next.js the internal cookie map is keyed by name, so a plain
  // delete() call overwrites the domain-aware set() and the domain-scoped
  // cookie never gets a clearing Set-Cookie header, leaving the session alive.
  const opts = clearCookieOptions();
  response.cookies.set("cybersage_admin",   "", { ...opts, maxAge: 0 });
  response.cookies.set("cybersage_session", "", { ...opts, maxAge: 0 });
  response.cookies.set("cybersage_user",    "", { ...opts, maxAge: 0 });
  response.cookies.set("mfa_verified",      "", { ...opts, maxAge: 0 });

  // For environments where COOKIE_DOMAIN is NOT set (local dev, Vercel previews),
  // the cookies above were set host-only (no domain). clearCookieOptions() also
  // returns no domain in that case, so the same set() correctly clears them.

  return response;
}
