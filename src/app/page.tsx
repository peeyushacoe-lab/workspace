import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import Link from "next/link";
import type { Metadata } from "next";
import {
  Mail,
  MessagesSquare,
  Video,
  FolderOpen,
  CalendarDays,
  Sparkles,
  ShieldCheck,
  Plug,
  Check,
  Monitor,
  type LucideIcon,
} from "lucide-react";

export const metadata: Metadata = {
  title: "CyberSage — Secure Enterprise Workspace",
  description: "Email, chat, video, drive, calendar, and AI — built for teams that take security seriously.",
  openGraph: {
    title: "CyberSage — Secure Enterprise Workspace",
    description: "Email, chat, video, drive, calendar, and AI — built for teams that take security seriously.",
    type: "website",
  },
};

const FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
  { icon: Mail, title: "Secure Email", desc: "End-to-end encrypted mailboxes with SPF/DKIM/DMARC out of the box." },
  { icon: MessagesSquare, title: "Team Chat", desc: "Real-time messaging with channels, threads, and presence indicators." },
  { icon: Video, title: "Video Meetings", desc: "One-click HD video calls with AI meeting intelligence and transcripts." },
  { icon: FolderOpen, title: "Cloud Drive", desc: "Collaborative file storage with role-based access control." },
  { icon: CalendarDays, title: "Calendar", desc: "Smart scheduling with meeting rooms and conflict detection." },
  { icon: Sparkles, title: "AI Assistant", desc: "Claude-powered AI for email drafts, summaries, and smart replies." },
  { icon: ShieldCheck, title: "Sentinel", desc: "Real-time threat detection, audit logs, and GDPR compliance." },
  { icon: Plug, title: "Developer API", desc: "Full REST API with webhooks to integrate with your existing tools." },
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
    <div className="min-h-screen bg-[#f8fafd] text-[#202124] font-sans">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-[#e8eaed] bg-[#f8fafd]">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <span className="text-xl font-semibold tracking-tight text-[#1a56db]">CyberSage</span>
          <div className="flex items-center gap-6 text-sm text-[#5f6368]">
            <Link href="#features" className="hover:text-[#1a56db] transition-colors">Features</Link>
            <Link href="#pricing" className="hover:text-[#1a56db] transition-colors">Pricing</Link>
            <Link href="/download" className="hover:text-[#1a56db] transition-colors">Desktop app</Link>
            <Link href="/status" className="hover:text-[#1a56db] transition-colors">Status</Link>
            <Link href="/login" className="hover:text-[#202124] transition-colors">Log in</Link>
            <Link
              href="/register"
              className="px-4 py-1.5 bg-[#1a56db] text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-tight mb-6 text-white">
          The workspace built for<br />
          security-first teams
        </h1>
        <p className="text-xl text-[#8899a6] max-w-2xl mx-auto mb-10">
          Email, chat, video, drive, calendar, and AI — all in one place.
          Designed with enterprise security and compliance from day one.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/register"
            className="px-8 py-3 bg-[#1a56db] text-white font-semibold text-base rounded-xl hover:opacity-90 transition-opacity"
          >
            Start for free
          </Link>
          <Link
            href="/login"
            className="px-8 py-3 border border-[#d0d5dd] text-[#202124] font-medium text-base rounded-xl hover:bg-[#ffffff08] transition-colors"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-semibold text-center mb-4 text-white">Everything your team needs</h2>
        <p className="text-[#8899a6] text-center mb-12 max-w-xl mx-auto">
          One subscription. No bolt-ons. No third-party data sharing.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-white border border-[#e8eaed] rounded-xl p-5 hover:border-[#1a56db]/20 transition-colors"
            >
              <f.icon className="w-5 h-5 mb-3 text-[#5f6368]" />
              <h3 className="font-semibold text-white mb-1">{f.title}</h3>
              <p className="text-sm text-[#8899a6] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Desktop app banner */}
      <section className="max-w-6xl mx-auto px-6 pb-4">
        <div className="bg-white border border-[#e8eaed] rounded-2xl px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <Monitor className="w-8 h-8 text-[#5f6368] flex-shrink-0" />
            <div>
              <p className="font-semibold text-white text-lg">Available as a desktop app</p>
              <p className="text-sm text-[#8899a6] mt-0.5">
                Windows, macOS, and Linux — system tray, offline mode, native notifications.
              </p>
            </div>
          </div>
          <Link
            href="/download"
            className="flex-shrink-0 px-6 py-2.5 bg-[#1a56db] text-white font-semibold text-sm rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            Download
          </Link>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-semibold text-center mb-4 text-white">Simple, transparent pricing</h2>
        <p className="text-[#8899a6] text-center mb-12 max-w-xl mx-auto">
          Start free, scale when you&apos;re ready. No hidden fees.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-xl p-6 border flex flex-col ${
                plan.highlight
                  ? "bg-white border-[#1a56db]/40"
                  : "bg-white border-[#e8eaed]"
              }`}
            >
              {plan.highlight && (
                <span className="self-start mb-3 text-xs font-semibold text-[#1a56db] bg-[#1a56db]/10 px-2.5 py-0.5 rounded-full">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold text-white mb-0.5">{plan.name}</h3>
              <div className="mb-4">
                <span className="text-3xl font-semibold text-white tracking-tight">{plan.price}</span>
                <span className="text-sm text-[#9aa0a6] ml-1">{plan.period}</span>
              </div>
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-[#5f6368]">
                    <Check className="w-3.5 h-3.5 text-[#06d6a0] flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`block text-center py-2.5 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90 ${
                  plan.highlight
                    ? "bg-[#1a56db] text-white"
                    : "border border-[#d0d5dd] text-[#202124] hover:bg-[#ffffff08]"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#e8eaed] mt-8">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#9aa0a6]">
          <span className="font-semibold text-[#1a56db]">CyberSage</span>
          <div className="flex items-center gap-6">
            <Link href="/download" className="hover:text-[#5f6368] transition-colors">Desktop app</Link>
            <Link href="/status" className="hover:text-[#5f6368] transition-colors">Status</Link>
            <Link href="/login" className="hover:text-[#5f6368] transition-colors">Log in</Link>
            <a href="mailto:hello@cybersage.uk" className="hover:text-[#5f6368] transition-colors">Contact</a>
          </div>
          <span>© {new Date().getFullYear()} CyberSage. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
