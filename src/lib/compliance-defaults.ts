/**
 * Default control sets seeded into ComplianceControl the first time each
 * category is loaded with no rows. Based on common SOC 2 Type II trust
 * service criteria, GDPR Art. 30/28 obligations, and standard pen-test
 * cadence — a reasonable starting checklist, not a substitute for a real
 * auditor's scoping.
 */
export type DefaultControl = { key: string; label: string; description: string };

export const SOC2_DEFAULTS: DefaultControl[] = [
  { key: "access-reviews", label: "Quarterly access reviews", description: "Review user access and role assignments every quarter; remove stale accounts." },
  { key: "mfa-enforced", label: "MFA enforced for privileged roles", description: "Admin/CEO/CISO and other sensitive roles require MFA (already enforced in middleware)." },
  { key: "encryption-at-rest", label: "Encryption at rest", description: "Database and object storage (R2) encrypted at rest by the provider." },
  { key: "encryption-in-transit", label: "Encryption in transit", description: "TLS enforced for all client and inter-service traffic." },
  { key: "change-management", label: "Change management process", description: "Code changes go through review before deploying to production." },
  { key: "incident-response-plan", label: "Documented incident response plan", description: "Written runbook for security incidents, including notification timelines." },
  { key: "vendor-risk-mgmt", label: "Vendor risk management", description: "Track sub-processors (Vercel, Neon, Resend, Cloudflare R2, Upstash, Meilisearch/Anthropic) and their own compliance posture." },
  { key: "backup-restore-tested", label: "Backups tested via restore drills", description: "Automated restore-drill job proves backups are recoverable, not just taken." },
  { key: "audit-logging", label: "Immutable audit logging", description: "AuditLog captures security-relevant actions across the platform." },
  { key: "employee-offboarding", label: "Timely access revocation on offboarding", description: "HR offboarding flow deactivates accounts and revokes sessions/tokens." },
  { key: "penetration-testing", label: "Annual penetration test", description: "Third-party pen test performed at least annually — see Pen Testing tab." },
  { key: "security-training", label: "Security awareness training", description: "Staff complete security training on hire and annually thereafter." },
];

export const GDPR_DEFAULTS: DefaultControl[] = [
  { key: "dpa-available", label: "Data Processing Agreement available", description: "Standard DPA template available for customers — see download below." },
  { key: "data-subject-requests", label: "Data subject request (DSAR) process", description: "Documented process to fulfil access/erasure/portability requests within statutory deadlines." },
  { key: "lawful-basis-documented", label: "Lawful basis for processing documented", description: "Each category of personal data processed has a documented lawful basis." },
  { key: "sub-processor-list", label: "Sub-processor list maintained", description: "Public/customer-facing list of sub-processors kept current (Resend, Cloudflare, Vercel/Neon, Anthropic)." },
  { key: "data-retention-policy", label: "Data retention policy enforced", description: "RetentionPolicy model + /api/compliance/retention enforce configurable retention windows." },
  { key: "breach-notification-process", label: "Breach notification process", description: "Process to notify affected customers/authorities within 72 hours of a confirmed breach." },
  { key: "data-residency-documented", label: "Data residency documented", description: "Hosting region(s) for customer data documented — see Data Residency tab." },
  { key: "right-to-erasure", label: "Right to erasure supported", description: "Account deletion removes or anonymizes personal data per retention policy." },
];

export const PENTEST_DEFAULTS: DefaultControl[] = [
  { key: "annual-pentest-scheduled", label: "Annual pen test scheduled", description: "Book a third-party penetration test at least once every 12 months." },
  { key: "scope-defined", label: "Test scope defined", description: "Web app, API, and mobile app in scope; define what's excluded (e.g. third-party infra)." },
  { key: "findings-remediated", label: "Findings tracked to remediation", description: "Critical/high findings remediated and re-tested before sign-off." },
  { key: "report-retained", label: "Pen test report retained", description: "Final report kept on file for auditor/customer review requests." },
];
