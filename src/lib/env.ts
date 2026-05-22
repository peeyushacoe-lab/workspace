/**
 * Validates required environment variables at server startup.
 * Call once from instrumentation.ts — crashes fast with a clear message rather than
 * failing silently at runtime.
 */
export function validateEnv() {
  const required: Record<string, string | undefined> = {
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    SESSION_SECRET: process.env.SESSION_SECRET,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };

  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
        "Set them in .env or your deployment environment.",
    );
  }

  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters long.");
  }

  // Warn (not crash) for optional-but-important vars
  const recommended: Record<string, string | undefined> = {
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  };
  const missingOptional = Object.entries(recommended)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missingOptional.length > 0) {
    console.warn(
      `[env] Optional env vars not set: ${missingOptional.join(", ")} — some features may be limited.`
    );
  }
}
