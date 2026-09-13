import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { Playfair_Display, Inter } from "next/font/google";
import Link from "next/link";
import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Nexus Suite",
  description: "Select your workspace — Nexus, Nexus Hospitality, or Nexus Education.",
};

export default async function RootPage() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (user) redirect("/home");

  return (
    <div className={`${s.page} ${playfair.variable} ${inter.variable}`}>

      {/* Nav */}
      <nav className={s.nav}>
        <div className={s.navLogo}>
          <div className={s.navIcon}>
            <svg className={s.navIconSvg} viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <span className={s.navBrandName}>Nexus Suite</span>
            <span className={s.navBrandSub}>nexus.cybersage.uk</span>
          </div>
        </div>

        <span className={s.navPill}>
          <span className={s.liveDot} />
          Gateway Operational
        </span>

        <ul className={s.navLinks}>
          <li><a href="#" className={`${s.navLink} ${s.navLinkActive}`}>Gateway</a></li>
          <li><a href="#" className={s.navLink}>Documentation</a></li>
          <li><a href="#" className={s.navLink}>Enterprise Support</a></li>
          <li><a href="#" className={s.navLink}>System Status</a></li>
        </ul>

        <div className={s.navRight}>
          <a href="#" className={s.btnDocs}>
            <svg className={s.btnDocsSvg} viewBox="0 0 24 24">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            Docs
          </a>
          <div className={s.btnUser}>
            <svg className={s.btnUserSvg} viewBox="0 0 24 24">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className={s.hero}>
        <div className={s.heroBadge}>
          <svg className={s.heroBadgeSvg} viewBox="0 0 24 24">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
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
          <div className={`${s.cardIcon} ${s.iconDark}`}>
            <svg className={s.cardIconSvg} viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
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
            <a href="#" className={s.cardLink}>Security credentials guide ↗</a>
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
          <div className={`${s.cardIcon} ${s.iconAmber}`}>
            <svg className={s.cardIconSvg} viewBox="0 0 24 24">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <h2 className={s.cardName}>Nexus Hospitality</h2>
          <p className={s.cardTagline}>Property Experience Platform</p>
          <p className={s.cardDesc}>
            AI-driven operational intelligence, property management sync, and guest experience orchestration for premier hospitality brands.
          </p>
          <div className={s.cardTags}>
            <span className={s.tag}>PMS Sync</span>
            <span className={s.tag}>Guest Intelligence</span>
            <span className={s.tag}>Predictive Operations</span>
            <span className={s.tag}>Daily Briefings</span>
          </div>
          <div className={s.cardSpacer} />
          <Link href="/login" className={`${s.cardCta} ${s.ctaAmber}`}>
            Sign in to Hospitality &nbsp;&rarr;
          </Link>
          <div className={s.cardLinks}>
            <a href="#" className={s.cardLink}>Request pilot onboarding ›</a>
            <span className={s.cardLink}>Cohort 2</span>
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
          <div className={`${s.cardIcon} ${s.iconLight}`}>
            <svg className={s.cardIconSvg} viewBox="0 0 24 24">
              <line x1="3" x2="21" y1="22" y2="22"/>
              <line x1="6" x2="6" y1="18" y2="11"/>
              <line x1="10" x2="10" y1="18" y2="11"/>
              <line x1="14" x2="14" y1="18" y2="11"/>
              <line x1="18" x2="18" y1="18" y2="11"/>
              <polygon points="12 2 20 7 4 7"/>
            </svg>
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
          <a
            href="mailto:peeyushmaster21@gmail.com?subject=Nexus Education Waitlist"
            className={`${s.cardCta} ${s.ctaOutline}`}
          >
            Join Waitlist &nbsp;&rarr;
          </a>
          <div className={s.cardLinks}>
            <a href="#" className={s.cardLink}>View institutional roadmap ↗</a>
            <span className={s.cardLink}>Briefing Pack</span>
          </div>
        </div>

      </div>

      {/* SSO Banner */}
      <div className={s.ssoWrap}>
        <div className={s.ssoInner}>
          <div className={s.ssoLeft}>
            <div className={s.ssoIcon}>
              <svg className={s.ssoIconSvg} viewBox="0 0 24 24">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <circle cx="12" cy="12" r="2"/>
              </svg>
            </div>
            <div>
              <p className={s.ssoTitle}>Enterprise Identity Federation</p>
              <p className={s.ssoDesc}>Compatible with Okta, Microsoft Entra ID, Google Workspace &amp; SAML 2.0.</p>
            </div>
          </div>
          <a href="mailto:peeyushmaster21@gmail.com?subject=Workspace Provisioning" className={s.ssoCta}>
            Need workspace provisioning? Contact Support
          </a>
        </div>
      </div>

      {/* Footer */}
      <footer className={s.footer}>
        <div className={s.footerLeft}>
          <span className={s.footerCopy}>&copy; 2026 CyberSage Technologies Ltd. All rights reserved.</span>
          <span className={s.certBadge}>
            <svg className={s.certBadgeSvg} viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            SOC 2 Type II
          </span>
          <span className={s.certBadge}>
            <svg className={s.certBadgeSvg} viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            ISO 27001 Certified
          </span>
        </div>
        <div className={s.footerLinks}>
          <a href="#" className={s.footerLink}>Privacy Policy</a>
          <a href="#" className={s.footerLink}>Terms of Service</a>
          <a href="#" className={s.footerLink}>Security Overview</a>
          <a href="#" className={s.footerLink}>Support Desk</a>
        </div>
      </footer>

    </div>
  );
}
