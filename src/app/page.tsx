/* eslint-disable @next/next/no-img-element */
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore, getPortalHome } from "@/lib/auth";
import { Playfair_Display, Inter } from "next/font/google";
import Link from "next/link";
import type { Metadata } from "next";
import { BookOpen, User, Lock, ShieldCheck, Check } from "lucide-react";
import s from "./portal-landing.module.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--playfair",
  weight: ["500", "600", "700"],
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--inter",
  display: "swap",
});

// Must be dynamic — reads cookies to decide whether to redirect or show portal.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nexus Suite",
  description: "Select your workspace — Nexus, Nexus Hospitality, or Nexus Education.",
};

// Every enquiry from the public page goes to the business inbox.
const BUSINESS_EMAIL = "business@cybersage.uk";
const mail = (subject: string) => `mailto:${BUSINESS_EMAIL}?subject=${encodeURIComponent(subject)}`;

// Product marks fill the card's icon slot edge to edge.
const markStyle = { width: "100%", height: "100%", borderRadius: 12, display: "block" } as const;

export default async function RootPage() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (user) redirect(getPortalHome(user.role, user.orgType));

  return (
    <div className={`${s.page} ${playfair.variable} ${inter.variable}`}>

      {/* Nav */}
      <nav className={s.nav}>
        <Link href="/" className={s.navLogo} aria-label="Nexus Suite by CyberSage">
          {/* CyberSage eagle is white artwork — it sits on the dark tile. */}
          <div className={s.navIcon} style={{ width: 44, height: 44, overflow: "hidden" }}>
            <img
              src="/cybersage-logo.png"
              alt="CyberSage"
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 30%", transform: "scale(1.45)" }}
            />
          </div>
          <div>
            <span className={s.navBrandName}>Nexus Suite</span>
            <span className={s.navBrandSub}>by CyberSage</span>
          </div>
        </Link>

        <span className={s.navPill}>
          <span className={s.liveDot} />
          Gateway Operational
        </span>

        <ul className={s.navLinks}>
          <li><Link href="/" className={`${s.navLink} ${s.navLinkActive}`}>Gateway</Link></li>
          <li><Link href="/help#documentation" className={s.navLink}>Documentation</Link></li>
          <li><a href={mail("Enterprise support")} className={s.navLink}>Enterprise Support</a></li>
          <li><Link href="/status" className={s.navLink}>System Status</Link></li>
        </ul>

        <div className={s.navRight}>
          <Link href="/help" className={s.btnDocs}>
            <BookOpen className={s.btnDocsSvg} />
            Docs
          </Link>
          <Link href="/login" className={s.btnUser} aria-label="Sign in">
            <User className={s.btnUserSvg} />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <header className={s.hero}>
        <div className={s.heroBadge}>
          <Lock className={s.heroBadgeSvg} />
          Single Sign-On Authentication Gateway
        </div>
        <h1 className={s.heroTitle}>Select your workspace</h1>
        <p className={s.heroSub}>
          Choose your product workspace below to access your organization&apos;s environment.
        </p>
      </header>

      {/* Cards */}
      <div className={s.cardsWrap}>

        {/* Nexus */}
        <div className={s.card}>
          <div className={s.cardTop}>
            <span className={s.cardCat}>Enterprise Security</span>
            <span className={`${s.statusPill} ${s.pillGreen}`}>
              <span className={s.pillDot} />Active &bull; Live
            </span>
          </div>
          <div className={s.cardIcon}>
            <img src="/icon-512.png" alt="Nexus" style={markStyle} />
          </div>
          <h2 className={s.cardName}>Nexus</h2>
          <p className={s.cardTagline}>Unified Security Operations</p>
          <p className={s.cardDesc}>
            Cloud SOC, threat intelligence, and intelligent enterprise data protection engineered for modern security teams.
          </p>
          <div className={s.cardTags}>
            <span className={s.tag}>Cloud SOC</span>
            <span className={s.tag}>Autonomous DLP</span>
            <span className={s.tag}>Security AI</span>
            <span className={s.tag}>Email Shield</span>
          </div>
          <div className={s.cardSpacer} />
          <Link href="/login" className={`${s.cardCta} ${s.ctaDark}`}>
            Sign in to Nexus &nbsp;&rarr;
          </Link>
          <div className={s.cardLinks}>
            <Link href="/help#sign-in" className={s.cardLink}>Security credentials guide ↗</Link>
            <span className={s.cardLink}>v4.12</span>
          </div>
        </div>

        {/* Nexus Hospitality */}
        <div className={s.card}>
          <div className={s.cardTop}>
            <span className={s.cardCat}>Hotel Operations</span>
            <span className={`${s.statusPill} ${s.pillAmber}`}>
              <span className={s.pillDot} />Pilot Programme
            </span>
          </div>
          <div className={s.cardIcon}>
            <img src="/brand/nexus-hospitality.svg" alt="Nexus Hospitality" style={markStyle} />
          </div>
          <h2 className={s.cardName}>Nexus Hospitality</h2>
          <p className={s.cardTagline}>Property Experience Platform</p>
          <p className={s.cardDesc}>
            Live room status, housekeeping, stock control and team operations for hotels — with the mail and meetings your staff already use.
          </p>
          <div className={s.cardTags}>
            <span className={s.tag}>Room Board</span>
            <span className={s.tag}>Housekeeping</span>
            <span className={s.tag}>Stock Control</span>
            <span className={s.tag}>Team Tasks</span>
          </div>
          <div className={s.cardSpacer} />
          <Link href="/login" className={`${s.cardCta} ${s.ctaAmber}`}>
            Sign in to Hospitality &nbsp;&rarr;
          </Link>
          <div className={s.cardLinks}>
            <a href={mail("Nexus Hospitality pilot onboarding")} className={s.cardLink}>Request pilot onboarding ›</a>
            <Link href="/help#hospitality" className={s.cardLink}>Product guide</Link>
          </div>
        </div>

        {/* Nexus Education */}
        <div className={s.card}>
          <div className={s.cardTop}>
            <span className={s.cardCat}>Campus Management</span>
            <span className={`${s.statusPill} ${s.pillGray}`}>
              <span className={s.pillDot} />Coming 2027
            </span>
          </div>
          <div className={s.cardIcon}>
            <img src="/brand/nexus-education.svg" alt="Nexus Education" style={markStyle} />
          </div>
          <h2 className={s.cardName}>Nexus Education</h2>
          <p className={s.cardTagline}>Collegiate Core Infrastructure</p>
          <p className={s.cardDesc}>
            Unified institutional backbone for higher education, campus administration, and student records management.
          </p>
          <div className={s.cardTags}>
            <span className={s.tag}>Campus Safety</span>
            <span className={s.tag}>Student Records</span>
            <span className={s.tag}>Resource Scheduling</span>
            <span className={s.tag}>Faculty Portal</span>
          </div>
          <div className={s.cardSpacer} />
          <a href={mail("Nexus Education waitlist")} className={`${s.cardCta} ${s.ctaOutline}`}>
            Join Waitlist &nbsp;&rarr;
          </a>
          <div className={s.cardLinks}>
            <Link href="/help#education" className={s.cardLink}>View institutional roadmap ↗</Link>
            <a href={mail("Nexus Education briefing pack")} className={s.cardLink}>Briefing Pack</a>
          </div>
        </div>

      </div>

      {/* SSO Banner */}
      <div className={s.ssoWrap}>
        <div className={s.ssoInner}>
          <div className={s.ssoLeft}>
            <div className={s.ssoIcon}>
              <ShieldCheck className={s.ssoIconSvg} />
            </div>
            <div>
              <p className={s.ssoTitle}>Enterprise Identity Federation</p>
              <p className={s.ssoDesc}>Compatible with Okta, Microsoft Entra ID, Google Workspace &amp; SAML 2.0.</p>
            </div>
          </div>
          <a href={mail("Workspace provisioning")} className={s.ssoCta}>
            Need workspace provisioning? Contact Support
          </a>
        </div>
      </div>

      {/* Footer */}
      <footer className={s.footer}>
        <div className={s.footerLeft}>
          <span className={s.footerCopy}>&copy; 2026 CyberSage Technologies Ltd. All rights reserved.</span>
          <span className={s.certBadge}>
            <Check className={s.certBadgeSvg} />
            SOC 2 Type II
          </span>
          <span className={s.certBadge}>
            <Check className={s.certBadgeSvg} />
            ISO 27001 Certified
          </span>
        </div>
        <div className={s.footerLinks}>
          <Link href="/help#privacy" className={s.footerLink}>Privacy Policy</Link>
          <Link href="/help#terms" className={s.footerLink}>Terms of Service</Link>
          <Link href="/help#security" className={s.footerLink}>Security Overview</Link>
          <a href={mail("Support request")} className={s.footerLink}>Support Desk</a>
        </div>
      </footer>

    </div>
  );
}
