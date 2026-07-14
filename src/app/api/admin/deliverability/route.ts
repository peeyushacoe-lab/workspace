import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@cybersage.uk";
  const defaultDomain = fromEmail.split("@")[1] ?? "cybersage.uk";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://cybersage.uk";

  // Self-serve: any admin can type in a domain to check, not just the one
  // configured as RESEND_FROM_EMAIL — useful for verifying a domain before
  // switching sending over to it, or checking a secondary/legacy domain.
  const url = new URL(request.url);
  const domain = (url.searchParams.get("domain") || defaultDomain).trim().toLowerCase().replace(/^https?:\/\//, "");

  // Check DNS records via Node.js dns module (best-effort — server-side only)
  let spfOk = false;
  let dmarcOk = false;
  let dkimStatus: "ok" | "missing" | "unknown" = "unknown";

  try {
    const { promises: dns } = await import("dns");
    const [spfRecords, dmarcRecords, dkimRecords] = await Promise.all([
      dns.resolveTxt(domain).catch(() => [] as string[][]),
      dns.resolveTxt(`_dmarc.${domain}`).catch(() => [] as string[][]),
      dns.resolveCname(`resend._domainkey.${domain}`).catch(() => [] as string[]),
    ]);
    spfOk = spfRecords.flat().some((r) => r.startsWith("v=spf1"));
    dmarcOk = dmarcRecords.flat().some((r) => r.startsWith("v=DMARC1"));
    dkimStatus = dkimRecords.length > 0 ? "ok" : "missing";
  } catch { /* dns not available in edge runtime */ }

  const records = [
    {
      type: "TXT",
      host: domain,
      value: `v=spf1 include:amazonses.com include:_spf.resend.com ~all`,
      status: spfOk ? "ok" : "missing",
      description: "SPF — authorises Resend to send on behalf of your domain. Prevents spoofing.",
    },
    {
      type: "TXT",
      host: `_dmarc.${domain}`,
      value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=100; adkim=s; aspf=s`,
      status: dmarcOk ? "ok" : "missing",
      description: "DMARC — policy for handling unauthenticated email. Required for BIMI and Google Postmaster.",
    },
    {
      type: "CNAME",
      host: `resend._domainkey.${domain}`,
      value: "resend._domainkey.resend.com",
      status: dkimStatus,
      description: "DKIM — cryptographic signature added by Resend. Get the exact record from your Resend → Domains dashboard.",
    },
    {
      type: "TXT",
      host: `default._bimi.${domain}`,
      value: `v=BIMI1; l=https://${appUrl.replace(/^https?:\/\//, "")}/bimi-logo.svg`,
      status: "unknown",
      description: "BIMI (optional) — displays your brand logo in Gmail. Requires DMARC enforcement (p=quarantine or reject).",
    },
  ] as const;

  // ── Bounce / suppression health, last 30 days ──────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS);
  const [totalSent, bounced, failed, suppressedCount] = await Promise.all([
    prisma.emailLog.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.emailLog.count({ where: { createdAt: { gte: thirtyDaysAgo }, status: "BOUNCED" } }),
    prisma.emailLog.count({ where: { createdAt: { gte: thirtyDaysAgo }, status: "FAILED" } }),
    prisma.suppressionList.count(),
  ]);
  const bounceRate = totalSent > 0 ? bounced / totalSent : 0;
  // Google/Yahoo bulk-sender guidance: keep bounce rate under 0.3%, complaint rate under 0.1%
  const bounceHealthy = bounceRate <= 0.003;

  // ── Daily send volume, last 14 days — for warm-up ramp guidance ────────
  const fourteenDaysAgo = new Date(Date.now() - 14 * DAY_MS);
  const recentLogs = await prisma.emailLog.findMany({
    where: { createdAt: { gte: fourteenDaysAgo } },
    select: { createdAt: true },
  });
  const volumeByDay = new Map<string, number>();
  for (const log of recentLogs) {
    const key = log.createdAt.toISOString().slice(0, 10);
    volumeByDay.set(key, (volumeByDay.get(key) ?? 0) + 1);
  }
  const dailyVolume = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    return { date: key, count: volumeByDay.get(key) ?? 0 };
  });

  return NextResponse.json({
    domain,
    isDefaultDomain: domain === defaultDomain,
    fromEmail,
    resendConfigured: !!process.env.RESEND_API_KEY,
    records,
    deliverabilityHealth: {
      totalSent,
      bounced,
      failed,
      bounceRate,
      bounceHealthy,
      suppressedCount,
    },
    dailyVolume,
  });
}
