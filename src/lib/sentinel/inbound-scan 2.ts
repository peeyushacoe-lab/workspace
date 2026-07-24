/**
 * Inbound mail security scan — SPF/DKIM/DMARC verdicts, link analysis +
 * redirect rewriting, attachment classification, and sender reputation.
 * Runs once per inbound message from the webhook, right after the
 * InboxMessage row is created. Replaces the old placeholder keyword scan.
 */
import { prisma } from "@/lib/prisma";
import { emitEvent } from "@/lib/events";
import { signRedirectUrl } from "@/lib/redirect-scan";

export type AuthResult = "PASS" | "FAIL" | "NONE" | "UNKNOWN";

const DANGEROUS_EXTENSIONS = new Set([
  ".exe", ".scr", ".bat", ".cmd", ".com", ".pif", ".vbs", ".vbe", ".js", ".jse",
  ".jar", ".ps1", ".psm1", ".msi", ".msp", ".reg", ".hta", ".wsf", ".wsh", ".dll",
  ".cpl", ".gadget", ".lnk",
]);
const MACRO_EXTENSIONS = new Set([".docm", ".xlsm", ".pptm", ".dotm", ".xltm", ".potm"]);
const ARCHIVE_EXTENSIONS = new Set([".zip", ".rar", ".7z", ".iso", ".img", ".ace", ".cab"]);

const SHORTENER_DOMAINS = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly",
  "rebrand.ly", "cutt.ly", "shorturl.at", "rb.gy",
];
const SUSPICIOUS_KEYWORDS = [
  "verify", "secure", "login", "signin", "account-update", "confirm-identity",
  "password-reset", "billing-update",
];
const PHISHING_BODY_KEYWORDS = [
  "verify your account", "account suspended", "confirm your password",
  "unusual sign-in activity", "your account will be closed", "click here immediately",
  "urgent action required", "wire transfer", "gift card", "bank account frozen",
];

function classifyAttachment(filename: string): { verdict: "SAFE" | "MACRO_RISK" | "ARCHIVE" | "DANGEROUS"; isDangerous: boolean } {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (DANGEROUS_EXTENSIONS.has(ext)) return { verdict: "DANGEROUS", isDangerous: true };
  if (MACRO_EXTENSIONS.has(ext)) return { verdict: "MACRO_RISK", isDangerous: true };
  if (ARCHIVE_EXTENSIONS.has(ext)) return { verdict: "ARCHIVE", isDangerous: false };
  return { verdict: "SAFE", isDangerous: false };
}

/**
 * Parses a standard "Authentication-Results" header (RFC 8601) for
 * spf=/dkim=/dmarc= verdicts. Falls back to UNKNOWN when the header is
 * absent — most receiving MTAs (including Cloudflare Email Routing) add it,
 * but we can't assume every source does.
 */
export function parseAuthenticationResults(headerValue: string | undefined | null): {
  spf: AuthResult;
  dkim: AuthResult;
  dmarc: AuthResult;
} {
  const extract = (mechanism: "spf" | "dkim" | "dmarc"): AuthResult => {
    if (!headerValue) return "UNKNOWN";
    const match = headerValue.match(new RegExp(`${mechanism}=([a-z]+)`, "i"));
    if (!match) return "NONE";
    const val = match[1].toLowerCase();
    if (val === "pass") return "PASS";
    if (val === "fail" || val === "softfail" || val === "permerror" || val === "hardfail") return "FAIL";
    if (val === "none" || val === "neutral") return "NONE";
    return "UNKNOWN";
  };
  return { spf: extract("spf"), dkim: extract("dkim"), dmarc: extract("dmarc") };
}

function extractDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

