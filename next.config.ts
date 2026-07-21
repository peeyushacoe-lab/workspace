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
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // unsafe-eval removed in production; kept only for dev HMR.
      // unsafe-inline removed for scripts entirely (F-14) — the app no longer
      // ships any inline <script> tags (the old dark-mode class toggle was
      // moved to a static className in layout.tsx), so 'unsafe-inline' is not
      // needed for script-src/script-src-elem in any environment. style-src
      // keeps 'unsafe-inline' since inline styles are still used widely and
      // are lower-severity (no code execution).
      `script-src 'self' ${isProd ? "" : "'unsafe-eval' "}https://browser.sentry-cdn.com`,
      // Google Fonts are loaded at runtime by some components and email templates
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https://lh3.googleusercontent.com https://avatars.githubusercontent.com",
      // fonts.gstatic.com serves the actual font files referenced by Google Fonts CSS
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://*.sentry.io wss: ws: https://fonts.googleapis.com",
      "media-src 'self' blob:",
      "object-src 'none'",
      // Allow Jitsi external API script to load from the configured domain (or public fallback)
      `script-src-elem 'self' https://browser.sentry-cdn.com https://meet.jit.si ${process.env.JITSI_DOMAIN ? `https://${process.env.JITSI_DOMAIN}` : ""}`,
      `frame-src 'self' https://meet.jit.si ${process.env.JITSI_DOMAIN ? `https://${process.env.JITSI_DOMAIN}` : ""}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
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
