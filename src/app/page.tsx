import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CyberSage — Secure Enterprise Workspace",
  description: "Email, chat, video, drive, calendar, and AI — built for teams that take security seriously.",
  openGraph: {
    title: "CyberSage — Secure Enterprise Workspace",
    description: "Email, chat, video, drive, calendar, and AI — built for teams that take security seriously.",
    type: "website",
  },
};

const FEATURES = [
  { icon: "✉", title: "Secure Email", desc: "End-to-end encrypted mailboxes with SPF/DKIM/DMARC out of the box." },
  { icon: "💬", title: "Team Chat", desc: "Real-time messaging with channels, threads, and presence indicators." },
  { icon: "🎥", title: "Video Meetings", desc: "One-click HD video calls with AI meeting intelligence and transcripts." },
  { icon: "📁", title: "Cloud Drive", desc: "Collaborative file storage with role-based access control." },
  { icon: "📅", title: "Calendar", desc: "Smart scheduling with meeting rooms and conflict detection." },
  { icon: "🤖", title: "AI Assistant", desc: "Claude-powered AI for email drafts, summaries, and smart replies." },
  { icon: "🛡", title: "Sentinel", desc: "Real-time threat detection, audit logs, and GDPR compliance." },
  { icon: "🔌", title: "Developer API", desc: "Full REST API with webhooks to integrate with your existing tools." },
];

const PLANS = [
  {
    name: "Free",
    price: "£0",
    period: "forever",
    features: ["5 GB storage", "Up to 5 users", "Email + Chat", "Community support"],
    cta: "Get started",
    href: "/register",
    highlight: false,
  },
  {
    name: "Starter",
    price: "£29",
    period: "per month",
    features: ["50 GB storage", "Up to 25 users", "All apps", "Email support", "Custom domain"],
    cta: "Start free trial",
    href: "/register?plan=starter",
    highlight: false,
  },
  {
    name: "Pro",
    price: "£79",
    period: "per month",
    features: ["500 GB storage", "Unlimited users", "All apps + AI", "Priority support", "SSO / SAML", "Audit logs"],
    cta: "Start free trial",
    href: "/register?plan=pro",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "contact us",
    features: ["Unlimited storage", "Unlimited users", "Dedicated instance", "SLA guarantee", "Onboarding + training", "Custom contracts"],
    cta: "Contact sales",
    href: "mailto:sales@cybersage.uk",
    highlight: false,
  },
];

export default async function LandingPage() {
  const cookieStore = await cookies();
  const user = getSessionUserFromCookieStore(cookieStore);
  if (user) redirect("/inbox");

  return (
    <div className="min-h-screen bg-[#0a0d1a] text-[#dfe1f6] font-sans">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-[rgba(0,255,255,0.07)] bg-[#0a0d1a]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <span className="text-xl font-bold tracking-tight text-[#00d2ff]">CyberSage</span>
          <div className="flex items-center gap-6 text-sm text-[#bbc9cf]">
            <Link href="#features" className="hover:text-[#00d2ff] transition-colors">Features</Link>
            <Link href="#pricing" className="hover:text-[#00d2ff] transition-colors">Pricing</Link>
            <Link href="/status" className="hover:text-[#00d2ff] transition-colors">Status</Link>
            <Link href="/login" className="hover:text-[#dfe1f6] transition-colors">Log in</Link>
            <Link
              href="/register"
              className="px-4 py-1.5 bg-[#00d2ff] text-[#003543] font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-[#00d2ff]/10 border border-[#00d2ff]/20 rounded-full px-4 py-1.5 text-xs text-[#a5e7ff] mb-8">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Now in production — used by real teams
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight leading-tight mb-6 text-white">
          The workspace built for<br />
          <span className="text-[#00d2ff]">security-first teams</span>
        </h1>
        <p className="text-xl text-[#8899a6] max-w-2xl mx-auto mb-10">
          Email, chat, video, drive, calendar, and AI — all in one place.
          Designed with enterprise security and compliance from day one.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/register"
            className="px-8 py-3 bg-[#00d2ff] text-[#003543] font-bold text-base rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-[#00d2ff]/20"
          >
            Start for free
          </Link>
          <Link
            href="/login"
            className="px-8 py-3 border border-[rgba(0,255,255,0.2)] text-[#dfe1f6] font-medium text-base rounded-xl hover:bg-[#ffffff08] transition-colors"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-4 text-white">Everything your team needs</h2>
        <p className="text-[#8899a6] text-center mb-12 max-w-xl mx-auto">
          One subscription. No bolt-ons. No third-party data sharing.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-[#1b1f2e] border border-[rgba(0,255,255,0.07)] rounded-xl p-5 hover:border-[#00d2ff]/20 transition-colors"
            >
              <span className="text-3xl mb-3 block">{f.icon}</span>
              <h3 className="font-semibold text-white mb-1">{f.title}</h3>
              <p className="text-sm text-[#8899a6] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-4 text-white">Simple, transparent pricing</h2>
        <p className="text-[#8899a6] text-center mb-12 max-w-xl mx-auto">
          Start free, scale when you&apos;re ready. No hidden fees.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-xl p-6 border flex flex-col ${
                plan.highlight
                  ? "bg-[#00d2ff]/10 border-[#00d2ff]/40 shadow-lg shadow-[#00d2ff]/10"
                  : "bg-[#1b1f2e] border-[rgba(0,255,255,0.07)]"
              }`}
            >
              {plan.highlight && (
                <span className="self-start mb-3 text-xs font-bold text-[#003543] bg-[#00d2ff] px-2.5 py-0.5 rounded-full">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-bold text-white mb-0.5">{plan.name}</h3>
              <div className="mb-4">
                <span className="text-3xl font-extrabold text-white">{plan.price}</span>
                <span className="text-sm text-[#5c6b72] ml-1">{plan.period}</span>
              </div>
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-[#bbc9cf]">
                    <span className="text-emerald-400 flex-shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`block text-center py-2.5 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90 ${
                  plan.highlight
                    ? "bg-[#00d2ff] text-[#003543]"
                    : "border border-[rgba(0,255,255,0.2)] text-[#dfe1f6] hover:bg-[#ffffff08]"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[rgba(0,255,255,0.07)] mt-8">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#5c6b72]">
          <span className="font-bold text-[#00d2ff]">CyberSage</span>
          <div className="flex items-center gap-6">
            <Link href="/status" className="hover:text-[#bbc9cf] transition-colors">Status</Link>
            <Link href="/login" className="hover:text-[#bbc9cf] transition-colors">Log in</Link>
            <a href="mailto:hello@cybersage.uk" className="hover:text-[#bbc9cf] transition-colors">Contact</a>
          </div>
          <span>© {new Date().getFullYear()} CyberSage. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
