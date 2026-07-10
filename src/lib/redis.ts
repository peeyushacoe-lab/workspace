import { Redis, type RedisOptions } from "ioredis";

const redisUrl = process.env.REDIS_URL;

function retryStrategy(times: number): number | null {
  if (times > 10) return null;
  return Math.min(times * 150, 3000);
}

// Upstash requires TLS when using rediss:// URLs. ioredis enables TLS
// automatically when the URL scheme is rediss://, but we also enable it
// when the URL targets port 6380 (Upstash's TLS port) in case the URL
// was provided without the double-s scheme.
const tlsEnabled = redisUrl
  ? redisUrl.startsWith("rediss://") || redisUrl.includes(":6380")
  : false;

const BASE_OPTIONS: Partial<RedisOptions> = {
  enableOfflineQueue: true,
  connectTimeout: 10_000,
  ...(tlsEnabled && { tls: {} }),
  retryStrategy,
  reconnectOnError(err: Error) {
    // Reconnect when Upstash drops an idle TCP connection
    return /ECONNRESET|ETIMEDOUT|ECONNREFUSED/.test(err.message);
  },
  ...(!redisUrl && {
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379"),
    password: process.env.REDIS_PASSWORD,
  }),
};

// General-purpose client — finite retry so commands don't block forever
const GENERAL_OPTIONS: RedisOptions = { ...BASE_OPTIONS, maxRetriesPerRequest: 3 };

// BullMQ requires maxRetriesPerRequest: null (retries handled by the queue)
const BULLMQ_OPTIONS: RedisOptions = { ...BASE_OPTIONS, maxRetriesPerRequest: null };

const globalForRedis = global as unknown as { redis?: Redis; redisBullMQ?: Redis };

function makeRedis(opts: RedisOptions): Redis {
  return redisUrl ? new Redis(redisUrl, opts) : new Redis(opts);
}

export const redis: Redis = globalForRedis.redis ?? makeRedis(GENERAL_OPTIONS);

// BullMQ and SSE routes need a *dedicated* connection for blocking commands.
// Reusing `redis` for pub/sub would block all regular commands on that client.
export function createDedicatedRedis(): Redis {
  return makeRedis(BULLMQ_OPTIONS);
}

// BullMQ bundles its own ioredis version; the types are structurally incompatible
// even though they work at runtime. Cast here so queue files don't each need `as any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const redisConnection: any =
  globalForRedis.redisBullMQ ?? makeRedis(BULLMQ_OPTIONS);

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
  globalForRedis.redisBullMQ = redisConnection;
}
