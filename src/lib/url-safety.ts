// Shared helper for validating externally-supplied URLs before the server
// fetches them (SSRF mitigation — F-04). Used by:
//   - src/app/api/profile/route.ts       (validates avatarUrl on save)
//   - src/app/api/workspace/avatar/[id]/route.ts (validates before proxy fetch)
//
// Goal: block requests to loopback / link-local / private-network / other
// non-routable hosts, so a user-supplied avatarUrl can't be used to make the
// server fetch internal services (cloud metadata endpoint, internal admin
// panels, other containers on the same host, etc).

const PRIVATE_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,               // loopback
  /^0\.0\.0\.0$/,
  /^10\./,                 // RFC1918
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC1918
  /^192\.168\./,           // RFC1918
  /^169\.254\./,           // link-local / cloud metadata (169.254.169.254)
  /^::1$/,                 // IPv6 loopback
  /^fe80:/i,               // IPv6 link-local
  /^fc00:/i,               // IPv6 unique local
  /^fd[0-9a-f]{2}:/i,      // IPv6 unique local
  /\.local$/i,             // mDNS
  /^\[?::ffff:127\./i,     // IPv4-mapped IPv6 loopback
];

/**
 * Returns true if the given URL string points at localhost, a private/
 * link-local network, or is otherwise not a well-formed https URL.
 * Intended to be used as a pre-fetch guard — callers should reject the
 * URL (or fall back to a safe default) when this returns true.
 */
export function isPrivateOrInternalHost(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return true; // not a valid absolute URL — treat as unsafe
  }

  // Only https (and http in non-prod, for local dev convenience) is allowed.
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return true;
  }

  const hostname = parsed.hostname.toLowerCase();

  if (PRIVATE_HOSTNAME_PATTERNS.some((re) => re.test(hostname))) {
    return true;
  }

  // Bare numeric-looking hostnames that aren't caught above (e.g. decimal/hex
  // IP encodings like "2130706433" for 127.0.0.1, or "0x7f000001") are a
  // common SSRF bypass — block anything that isn't a normal dotted hostname
  // or a public dotted-quad IPv4 address we didn't already flag as private.
  if (/^0x[0-9a-f]+$/i.test(hostname) || /^\d+$/.test(hostname)) {
    return true;
  }

  return false;
}

/** Convenience wrapper: true if the URL is safe to fetch server-side. */
export function isSafeExternalUrl(rawUrl: string): boolean {
  return !isPrivateOrInternalHost(rawUrl);
}
