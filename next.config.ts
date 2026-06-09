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
      // unsafe-eval removed in production; kept only for dev HMR
      `script-src 'self' ${isProd ? "" : "'unsafe-eval' "}'unsafe-inline' https://browser.sentry-cdn.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://lh3.googleusercontent.com",
      "font-src 'self'",
      "connect-src 'self' https://*.sentry.io wss: ws:",
      "media-src 'self' blob:",
      "object-src 'none'",
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
