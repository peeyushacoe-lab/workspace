import { Redis, type RedisOptions } from "ioredis";

const redisUrl = process.env.REDIS_URL;

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  ...(redisUrl
    ? {}
    : {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379"),
        password: process.env.REDIS_PASSWORD,
      }),
};

// Single shared singleton — avoids the original bug where two separate Redis
// instances were created (redisConnection AND redis) on every cold start.
const globalForRedis = global as unknown as { redis?: Redis };

function createRedis(): Redis {
  return redisUrl ? new Redis(redisUrl, redisOptions) : new Redis(redisOptions);
}

export const redis: Redis =
  globalForRedis.redis ?? createRedis();

// BullMQ and SSE routes need a *dedicated* connection for blocking commands.
// Reusing `redis` for pub/sub would block all regular commands on that client.
export function createDedicatedRedis(): Redis {
  return createRedis();
}

// Alias kept for BullMQ queue files that import redisConnection.
export const redisConnection: Redis = redis;

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
