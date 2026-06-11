import { redis } from "@/lib/redis";

type RateLimitResult = { allowed: boolean; retryAfter: number };

// Per-instance in-memory fallback used only when Redis is unreachable.
// Serverless functions are short-lived so this won't accumulate indefinitely,
// but it prevents a Redis outage from completely bypassing rate limits.
const memFallback = new Map<string, { count: number; expires: number }>();

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const fullKey = `rate:${key}`;
  try {
    const count = await redis.incr(fullKey);
    if (count === 1) {
      await redis.expire(fullKey, windowSeconds);
    }
    if (count > limit) {
      const ttl = await redis.ttl(fullKey);
      return { allowed: false, retryAfter: ttl > 0 ? ttl : windowSeconds };
    }
    return { allowed: true, retryAfter: 0 };
  } catch {
    // Redis unavailable — fall back to per-instance memory (best-effort)
    const now = Date.now();
    const entry = memFallback.get(fullKey);
    if (!entry || entry.expires < now) {
      memFallback.set(fullKey, { count: 1, expires: now + windowSeconds * 1000 });
      return { allowed: true, retryAfter: 0 };
    }
    entry.count += 1;
    if (entry.count > limit) {
      return { allowed: false, retryAfter: Math.ceil((entry.expires - now) / 1000) };
    }
    return { allowed: true, retryAfter: 0 };
  }
}
