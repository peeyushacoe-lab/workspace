import { NextResponse, type NextRequest } from "next/server";
import { clearCookieOptions } from "@/lib/cookie-options";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url));

  // Must carry the same `domain` the cookies were set with — a domain-scoped
  // cookie cannot be cleared by name alone, so without this logout would
  // silently no-op once COOKIE_DOMAIN is in play and the user would stay
  // signed in across docs./sheets./drive. etc.
  const opts = clearCookieOptions();
  response.cookies.set("cybersage_admin", "", { ...opts, maxAge: 0 });
  response.cookies.set("cybersage_session", "", { ...opts, maxAge: 0 });
  response.cookies.set("cybersage_user", "", { ...opts, maxAge: 0 });

  // Belt and braces: also clear any host-only cookies left over from before
  // COOKIE_DOMAIN was introduced — a stale host-only cookie would otherwise
  // shadow the cleared domain-wide one.
  response.cookies.delete("cybersage_admin");
  response.cookies.delete("cybersage_session");
  response.cookies.delete("cybersage_user");

  return response;
}