/** Rewrites http(s) hrefs in HTML through the internal redirect scanner. */
export function rewriteLinks(html: string): { html: string; rewrittenCount: number; suspiciousUrls: string[] } {
  let rewrittenCount = 0;
  const suspiciousUrls: string[] = [];

  const rewritten = html.replace(
    /href\s*=\s*(["'])(https?:\/\/[^"']+)\1/gi,
    (full, quote: string, url: string) => {
      // Don't double-rewrite our own redirect links
      if (url.includes("/api/redirect")) return full;
      const flagged = isSuspiciousUrl(url);
      if (flagged) suspiciousUrls.push(url);
      rewrittenCount++;
      const signed = signRedirectUrl(url, flagged);
      return `href=${quote}${signed}${quote}`;
    },
  );

  return { html: rewritten, rewrittenCount, suspiciousUrls };
}

export function isSuspiciousUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (SHORTENER_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return true;
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true; // raw IP literal
    if (host.startsWith("xn--")) return true; // punycode — possible homograph attack
    if (SUSPICIOUS_KEYWORDS.some((kw) => host.includes(kw) || u.pathname.toLowerCase().includes(kw))) return true;
    return false;
  } catch {
    return true; // unparseable URL — treat as suspicious rather than silently pass
  }
}

type ScanInput = {
  messageId: string;
  mailboxId: string;
  senderEmail: string;
  subject: string;
  textBody: string;
  htmlBody: string | null;
  authHeader: string | null | undefined;
  attachments: { id: string; filename: string }[];
};

export type ScanResult = {
  riskScore: number;
  verdict: "CLEAN" | "SUSPICIOUS" | "SPAM" | "PHISHING";
  isSpam: boolean;
  rewrittenHtml: string | null;
};

export async function runInboundScan(input: ScanInput): Promise<ScanResult> {
  const findings: string[] = [];
  let riskScore = 0;

  // ── 1. SPF / DKIM / DMARC ────────────────────────────────────────────
  const auth = parseAuthenticationResults(input.authHeader);
  if (auth.spf === "FAIL") { riskScore += 25; findings.push("SPF authentication failed — sender domain did not authorize this server."); }
  if (auth.dkim === "FAIL") { riskScore += 25; findings.push("DKIM signature failed or missing — message may have been altered in transit."); }
  if (auth.dmarc === "FAIL") { riskScore += 30; findings.push("DMARC alignment failed — this message fails the sending domain's own policy."); }
  const hardAuthFail = auth.spf === "FAIL" && auth.dkim === "FAIL" && auth.dmarc === "FAIL";

  // ── 2. Sender reputation ─────────────────────────────────────────────
  const senderDomain = extractDomain(input.senderEmail);
  const reputation = await prisma.senderReputation.upsert({
    where: { mailboxId_senderEmail: { mailboxId: input.mailboxId, senderEmail: input.senderEmail } },
    update: { messageCount: { increment: 1 } },
    create: { mailboxId: input.mailboxId, senderEmail: input.senderEmail, senderDomain, messageCount: 1 },
  });
  const isFirstTimeSender = reputation.messageCount <= 1;
  if (isFirstTimeSender) { riskScore += 5; findings.push("First message received from this sender."); }
  if (reputation.isBlocked) { riskScore += 100; findings.push("Sender is on your blocked list (reported as spam previously)."); }
  else if (reputation.spamReports >= 2 && reputation.spamReports > reputation.hamReports) {
    riskScore += 60;
    findings.push(`Sender has been reported as spam ${reputation.spamReports} time(s) before.`);
  }
  if (reputation.isTrusted) riskScore = Math.max(0, riskScore - 20);

  // ── 3. Link analysis + rewriting ─────────────────────────────────────
  let rewrittenHtml: string | null = null;
  if (input.htmlBody) {
    const { html, rewrittenCount, suspiciousUrls } = rewriteLinks(input.htmlBody);
    rewrittenHtml = html;
    if (rewrittenCount > 0) findings.push(`Detected ${rewrittenCount} link(s) — routed through link scanner.`);
    if (suspiciousUrls.length > 0) {
      riskScore += Math.min(40, suspiciousUrls.length * 15);
      findings.push(`${suspiciousUrls.length} suspicious link(s) found (shortener, IP address, or credential-harvest pattern).`);
    }
  }

  // ── 4. Phishing keyword heuristics on the body ───────────────────────
  const bodyLower = `${input.subject} ${input.textBody}`.toLowerCase();
  const hitKeywords = PHISHING_BODY_KEYWORDS.filter((kw) => bodyLower.includes(kw));
  if (hitKeywords.length > 0) {
    riskScore += Math.min(30, hitKeywords.length * 10);
    findings.push(`Phishing-style language detected: "${hitKeywords[0]}"`);
  }

  // ── 5. Attachment verdicts ───────────────────────────────────────────
  let dangerousAttachments = 0;
  for (const att of input.attachments) {
    const { verdict, isDangerous } = classifyAttachment(att.filename);
    if (isDangerous) dangerousAttachments++;
    if (verdict === "DANGEROUS") riskScore += 40;
    if (verdict === "MACRO_RISK") riskScore += 20;
    if (verdict === "ARCHIVE") riskScore += 5;
    await prisma.emailAttachment.update({
      where: { id: att.id },
      data: { threatVerdict: verdict, isDangerous },
    }).catch(() => {});
  }
  if (dangerousAttachments > 0) findings.push(`${dangerousAttachments} attachment(s) flagged as high-risk file type.`);

  riskScore = Math.min(100, riskScore);

  // ── 6. Verdict ────────────────────────────────────────────────────────
  let verdict: ScanResult["verdict"] = "CLEAN";
  if (hardAuthFail || riskScore >= 70) verdict = "PHISHING";
  else if (riskScore >= 45) verdict = "SPAM";
  else if (riskScore >= 20) verdict = "SUSPICIOUS";

  const isSpam = verdict === "PHISHING" || verdict === "SPAM" || (reputation.isBlocked && !reputation.isTrusted);

  await prisma.threatScan.upsert({
    where: { messageId: input.messageId },
    update: {
      riskScore, findings, verdict,
      spfResult: auth.spf, dkimResult: auth.dkim, dmarcResult: auth.dmarc,
      isFirstTimeSender, linksRewritten: !!rewrittenHtml,
    },
    create: {
      messageId: input.messageId, riskScore, findings, verdict,
      spfResult: auth.spf, dkimResult: auth.dkim, dmarcResult: auth.dmarc,
      isFirstTimeSender, linksRewritten: !!rewrittenHtml,
    },
  });

  if (verdict === "PHISHING") {
    emitEvent("SECURITY_THREAT_DETECTED", {
      targetType: "email",
      targetId: input.messageId,
      severity: "CRITICAL",
      reason: `Inbound message from ${input.senderEmail} scored ${riskScore}/100 (${verdict})`,
    });
    await prisma.sentinelAlert.create({
      data: {
        alertType: "PHISHING_EMAIL",
        severity: "CRITICAL",
        targetType: "email",
        targetId: input.messageId,
        description: `Phishing-scored inbound email from ${input.senderEmail}: "${input.subject}"`,
        metadata: { riskScore, findings, senderEmail: input.senderEmail },
      },
    }).catch(() => {});
  }

  return { riskScore, verdict, isSpam, rewrittenHtml };
}

/** Called when a user clicks "Report spam" / "Not spam" on a thread. */
export async function recordSenderFeedback(mailboxId: string, senderEmail: string, isSpamReport: boolean) {
  const senderDomain = extractDomain(senderEmail);
  const rep = await prisma.senderReputation.upsert({
    where: { mailboxId_senderEmail: { mailboxId, senderEmail } },
    update: isSpamReport ? { spamReports: { increment: 1 } } : { hamReports: { increment: 1 } },
    create: {
      mailboxId, senderEmail, senderDomain,
      spamReports: isSpamReport ? 1 : 0,
      hamReports: isSpamReport ? 0 : 1,
    },
  });
  // Auto-block after repeated spam reports; auto-trust after consistent ham reports
  if (rep.spamReports >= 3 && rep.spamReports > rep.hamReports) {
    await prisma.senderReputation.update({ where: { id: rep.id }, data: { isBlocked: true, isTrusted: false } });
  } else if (rep.hamReports >= 3 && !isSpamReport) {
    await prisma.senderReputation.update({ where: { id: rep.id }, data: { isTrusted: true, isBlocked: false } });
  }
}
