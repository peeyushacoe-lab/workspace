/**
 * Session cookie options, shared by every route that issues or clears them.
 *
 * The `domain` is what makes per-app subdomains work: a cookie scoped to
 * `nexus.cybersage.uk` is NOT sent to `docs.cybersage.uk`, so without this the
 * user would appear logged out the moment they opened Docs. Setting
 * COOKIE_DOMAIN=.cybersage.uk scopes it to the parent domain, which every
 * subdomain inherits.
 *
 * Left unset (local dev, previews) the cookie stays host-only, which is the
 * correct and safest default.
 *
 * ⚠️ Changing COOKIE_DOMAIN invalidates existing cookies — the old host-only
 * cookie and the new domain-wide one are different cookies. Everyone is logged
 * out once on the deploy that introduces it. That is expected, one-time only.
 */
export function sessionCookieOptions(maxAgeSeconds = 60 * 60 * 8) {
  const domain = process.env.COOKIE_DOMAIN?.trim();
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
    ...(domain ? { domain } : {}),
  };
}

/**
 * Matching options for deleting a cookie. A cookie set with a `domain` can only
 * be cleared by a Set-Cookie carrying the SAME domain — clearing by name alone
 * silently leaves it in place, which would make logout appear to fail.
 */
export function clearCookieOptions() {
  const domain = process.env.COOKIE_DOMAIN?.trim();
  return {
    path: "/",
    ...(domain ? { domain } : {}),
  };
}
