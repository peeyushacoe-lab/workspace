import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Mail } from "lucide-react";

export const metadata: Metadata = {
  title: "Help & policies · Nexus Suite",
  description: "Signing in, product guides, security, privacy and terms for the Nexus Suite.",
};

const SUPPORT_EMAIL = "business@cybersage.uk";

const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "sign-in",
    title: "Signing in",
    body: (
      <>
        <p>
          Every workspace — Nexus, Nexus Hospitality and Nexus Education — uses one sign-in at{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">nexus.cybersage.uk/login</Link>.
          Your organisation decides which workspace opens after you sign in.
        </p>
        <ul>
          <li>Your administrator or hotel manager creates your account and gives you a temporary password.</li>
          <li>Forgotten your password? Ask your manager to reset it, or use the reset link on the sign-in page.</li>
          <li>Two-factor authentication is optional and can be turned on in Settings → Security.</li>
          <li>Always sign out on shared front-desk computers.</li>
        </ul>
      </>
    ),
  },
  {
    id: "documentation",
    title: "Product guides",
    body: (
      <>
        <h3>Nexus</h3>
        <p>Mail, chat, meetings, drive, documents and security operations for enterprise teams.</p>
        <h3 id="hospitality">Nexus Hospitality</h3>
        <ul>
          <li><strong>Rooms</strong> — the live room board. Tap a room to check a guest out, mark it clean or put it out of order.</li>
          <li><strong>Housekeeping</strong> — rooms waiting to be cleaned and inspected, oldest first, with housekeeper assignment.</li>
          <li><strong>Inventory</strong> — linen, amenities, minibar and stores with par levels and reorder points. Receive, issue, record wastage and count stock; every change lands in the stock ledger.</li>
          <li><strong>Tasks and alerts</strong> — maintenance jobs and guest requests. Stock falling below its reorder point raises an alert on its own.</li>
          <li><strong>Team</strong> — managers add colleagues, set departments and reset passwords.</li>
        </ul>
        <h3 id="education">Nexus Education</h3>
        <p>
          Campus administration, student records and scheduling for higher education, planned for 2027.
          Email <a href={`mailto:${SUPPORT_EMAIL}?subject=Nexus%20Education%20roadmap`} className="font-medium text-accent hover:underline">{SUPPORT_EMAIL}</a>{" "}
          for the roadmap briefing or to join the waitlist.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "Security overview",
    body: (
      <ul>
        <li>All traffic is served over HTTPS; session cookies are signed, HTTP-only and cleared on sign-out.</li>
        <li>Each organisation&apos;s data is scoped to that organisation — a hotel only ever sees its own rooms, stock and team.</li>
        <li>Access inside an organisation is role-based, and managers can deactivate an account instantly.</li>
        <li>Security questions or a responsible-disclosure report: <a href={`mailto:${SUPPORT_EMAIL}?subject=Security`} className="font-medium text-accent hover:underline">{SUPPORT_EMAIL}</a>.</li>
      </ul>
    ),
  },
  {
    id: "privacy",
    title: "Privacy",
    body: (
      <p>
        We process account details and the content your organisation stores in the Nexus Suite only to provide the service
        to that organisation. We don&apos;t sell personal data. To request a copy or deletion of your data, or our full privacy
        policy and data processing terms, email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}?subject=Privacy%20request`} className="font-medium text-accent hover:underline">{SUPPORT_EMAIL}</a>.
      </p>
    ),
  },
  {
    id: "terms",
    title: "Terms of service",
    body: (
      <p>
        Use of the Nexus Suite is governed by the agreement between CyberSage Technologies Ltd and your organisation.
        Pilot programmes run under their pilot terms. For a copy of the terms that apply to you, email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}?subject=Terms%20of%20service`} className="font-medium text-accent hover:underline">{SUPPORT_EMAIL}</a>.
      </p>
    ),
  },
  {
    id: "support",
    title: "Support",
    body: (
      <p>
        For help with your workspace, provisioning, pilot onboarding or billing, email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}?subject=Support%20request`} className="font-medium text-accent hover:underline">{SUPPORT_EMAIL}</a>.
        Include your organisation name and, if something broke, what you were doing at the time.
        Live service status is on the <Link href="/status" className="font-medium text-accent hover:underline">status page</Link>.
      </p>
    ),
  },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-canvas px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Nexus Suite
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground text-balance">Help & policies</h1>
        <p className="mt-2 text-[15px] text-muted">Signing in, product guides, and how we look after your data.</p>

        <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-full border border-border bg-surface px-3 py-1 text-[12.5px] font-medium text-muted hover:text-foreground">
              {s.title}
            </a>
          ))}
        </nav>

        <div className="mt-8 space-y-4">
          {SECTIONS.map((s) => (
            <section
              key={s.id}
              id={s.id}
              className="scroll-mt-6 rounded-panel border border-border bg-surface px-5 py-5 shadow-sm sm:px-6 [&_h3]:mt-4 [&_h3]:text-[14px] [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:mt-1.5 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5"
            >
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{s.title}</h2>
              <div className="text-[14px] leading-relaxed text-muted">{s.body}</div>
            </section>
          ))}
        </div>

        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
        >
          <Mail className="h-4 w-4" /> {SUPPORT_EMAIL}
        </a>
      </div>
    </div>
  );
}
