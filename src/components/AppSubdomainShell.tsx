/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText, FileSpreadsheet, Presentation, HardDrive, Video, Sparkles,
  Settings, LogOut, Grid3x3, ArrowUpRight, Menu, X,
} from "lucide-react";
import { SUBDOMAIN_NAV, type AppSubdomain } from "@/lib/subdomains";
import type { SessionUser } from "@/lib/auth";
import { avatarGradient } from "@/lib/avatar";

/**
 * Chrome for an app subdomain — docs.cybersage.uk, drive.*, meet.*.
 *
 * These hostnames previously rendered the full Nexus workspace shell: Mail,
 * Chat, Calendar, Security, Internship and everything else in the sidebar. So
 * "Docs" wasn't an app, it was the whole product at a different address, and
 * docs.cybersage.uk/drive quietly worked.
 *
 * This is the docs.google.com model instead: a slim sidebar listing only the
 * apps that hostname owns, plus a way back to the full workspace. Middleware
 * enforces the same boundary server-side (see shouldRedirectToHub).
 */

const ICONS: Record<string, React.ElementType> = {
  "/docs": FileText,
  "/apps/sheets": FileSpreadsheet,
  "/apps/slides": Presentation,
  "/drive": HardDrive,
  "/meet": Video,
  "/meet/intelligence": Sparkles,
};

/**
 * Per-app accent, matching each app's home gallery. Google leans on colour
 * (blue / green / yellow) to tell Docs, Sheets and Slides apart at a glance;
 * three identical grey glyphs give the eye nothing to latch onto.
 */
const ACCENTS: Record<string, string> = {
  "/docs": "var(--accent)",
  "/apps/sheets": "var(--ok)",
  "/apps/slides": "var(--warn)",
  "/drive": "var(--accent)",
  "/meet": "var(--violet)",
  "/meet/intelligence": "var(--violet)",
};

export function AppSubdomainShell({
  subdomain,
  currentUser,
  hubHref,
  children,
}: {
  subdomain: AppSubdomain;
  currentUser: SessionUser | null | undefined;
  /** Absolute URL back to the hub, or null in local dev. */
  hubHref: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = SUBDOMAIN_NAV[subdomain.host] ?? [];

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const nav = (
    <nav className="flex flex-col gap-0.5 px-2.5" aria-label={`${subdomain.label} navigation`}>
      {items.map(item => {
        const Icon = ICONS[item.href] ?? FileText;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors ${
              active
                ? "bg-accent-soft text-accent"
                : "text-muted hover:bg-hover hover:text-foreground"
            }`}
          >
            <Icon
              className="h-4 w-4 flex-shrink-0"
              style={{ color: active ? undefined : ACCENTS[item.href] }}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="flex flex-col gap-0.5 px-2.5 pb-3">
      <div className="my-1.5 h-px bg-border-soft mx-1" aria-hidden />
      {/* The way back to the rest of Nexus. Cross-origin, so a plain anchor. */}
      {hubHref && (
        <a
          href={hubHref}
          className="flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium
                     text-muted hover:bg-hover hover:text-foreground transition-colors"
        >
          <Grid3x3 className="h-4 w-4 flex-shrink-0" />
          All of Nexus
          <ArrowUpRight className="h-3.5 w-3.5 ml-auto text-subtle" />
        </a>
      )}
      <Link
        href="/settings"
        className="flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium
                   text-muted hover:bg-hover hover:text-foreground transition-colors"
      >
        <Settings className="h-4 w-4 flex-shrink-0" />
        Settings
      </Link>
      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[13px] font-medium
                     text-muted hover:bg-crit-soft hover:text-crit transition-colors"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          Sign out
        </button>
      </form>
      {currentUser && (
        <Link href="/profile" className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-hover transition-colors">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white"
            style={{ background: avatarGradient(currentUser.fullName) }}
          >
            {currentUser.fullName.charAt(0).toUpperCase()}
          </div>
          <span className="truncate text-[12.5px] font-medium text-foreground">
            {currentUser.fullName}
          </span>
        </Link>
      )}
    </div>
  );

  const brand = (
    <Link
      href={subdomain.home}
      aria-label={`${subdomain.label} home`}
      className="flex h-[56px] flex-shrink-0 items-center gap-2.5 px-4"
    >
      <img src="/nexus.png" alt="" className="h-6 w-6 flex-shrink-0 object-contain" />
      <span className="truncate text-[13.5px] font-semibold text-foreground">
        {subdomain.label}
      </span>
    </Link>
  );

  const SIDEBAR_W = 216;

  return (
    <div className="min-h-screen bg-canvas">
      {/* ── Desktop sidebar ── */}
      <aside
        className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 z-30 flex-col bg-canvas"
        style={{ width: SIDEBAR_W }}
      >
        {brand}
        <div className="flex-1 overflow-y-auto pt-1">{nav}</div>
        {footer}
      </aside>

      {/* ── Mobile top bar ── */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 flex h-[56px] items-center gap-2 px-3 bg-canvas">
        <button
          onClick={() => setMobileOpen(v => !v)}
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover transition-colors"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <span className="text-[13.5px] font-semibold text-foreground">
          {subdomain.label}
        </span>
      </div>

      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-overlay"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="lg:hidden fixed inset-y-0 left-0 z-50 w-[260px] flex flex-col bg-surface shadow-pop">
            {brand}
            <div className="flex-1 overflow-y-auto pt-1">{nav}</div>
            {footer}
          </aside>
        </>
      )}

      {/* ── Content ── */}
      <div className="pt-[56px] lg:pt-0 overflow-x-hidden">
        <main className="lg:pl-[216px] lg:pr-2 lg:py-2 lg:h-screen overflow-x-hidden">
          <div
            key={pathname}
            // Mobile needs the explicit calc (56px top bar) because <main> has
            // no definite height there; from lg up the sized wrapper below
            // gives h-full something to resolve against.
            className="nexpage h-[calc(100vh-56px)] lg:h-full
                       overflow-y-auto overflow-x-hidden bg-surface
                       lg:rounded-panel lg:border lg:border-border lg:shadow-panel"
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
