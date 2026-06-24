/* eslint-disable @next/next/no-img-element */
"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LogOut, ChevronLeft, ChevronRight, Menu, X, Settings, BellOff, Bell, Inbox, MessageSquare, Video, Sparkles, Search } from "lucide-react";
// Search is used in the Suspense fallback pill
import { SidebarNav } from "./SidebarNav";
import { SearchTrigger } from "./GlobalSearch";
import { NotificationCenter } from "./NotificationCenter";
import { ComposeButton } from "./ComposeButton";
import { roleLabels, type SessionUser } from "@/lib/auth";
import type { PortalNavItem } from "@/lib/auth";
import { avatarGradient } from "@/lib/avatar";

export function SidebarLayout({
  nav,
  currentUser,
  children,
}: {
  nav: PortalNavItem[];
  currentUser: SessionUser | null | undefined;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isDnd, setIsDnd] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const pathname = usePathname();
  const currentUserId = currentUser?.id;

  // Editor routes open full-screen (no portal chrome), like opening a doc in Google.
  const fullScreen =
    /^\/apps\/(sheets|slides)\/[^/]+$/.test(pathname || "") ||
    pathname === "/docs" || (pathname?.startsWith("/docs/") ?? false);

  useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem("sidebar_collapsed") === "true") setCollapsed(true);
    } catch {}
    // Load current presence status (requires userId param)
    if (currentUserId) {
      fetch(`/api/presence?userIds=${currentUserId}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.[currentUserId]?.status === "dnd") setIsDnd(true); })
        .catch(() => {});
      // Load avatar
      fetch("/api/profile")
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.avatarUrl) setAvatarUrl(d.avatarUrl); })
        .catch(() => {});
    }
  }, [currentUserId]);

  const toggleDnd = useCallback(async () => {
    const next = !isDnd;
    setIsDnd(next);
    try {
      await fetch("/api/presence", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next ? "dnd" : "online" }),
      });
    } catch {}
  }, [isDnd]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("sidebar_collapsed", String(next)); } catch {}
      return next;
    });
  };

  /* ── Sidebar content (shared desktop/mobile) ──────────────────── */
  const sidebarContent = (isMobile: boolean) => {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden">

        {/* Compose / New */}
        {(!collapsed || isMobile) && (
          <div className="px-3 pt-3 pb-1 space-y-1">
            {currentUser && <ComposeButton userRole={currentUser.role} collapsed={false} />}
          </div>
        )}
        {collapsed && !isMobile && (
          <div className="flex flex-col items-center gap-1.5 py-3 px-1.5">
            {currentUser && <ComposeButton userRole={currentUser.role} collapsed={true} />}
          </div>
        )}

        {/* Nav links */}
        <SidebarNav nav={nav} collapsed={collapsed && !isMobile} />

        {/* Footer */}
        {currentUser && (
          <div
            className={`mt-auto border-t border-[#1C1F28] px-3 py-3 space-y-1 ${
              collapsed && !isMobile ? "flex flex-col items-center gap-1 space-y-0" : ""
            }`}
          >
            {/* User row */}
            {collapsed && !isMobile ? (
              avatarUrl
                ? <img src={avatarUrl} alt={currentUser.fullName} title={currentUser.fullName} className="h-8 w-8 rounded-full object-cover flex-shrink-0" />
                : <div className="flex h-8 w-8 items-center justify-center rounded-full text-white text-xs font-semibold" style={{ background: avatarGradient(currentUser.fullName) }} title={currentUser.fullName}>{currentUser.fullName.charAt(0).toUpperCase()}</div>
            ) : (
              <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-[#1B1F2A] transition-colors cursor-default">
                {avatarUrl
                  ? <img src={avatarUrl} alt={currentUser.fullName} className="h-8 w-8 rounded-full object-cover flex-shrink-0" />
                  : <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-white text-xs font-semibold" style={{ background: avatarGradient(currentUser.fullName) }}>{currentUser.fullName.charAt(0).toUpperCase()}</div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#E6E9F0] truncate leading-tight">{currentUser.fullName}</p>
                  <p className="text-[11.5px] text-[#5A6275] leading-tight truncate">{roleLabels[currentUser.role]}</p>
                </div>
              </div>
            )}

            {/* Do Not Disturb toggle */}
            <button
              onClick={toggleDnd}
              title={isDnd ? "Do Not Disturb: On" : "Do Not Disturb: Off"}
              className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition-colors w-full ${
                collapsed && !isMobile ? "justify-center w-9 px-0" : ""
              } ${
                isDnd
                  ? "text-[#00C2FF] bg-[#0E2532] hover:bg-[#0E2532]"
                  : "text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0]"
              }`}
            >
              {isDnd
                ? <BellOff className="h-[15px] w-[15px] flex-shrink-0" />
                : <Bell className="h-[15px] w-[15px] flex-shrink-0" />
              }
              {(!collapsed || isMobile) && (isDnd ? "Do Not Disturb" : "Notifications on")}
            </button>

            {/* Sign out */}
            <form
              action="/api/auth/logout"
              method="post"
              className={collapsed && !isMobile ? "w-full flex justify-center" : ""}
            >
              <button
                title={collapsed && !isMobile ? "Sign out" : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] text-[#8A92A6] hover:bg-red-500/10 hover:text-red-400 transition-colors w-full ${
                  collapsed && !isMobile ? "justify-center w-9 px-0" : ""
                }`}
              >
                <LogOut className="h-[15px] w-[15px] flex-shrink-0" />
                {(!collapsed || isMobile) && "Sign out"}
              </button>
            </form>
          </div>
        )}
      </div>
    );
  };

  const desktopWidth = mounted && collapsed ? "lg:w-[56px]" : "lg:w-[228px]";
  const contentPad   = mounted && collapsed ? "lg:pl-[56px]" : "lg:pl-[228px]";

  if (fullScreen) {
    return <div className="h-screen w-screen overflow-hidden bg-[#0B0D12]">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-[#0B0D12]">
      <div className="flex min-h-screen">

        {/* ── Desktop sidebar ───────────────────────────────── */}
        <aside
          className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 bg-[#0F1117] border-r border-[#1C1F28] transition-all duration-200 z-30 ${desktopWidth}`}
        >
          {/* Logo header */}
          <div
            className={`flex h-[56px] flex-shrink-0 items-center border-b border-[#1C1F28] ${
              collapsed ? "justify-center px-2" : "gap-2.5 px-4"
            }`}
          >
            {collapsed
              ? <img src="/nexus.png" alt="Nexus" className="h-8 w-8 flex-shrink-0 object-contain" />
              : <img src="/nexusLogo-dark.png" alt="CyberSage Nexus" className="h-[34px] w-auto flex-shrink-0 object-contain max-w-[160px]" />
            }
            {!collapsed && (
              <>
                <div className="flex-1" />
                <button
                  onClick={toggleCollapsed}
                  className="p-1.5 rounded-lg text-[#5A6275] hover:bg-[#1B1F2A] hover:text-[#8A92A6] transition-colors"
                  title="Collapse sidebar"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {collapsed && (
              <button
                onClick={toggleCollapsed}
                className="absolute -right-3 top-5 flex h-6 w-6 items-center justify-center rounded-full bg-[#12151D] border border-[#262A35] shadow-sm text-[#5A6275] hover:text-[#8A92A6] transition-colors z-10"
                title="Expand sidebar"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>

          {sidebarContent(false)}
        </aside>

        {/* ── Mobile overlay drawer ─────────────────────────── */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="relative z-10 flex w-[228px] flex-col bg-[#0F1117] shadow-xl border-r border-[#1C1F28]">
              <div className="flex h-[52px] items-center gap-2.5 border-b border-[#1C1F28] px-4">
                <img src="/nexusLogo-dark.png" alt="CyberSage Nexus" className="h-[24px] w-auto object-contain max-w-[130px]" />
                <div className="flex-1" />
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-1.5 rounded-lg text-[#5A6275] hover:bg-[#1B1F2A]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {sidebarContent(true)}
            </aside>
          </div>
        )}

        {/* ── Mobile top bar — Gmail-style search-first ─────── */}
        <div className="lg:hidden fixed top-0 inset-x-0 z-40 flex h-[60px] items-center gap-2 bg-[#0B0D12] px-3">
          {/* Hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="flex-shrink-0 p-1.5 rounded-lg text-[#8A92A6] hover:bg-[#1B1F2A] transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          {/* Search pill */}
          <Suspense fallback={
            <div className="flex-1 flex items-center gap-2.5 h-[40px] rounded-full bg-[#1B1F2A] border border-[#262A35] px-4 cursor-pointer">
              <Search className="h-4 w-4 text-[#5A6275] flex-shrink-0" />
              <span className="text-[13px] text-[#5A6275]">Search in Nexus</span>
            </div>
          }>
            <SearchTrigger variant="searchbar" />
          </Suspense>
          {/* Avatar → Profile */}
          <a href="/profile" aria-label="Profile" className="flex-shrink-0">
            {avatarUrl
              ? <img src={avatarUrl} alt={currentUser?.fullName ?? ""} className="h-8 w-8 rounded-full object-cover ring-2 ring-[#262A35]" />
              : <div className="flex h-8 w-8 items-center justify-center rounded-full text-white text-[11px] font-semibold ring-2 ring-[#262A35]" style={{ background: avatarGradient(currentUser?.fullName ?? "U") }}>{(currentUser?.fullName ?? "U").charAt(0).toUpperCase()}</div>
            }
          </a>
        </div>

        {/* ── Mobile bottom tab bar — 4-tab pip style ───────── */}
        <nav
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0F1117] border-t border-[#1C1F28]"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex h-[56px] items-stretch">
            {([
              { href: "/inbox", icon: Inbox,         label: "Inbox" },
              { href: "/chat",  icon: MessageSquare,  label: "Chat"  },
              { href: "/meet",  icon: Video,           label: "Meet"  },
              { href: "/ai",    icon: Sparkles,        label: "AI"    },
            ] as const).map(({ href, icon: Icon, label }) => {
              const active = pathname === href || pathname?.startsWith(href + "/");
              return (
                <a
                  key={href}
                  href={href}
                  className="flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors"
                  style={{ color: active ? "#00C2FF" : "#5A6275" }}
                >
                  <Icon className="h-[22px] w-[22px]" />
                  {active
                    ? <span className="w-[20px] h-[3px] rounded-full mt-0.5" style={{ background: "#00C2FF" }} />
                    : <span className="text-[10px] font-medium mt-0.5">{label}</span>
                  }
                </a>
              );
            })}
          </div>
        </nav>

        {/* ── Desktop top bar (search + actions) ───────────── */}
        <div className={`hidden lg:flex fixed top-0 inset-x-0 z-20 h-[56px] items-center gap-4 px-5 bg-[#0B0D12] border-b border-[#1C1F28] transition-all duration-200 ${contentPad}`}>
          <div className="flex-1 flex justify-center">
            <SearchTrigger variant="topbar" />
          </div>
          {currentUser && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Suspense fallback={null}>
                <NotificationCenter userId={currentUser.id} />
              </Suspense>
              <a
                href="/settings"
                title="Settings"
                className="flex h-9 w-9 items-center justify-center rounded-full text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] transition-colors"
              >
                <Settings className="h-[18px] w-[18px]" />
              </a>
              {avatarUrl
                ? <img src={avatarUrl} alt={currentUser.fullName} title={currentUser.fullName} className="h-8 w-8 rounded-full object-cover" />
                : <div className="flex h-8 w-8 items-center justify-center rounded-full text-white text-xs font-semibold" style={{ background: avatarGradient(currentUser.fullName) }} title={currentUser.fullName}>{currentUser.fullName.charAt(0).toUpperCase()}</div>
              }
            </div>
          )}
        </div>

        {/* ── Main content ──────────────────────────────────── */}
        <div className={`flex-1 transition-[padding] duration-200 pt-[60px] pb-[56px] lg:pt-[56px] lg:pb-0 ${contentPad}`}>
          <main className="min-h-screen"><div key={pathname} className="nexpage h-full">{children}</div></main>
        </div>

      </div>
    </div>
  );
}
