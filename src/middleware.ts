import { NextResponse, type NextRequest } from "next/server";
import { canAccessPath, getPortalHome, type SessionUser } from "@/lib/auth";

const protectedRoutes = [
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
];

const validRoles = new Set<string>([
  "ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER",
  "DEVELOPER", "CYBER_SECURITY", "QA", "MARKETING",
  "RESEARCH", "FINANCE", "OPERATIONS", "SUPPORT", "HR", "INTERNSHIP",
]);

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
  const isProtected = protectedRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route),
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("cybersage_session")?.value;
  const userCookie = request.cookies.get("cybersage_user")?.value;

  if (!sessionCookie || !userCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  const user = await parseUserCookie(userCookie);

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!canAccessPath(user, request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL(getPortalHome(user.role), request.url));
  }

  // MFA enforcement: admin-level roles with MFA enabled must complete the challenge each session
  // (MFA_ENFORCED_ROLES is intentionally empty — see comment above. Kept as
  // dead-but-inert logic rather than deleted, so re-enabling for specific
  // roles later is a one-line change.)
  const isMfaEnforcedRole = MFA_ENFORCED_ROLES.has(user.role);
  const hasMfaEnabled = user.mfaEnabled === true;
  const isOnMfaChallenge = request.nextUrl.pathname.startsWith("/mfa-challenge");

  // Cryptographically verify the mfa_verified cookie — presence alone is not enough
  const secret = process.env.SESSION_SECRET ?? "";
  const mfaRaw = request.cookies.get("mfa_verified")?.value ?? "";
  const mfaPayload = mfaRaw ? await verifyHmacCookie(mfaRaw, secret) : null;
  // Payload must match the authenticated user's ID — prevents cross-account cookie reuse
  const mfaVerified = mfaPayload === user.id;

  if (isMfaEnforcedRole && hasMfaEnabled && !mfaVerified && !isOnMfaChallenge) {
    const mfaUrl = new URL("/mfa-challenge", request.url);
    mfaUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(mfaUrl);
  }

  // Expose the current path to Server Components (RSC can't read it otherwise).
  // Used by the portal layout to build the return URL for a stale-cookie refresh
  // (RFC-001, PR6). Header-only — does not affect access gating.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}
