import { NextResponse, type NextRequest } from "next/server";
import { ALL_ROLES, canAccessPath, canAccessPathByPerms, getPortalHome, type SessionUser } from "@/lib/auth";
import { matchSubdomain, subdomainToPath, isPassthrough, shouldRedirectToHub, hubUrl } from "@/lib/subdomains";
import { jitsiCspHosts } from "@/lib/jitsi";

const protectedRoutes = [
  "/home",
  "/dashboard",
  "/contacts",
  "/profile",
  "/users",
  "/inbox",
  "/chat",
  "/drive",
  "/calendar",
  "/ai",
  "/soc",
  "/admin",
  "/settings",
  "/notes",
  "/docs",
  "/reset-password",
  "/mfa-challenge",
  "/compose",
  "/apps",
  "/meet",
  "/people",
  "/teams",
  "/tasks",
  "/whiteboard",
  "/billing",
  "/org",
  "/compliance",
  "/notifications",
  "/download",
  "/setup-passkey",
  "/mentor",
  "/hr",
  "/connect",
];

/**
 * Roles a session cookie may carry. Derived from `ALL_ROLES` rather than
 * re-listed, because the hand-copied version drifted: MEMBER was added to the
 * enum and to `pathAccess` but never here, so `parseUserCookie` rejected every
 * MEMBER cookie as malformed. Login succeeded, set a valid cookie, redirected to
 * the portal, middleware refused the cookie, and sent them back to /login —
 * an unbreakable loop that looked like a wrong password.
 */
const validRoles = new Set<string>(ALL_ROLES);

// MFA/passkey enforcement removed app-wide (2026-07-14) — it was blocking
// interns from getting into the app at all on first login. MFA is still
// available as a self-serve opt-in via /settings for anyone who wants it;
// this set staying empty is what keeps the challenge from ever being forced.
const MFA_ENFORCED_ROLES = new Set<string>([]);

function fromBase64Url(str: string): Uint8Array<ArrayBuffer> {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const base64 = padded.padEnd(padded.length + (4 - (padded.length % 4)) % 4, "=");
  const binary = atob(base64);
  const buf = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return view;
}

async function verifyHmacCookie(signed: string, secret: string): Promise<string | null> {
  try {
    const dot = signed.lastIndexOf(".");
    if (dot === -1) return null;
    const payloadB64 = signed.slice(0, dot);
    const receivedSig = signed.slice(dot + 1);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(receivedSig),
      new TextEncoder().encode(payloadB64),
    );
    if (!isValid) return null;
    return new TextDecoder().decode(fromBase64Url(payloadB64));
  } catch {
    return null;
  }
}

// ── Content-Security-Policy (nonce-based) ─────────────────────────────────────
// Generated fresh per request. Next.js's App Router injects its own inline
// hydration/streaming <script> tags on every page; it automatically applies
// whatever nonce it finds in the outgoing Content-Security-Policy header to
// those scripts, so as long as this header is set before rendering, no manual
// wiring is needed elsewhere. See next.config.ts for why this moved here
// (CSP must be per-request to carry a random nonce; static headers can't).
const isProd = process.env.NODE_ENV === "production";

