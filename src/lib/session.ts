import { cache } from "react";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";

// Wrapped in React.cache() so that multiple server components in the same
// render tree (layout + page) share one cookie-read + HMAC-verify per request.
export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies();
  return getSessionUserFromCookieStore(cookieStore);
});
