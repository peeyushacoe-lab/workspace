import jwt from "jsonwebtoken";
import { createHash } from "crypto";
import { prisma } from "./prisma";
import { redis } from "./redis";

interface MobileTokenPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

// ---------------------------------------------------------------------------
// Token revocation — stored in Redis as `mobile:revoked:{tokenHash}`
// TTL is set to the token's remaining lifetime so the key auto-expires.
// Call revokeUserMobileTokens(userId) to immediately block all mobile sessions
// for a user (e.g. admin suspend, forced logout).
// ---------------------------------------------------------------------------
function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 32);
}

/** Revoke a specific token */
export async function revokeMobileToken(token: string, ttlSeconds = 60 * 60 * 8): Promise<void> {
  const key = `mobile:revoked:${tokenHash(token)}`;
  await redis.set(key, "1", "EX", ttlSeconds);
}

/** Revoke ALL mobile sessions for a user by setting a per-user revocation fence.
 *  Any token issued BEFORE `Date.now()` will be rejected on next request.
 *  This is the function to call from the admin "Deactivate user" / "Force logout" flow. */
export async function revokeUserMobileTokens(userId: string): Promise<void> {
  const key = `mobile:revoked_before:${userId}`;
  // Tokens have an 8-hour TTL max, so keep the fence for 9 hours to be safe.
  await redis.set(key, String(Math.floor(Date.now() / 1000)), "EX", 60 * 60 * 9);
}

async function isTokenRevoked(token: string, payload: MobileTokenPayload): Promise<boolean> {
  try {
    const [specific, fence] = await Promise.all([
      redis.get(`mobile:revoked:${tokenHash(token)}`),
      redis.get(`mobile:revoked_before:${payload.userId}`),
    ]);
    if (specific) return true;
    if (fence && payload.iat && payload.iat < parseInt(fence)) return true;
    return false;
  } catch {
    // If Redis is down, fail open (don't block the user) but log it.
    console.error("[mobile-auth] Redis unavailable for revocation check");
    return false;
  }
}

export async function getMobileUser(request: Request): Promise<MobileTokenPayload | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  const token = auth.slice(7);
  const secret = process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? "cybersage-mobile-secret";

  try {
    const payload = jwt.verify(token, secret) as MobileTokenPayload;

    // Check revocation list before hitting the DB
    if (await isTokenRevoked(token, payload)) return null;

    // Lightweight active-user check
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { isActive: true },
    });
    if (!user?.isActive) return null;

    // Update presence lastSeenAt fire-and-forget
    prisma.userPresence.upsert({
      where: { userId: payload.userId },
      update: { lastSeenAt: new Date(), status: "ONLINE" },
      create: { userId: payload.userId, status: "ONLINE", lastSeenAt: new Date() },
    }).catch(() => {});

    return payload;
  } catch {
    return null;
  }
}