function buildCsp(nonce: string): string {
  // Resolved from the shared helper so a self-hosted domain configured for the
  // embed is automatically allow-listed here too — previously the CSP read a
  // different env var than the iframe, so configuring one without the other
  // produced a silently blank meeting.
  const jitsiHost = jitsiCspHosts().join(" ");
  return [
    "default-src 'self'",
    // 'strict-dynamic' lets nonce'd scripts load further scripts (e.g. Sentry's
    // own loader); the explicit https:// sources remain as a fallback for the
    // rare browser that doesn't support strict-dynamic. unsafe-eval only in
    // dev, for Turbopack/webpack HMR.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isProd ? "" : "'unsafe-eval' "}https://browser.sentry-cdn.com`,
    `script-src-elem 'self' 'nonce-${nonce}' 'strict-dynamic' https://browser.sentry-cdn.com ${jitsiHost}`,
    // style-src keeps 'unsafe-inline' — inline styles are used widely and are
    // lower-severity (no code execution) than inline scripts.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com https://avatars.githubusercontent.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://*.sentry.io wss: ws: https://fonts.googleapis.com",
    "media-src 'self' blob:",
    "object-src 'none'",
    `frame-src 'self' ${jitsiHost}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function withCsp(response: NextResponse, nonce: string): NextResponse {
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  return response;
}

// Verifies the HMAC-signed user cookie using Web Crypto (native in Edge runtime).
// Node.js crypto.createHmac and crypto.subtle both implement standard HMAC-SHA256,
// so signatures produced by the login Route Handler verify correctly here.
async function parseUserCookie(signed: string): Promise<SessionUser | null> {
  try {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) return null;

    const payload = await verifyHmacCookie(signed, secret);
    if (!payload) return null;

    const parsed = JSON.parse(payload) as Partial<SessionUser>;

    if (
      typeof parsed.id === "string" &&
      typeof parsed.email === "string" &&
      typeof parsed.fullName === "string" &&
      typeof parsed.role === "string" &&
      validRoles.has(parsed.role)
    ) {
      return parsed as SessionUser;
    }
    return null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  // Nonce + CSP apply to EVERY request (public pages like /login need to
  // hydrate too, not just the protected routes below) — generate it first and
  // attach it to whichever response this function ends up returning.
  const nonce = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", buildCsp(nonce));

  // ── Per-app subdomains ────────────────────────────────────────────────────
  // docs.cybersage.uk/ → /docs, sheets.cybersage.uk/abc → /apps/sheets/abc, etc.
  // One deployment, several hostnames (see src/lib/subdomains.ts).
  //
  // Resolved BEFORE auth gating so the rewritten path is what gets checked:
  // a user hitting docs.cybersage.uk must be gated on /docs, and — if logged
  // out — must come back to /docs after login, not to "/".
  const subdomain = matchSubdomain(request.headers.get("host"));
  let pathname = request.nextUrl.pathname;
  let rewriteUrl: URL | null = null;

  if (subdomain && !isPassthrough(pathname)) {
    // An app subdomain serves ITS apps, not the whole product. Anything else
    // bounces to the hub — otherwise docs.cybersage.uk/drive rendered Drive
    // with the full workspace sidebar, and the subdomain was just Nexus
    // wearing a different hostname.
    if (shouldRedirectToHub(subdomain, pathname)) {
      const target = hubUrl(request.nextUrl.pathname + request.nextUrl.search);
      if (target) return withCsp(NextResponse.redirect(target), nonce);
    }

    const mapped = subdomainToPath(subdomain, pathname);
    if (mapped !== pathname) {
      pathname = mapped;
      rewriteUrl = new URL(request.url);
      rewriteUrl.pathname = mapped;
    }
  }

  /**
   * Every early return has to honour the rewrite, otherwise a subdomain request
   * would fall through to the hub's route tree and 404.
   */
  const proceed = () =>
    rewriteUrl
      ? NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } });

  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));

  if (!isProtected) {
    return withCsp(proceed(), nonce);
  }

  const sessionCookie = request.cookies.get("cybersage_session")?.value;
  const userCookie = request.cookies.get("cybersage_user")?.value;

  if (!sessionCookie || !userCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return withCsp(NextResponse.redirect(loginUrl), nonce);
  }

  const user = await parseUserCookie(userCookie);

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return withCsp(NextResponse.redirect(loginUrl), nonce);
  }

  // ── Access gating (RFC-001, PR7) ──────────────────────────────────────────
  // Role-based decision (old) vs permission-based decision (new, from cookie perms).
  const path = pathname;
  const oldDecision = canAccessPath(user, path);
  const newDecision = canAccessPathByPerms(user.perms, path); // boolean | null

  // Shadow mode: log any divergence so we can confirm the map is correct in prod
  // BEFORE flipping RBAC_ENFORCE on. The log should be empty in steady state.
  if (newDecision !== null && newDecision !== oldDecision) {
    console.warn(
      `[rbac-shadow] role=${user.role} path=${path} old=${oldDecision} new=${newDecision}`,
    );
  }

  // Enforce the permission decision when RBAC_ENFORCE=true and the cookie has perms;
  // otherwise fall back to the role-based decision (safe default, and covers cookies
  // issued before the RBAC rollout — those get refreshed by the portal layout).
  const enforce = process.env.RBAC_ENFORCE === "true";
  const effective = enforce ? (newDecision ?? oldDecision) : oldDecision;

  if (!effective) {
    return withCsp(NextResponse.redirect(new URL(getPortalHome(user.role), request.url)), nonce);
  }

  // MFA enforcement: admin-level roles with MFA enabled must complete the challenge each session
  // (MFA_ENFORCED_ROLES is intentionally empty — see comment above. Kept as
  // dead-but-inert logic rather than deleted, so re-enabling for specific
  // roles later is a one-line change.)
  const isMfaEnforcedRole = MFA_ENFORCED_ROLES.has(user.role);
  const hasMfaEnabled = user.mfaEnabled === true;
  const isOnMfaChallenge = pathname.startsWith("/mfa-challenge");

  // Cryptographically verify the mfa_verified cookie — presence alone is not enough
  const secret = process.env.SESSION_SECRET ?? "";
  const mfaRaw = request.cookies.get("mfa_verified")?.value ?? "";
  const mfaPayload = mfaRaw ? await verifyHmacCookie(mfaRaw, secret) : null;
  // Payload must match the authenticated user's ID — prevents cross-account cookie reuse
  const mfaVerified = mfaPayload === user.id;

  if (isMfaEnforcedRole && hasMfaEnabled && !mfaVerified && !isOnMfaChallenge) {
    const mfaUrl = new URL("/mfa-challenge", request.url);
    mfaUrl.searchParams.set("next", pathname);
    return withCsp(NextResponse.redirect(mfaUrl), nonce);
  }

  // Expose the current path to Server Components (RSC can't read it otherwise).
  // Used by the portal layout to build the return URL for a stale-cookie refresh
  // (RFC-001, PR6). Header-only — does not affect access gating.
  // This is the REWRITTEN path, so a refresh from docs.cybersage.uk returns to
  // the Docs route rather than to "/".
  requestHeaders.set("x-pathname", pathname);
  if (subdomain) requestHeaders.set("x-app-subdomain", subdomain.host);
  return withCsp(proceed(), nonce);
}
