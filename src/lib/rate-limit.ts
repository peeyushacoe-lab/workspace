import { redis } from "@/lib/redis";

type RateLimitResult = { allowed: boolean; retryAfter: number };

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
    // If Redis is unavailable, fail open to avoid locking everyone out
    return { allowed: true, retryAfter: 0 };
  }
}
