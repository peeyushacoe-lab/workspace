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

// Persistent pool with min:1 — keeps at least one connection open so Neon's
// compute never auto-suspends between requests. idleTimeoutMillis:0 prevents
// pg from closing idle connections, which would let Neon suspend.
const pgPool =
  globalForPrisma.pgPool ??
  (() => {
    const pool = new Pool({
      connectionString,
      max: 5,
      min: 1,
      idleTimeoutMillis: 0,
      allowExitOnIdle: false,
      keepAlive: true,
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
