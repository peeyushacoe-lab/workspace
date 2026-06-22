import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://user:password@localhost:5432/cybersage_mail?schema=public";

// On Vercel/serverless, each lambda has its own pool. With many concurrent
// lambdas a max of 5 each can exhaust Postgres's connection limit fast.
// In production we keep max:2 per lambda (rely on PgBouncer / Neon pooler
// in front of the DB). In dev/worker processes we allow a larger pool.
const isServerless = process.env.VERCEL === "1" || process.env.CF_PAGES === "1";
const POOL_MAX = isServerless ? 2 : (parseInt(process.env.DB_POOL_MAX ?? "5", 10));

// Persistent pool with min:1 — keeps at least one connection open so Neon's
// compute never auto-suspends between requests. idleTimeoutMillis:0 prevents
// pg from closing idle connections, which would let Neon suspend.
const pgPool =
  globalForPrisma.pgPool ??
  (() => {
    const pool = new Pool({
      connectionString,
      max: POOL_MAX,
      min: isServerless ? 0 : 1, // serverless: don't hold connections between requests
      idleTimeoutMillis: isServerless ? 10_000 : 0,
      connectionTimeoutMillis: 5_000, // fail fast on cold start rather than hanging
      allowExitOnIdle: false,
      keepAlive: !isServerless,
      keepAliveInitialDelayMillis: 10_000,
    });
    // Neon closes idle connections server-side. Without this handler the error
    // becomes an unhandledRejection that crashes the Node process.
    pool.on("error", (err) => {
      console.error("[pg pool] idle client error:", err.message);
    });
    return pool;
  })();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(pgPool),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.pgPool = pgPool;
  globalForPrisma.prisma = prisma;
}
