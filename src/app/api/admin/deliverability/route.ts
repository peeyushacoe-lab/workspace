import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@cybersage.uk";
  const domain = fromEmail.split("@")[1] ?? "cybersage.uk";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://cybersage.uk";

  // Check DNS records via Node.js dns module (best-effort — server-side only)
  let spfOk = false;
  let dmarcOk = false;

  try {
    const { promises: dns } = await import("dns");
    const [spfRecords, dmarcRecords] = await Promise.all([
      dns.resolveTxt(domain).catch(() => [] as string[][]),
      dns.resolveTxt(`_dmarc.${domain}`).catch(() => [] as string[][]),
    ]);
    spfOk = spfRecords.flat().some((r) => r.startsWith("v=spf1"));
    dmarcOk = dmarcRecords.flat().some((r) => r.startsWith("v=DMARC1"));
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
      status: "unknown",
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

  return NextResponse.json({
    domain,
    fromEmail,
    resendConfigured: !!process.env.RESEND_API_KEY,
    records,
  });
}
