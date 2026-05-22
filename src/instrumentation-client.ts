import * as Sentry from "@sentry/nextjs";

// Skip Sentry in development to avoid the 156ms "Slow execution" instrumentation warning.
// In production the build is optimized and there is no dev overlay to surface the warning.
if (process.env.NODE_ENV === "production") {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    debug: false,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
