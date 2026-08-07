/**
 * Production environment validation.
 *
 * Most of Connect degrades quietly rather than loudly when a variable is
 * missing: no `GIPHY_API_KEY` and the GIF picker just returns nothing, no
 * VAPID keys and push is skipped silently, no `MEILISEARCH_URL` and search
 * returns empty. That's the right runtime behaviour — a missing optional
 * integration shouldn't take the product down — but it's the wrong *deploy*
 * behaviour, because the first person to notice is a user in the pilot rather
 * than whoever pushed the deploy.
 *
 * This is the one place that says out loud what is configured and what isn't,
 * so the answer is known before launch rather than discovered during it.
 */

export type EnvVarStatus = {
  name: string;
  present: boolean;
  required: boolean;
  /** What actually breaks when this is missing — in user-visible terms. */
  impact: string;
};

/** Absence of these means the app cannot serve a request at all. */
const REQUIRED: Array<[string, string]> = [
  ["DATABASE_URL", "Nothing works — no database connection"],
  ["SESSION_SECRET", "Nobody can sign in; session cookies cannot be signed"],
  ["NEXT_PUBLIC_APP_URL", "Invite links, email links and OAuth callbacks point nowhere"],
];

/** Absence of these silently disables a whole feature area. */
const FEATURE: Array<[string, string]> = [
  ["REDIS_URL", "No live message delivery, presence, typing, calls or rate limiting — chat falls back to 5s polling"],
  ["RESEND_API_KEY", "No outbound email: invites, password resets, notification digests"],
  ["RESEND_FROM_EMAIL", "Outbound email has no sender address"],
  ["CF_WORKER_SECRET", "Inbound email webhook rejects everything"],
  ["R2_ENDPOINT", "No file uploads or attachments in chat"],
  ["R2_ACCESS_KEY_ID", "No file uploads or attachments in chat"],
  ["R2_SECRET_ACCESS_KEY", "No file uploads or attachments in chat"],
  ["R2_BUCKET_NAME", "No file uploads or attachments in chat"],
  ["ANTHROPIC_API_KEY", "Sage Assist, summaries and translation are unavailable"],
  ["MEILISEARCH_URL", "Search returns nothing — indexing jobs still queue but nothing is searchable"],
  ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "No web push — new DMs are silent unless the tab is open"],
  ["VAPID_PRIVATE_KEY", "No web push — new DMs are silent unless the tab is open"],
  ["GIPHY_API_KEY", "GIF and sticker picker returns no results"],
  ["NEXT_PUBLIC_SENTRY_DSN", "Errors in production are invisible — no error tracking"],
  ["JWT_SECRET", "The mobile app cannot authenticate"],
];

export function checkEnv(): {
  ok: boolean;
  missingRequired: EnvVarStatus[];
  missingFeature: EnvVarStatus[];
  all: EnvVarStatus[];
} {
  const evaluate = (list: Array<[string, string]>, required: boolean): EnvVarStatus[] =>
    list.map(([name, impact]) => ({
      name,
      required,
      impact,
      present: Boolean(process.env[name]?.trim()),
    }));

  const required = evaluate(REQUIRED, true);
  const feature = evaluate(FEATURE, false);
  const all = [...required, ...feature];

  return {
    ok: required.every((v) => v.present),
    missingRequired: required.filter((v) => !v.present),
    missingFeature: feature.filter((v) => !v.present),
    all,
  };
}

/**
 * Extra checks that catch the configuration mistakes that *look* fine.
 * A present-but-wrong value is more dangerous than a missing one, because
 * nothing warns about it.
 */
export function checkEnvSanity(): string[] {
  const warnings: string[] = [];

  const redis = process.env.REDIS_URL;
  if (redis && redis.startsWith("redis://") && !redis.includes("localhost") && !redis.includes("127.0.0.1")) {
    // Documented in CLAUDE.md: Upstash's console shows `redis://` + a --tls
    // flag, but ioredis needs the scheme itself to carry TLS. Getting this
    // wrong fails at connect time, which reads as "Redis is down".
    warnings.push(
      "REDIS_URL uses redis:// against a remote host — Upstash requires rediss:// (double s) for ioredis TLS",
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl && !appUrl.startsWith("https://") && process.env.NODE_ENV === "production") {
    warnings.push("NEXT_PUBLIC_APP_URL is not https in production");
  }
  if (appUrl?.endsWith("/")) {
    warnings.push("NEXT_PUBLIC_APP_URL has a trailing slash — link building will produce double slashes");
  }

  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length < 32) {
    warnings.push("SESSION_SECRET is shorter than 32 characters");
  }

  // Web push needs both halves or neither; one alone is a silent no-op.
  const vapidPublic = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const vapidPrivate = Boolean(process.env.VAPID_PRIVATE_KEY);
  if (vapidPublic !== vapidPrivate) {
    warnings.push("Only one half of the VAPID key pair is set — web push will silently do nothing");
  }
  if (vapidPublic && vapidPrivate && !process.env.VAPID_SUBJECT) {
    warnings.push("VAPID_SUBJECT is unset — some push services reject subscriptions without it");
  }

  return warnings;
}
