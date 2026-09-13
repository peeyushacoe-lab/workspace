import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAMES = ["cybersage_session", "cybersage_user", "cybersage_admin", "mfa_verified"];

export async function POST(request: NextRequest) {
  const isProd = process.env.NODE_ENV === "production";
  const domain = process.env.COOKIE_DOMAIN?.trim(); // e.g. ".cybersage.uk"

  // Build a Set-Cookie header string that expires the cookie immediately.
  // We send it TWICE — once host-only (no Domain attr) and once domain-scoped —
  // so we clear the cookie regardless of how it was originally set. This covers
  // the case where COOKIE_DOMAIN was not set at login time but is set now, or
  // vice-versa, without needing to know which variant is currently in the jar.
  const makeClear = (name: string, cookieDomain?: string) =>
    [
      `${name}=`,
      `Path=/`,
      cookieDomain ? `Domain=${cookieDomain}` : null,
      `Max-Age=0`,
      `Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
      `HttpOnly`,
      `SameSite=Lax`,
      isProd ? `Secure` : null,
    ]
      .filter(Boolean)
      .join("; ");

  const loginUrl = new URL("/login", request.url);
  // Use a 302 so POST→redirect doesn't cause method confusion in some clients.
  const response = new NextResponse(null, {
    status: 302,
    headers: { Location: loginUrl.toString() },
  });

  for (const name of COOKIE_NAMES) {
    // Host-only clear (covers cookies set without COOKIE_DOMAIN)
    response.headers.append("Set-Cookie", makeClear(name));
    // Domain-scoped clear (covers cookies set with COOKIE_DOMAIN=.cybersage.uk)
    if (domain) {
      response.headers.append("Set-Cookie", makeClear(name, domain));
    }
  }

  return response;
}
