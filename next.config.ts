import type { NextConfig } from "next";

import { withSentryConfig } from "@sentry/nextjs";

const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: isProd ? "max-age=63072000; includeSubDomains; preload" : "max-age=0",
  },
  // Content-Security-Policy is intentionally NOT set here. It was previously a
  // static header (see git blame — commit 520243b, "F-14") with 'unsafe-inline'
  // removed from script-src entirely. That broke the app: Next.js's App Router
  // always emits its own inline hydration/streaming scripts
  // (`<script>self.__next_f.push(...)</script>`) on every single page, and
  // those need either 'unsafe-inline' or a per-request nonce to be allowed to
  // run. With neither present, the browser refused every inline script and the
  // app never hydrated — a permanent blank page on every route.
  // CSP now lives in src/middleware.ts, generated fresh per request with a
  // random nonce that's threaded through to Next's own inline scripts
  // automatically (Next detects the nonce in the CSP response header). Do not
  // re-add a static CSP header here — a second CSP header from next.config.ts
  // would be enforced ADDITIONALLY (browsers AND multiple CSP headers, they
  // don't override), and a nonce-less one would immediately reintroduce this
  // exact bug.
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
  // node-ical uses BigInt in ways webpack can't bundle — keep it as a native Node module
  serverExternalPackages: ["node-ical"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: "cybersage",
  project: "mail",
  // Skip Sentry instrumentation in dev — speeds up cold compile significantly
  disableLogger: true,
  widenClientFileUpload: false,
  sourcemaps: { disable: !isProd },
});
