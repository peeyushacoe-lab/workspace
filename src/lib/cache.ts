/**
 * Redis-backed API cache — Phase 29 Performance
 * Thin helpers for GET route caching with ETag support.
 */
import { redis } from "@/lib/redis";
import crypto from "crypto";

const DEFAULT_TTL = 30; // seconds

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function setCached<T>(key: string, value: T, ttlSeconds = DEFAULT_TTL): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch { /* cache miss is acceptable */ }
}

export async function invalidate(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  } catch { /* non-fatal */ }
}

export function etag(data: unknown): string {
  return `"${crypto.createHash("md5").update(JSON.stringify(data)).digest("hex")}"`;
}

export function withETag(
  data: unknown,
  requestETag: string | null,
): { notModified: boolean; etag: string } {
  const tag = etag(data);
  return { notModified: requestETag === tag, etag: tag };
}
