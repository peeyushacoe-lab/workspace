import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();

    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      debug: false,
    });

    // Pre-warm the database connection so Neon's compute is already running
    // before the first user request arrives. Fires and forgets — startup
    // isn't blocked if the DB is briefly unavailable.
    if (process.env.DATABASE_URL) {
      import("@/lib/prisma")
        .then(({ prisma }) => prisma.$queryRaw`SELECT 1`)
        .catch(() => {});
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
