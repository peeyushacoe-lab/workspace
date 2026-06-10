"use client";

import { Suspense, useEffect, useState } from "react";
import { LogOut, ChevronLeft, ChevronRight, Menu, X, Settings } from "lucide-react";
import { SidebarNav } from "./SidebarNav";
import { SearchTrigger } from "./GlobalSearch";
import { NotificationCenter } from "./NotificationCenter";
import { ComposeButton } from "./ComposeButton";
import { roleLabels, type SessionUser } from "@/lib/auth";
import type { PortalNavItem } from "@/lib/auth";

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

  useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem("sidebar_collapsed") === "true") setCollapsed(true);
    } catch {}
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("sidebar_collapsed", String(next)); } catch {}
      return next;
    });
  };

  const sidebarContent = (isMobile: boolean) => (
    <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
      {(!collapsed || isMobile) && (
        <>
          <div className="px-3 pt-3 pb-1">
            <SearchTrigger variant="dark" />
          </div>
          {currentUser && <ComposeButton userRole={currentUser.role} collapsed={false} />}
        </>
      )}

      {collapsed && !isMobile && (
        <div className="flex flex-col items-center gap-1 py-2">
          <SearchTrigger variant="collapsed" />
          {currentUser && <ComposeButton userRole={currentUser.role} collapsed={true} />}
        </div>
      )}

      <SidebarNav nav={nav} collapsed={collapsed && !isMobile} />

      {currentUser && (
        <div
          className={`mt-auto border-t border-[rgba(0,255,255,0.08)] p-3 ${
            collapsed && !isMobile ? "flex flex-col items-center gap-2" : ""
          }`}
        >
          {collapsed && !isMobile ? (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-md bg-[#262939] text-[#dfe1f6] text-xs font-semibold"
              title={currentUser.fullName}
            >
              {currentUser.fullName.charAt(0).toUpperCase()}
            </div>
          ) : (
            <div className="flex items-center gap-2.5 mb-2">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-[#262939] text-[#dfe1f6] text-xs font-semibold">
                {currentUser.fullName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#dfe1f6] truncate leading-tight">{currentUser.fullName}</p>
                <p className="text-xs text-[#bbc9cf] leading-tight">{roleLabels[currentUser.role]}</p>
              </div>
            </div>
          )}
          <a
            href="/settings"
            title="Settings"
            className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] transition-colors duration-150 ${
              collapsed && !isMobile ? "justify-center w-9 px-0 self-center" : "w-full"
            }`}
          >
            <Settings className="h-3.5 w-3.5 flex-shrink-0" />
            {(!collapsed || isMobile) && "Settings"}
          </a>

          <form
            action="/api/auth/logout"
            method="post"
            className={collapsed && !isMobile ? "w-full flex justify-center" : ""}
          >
            <button
              title={collapsed && !isMobile ? "Sign out" : undefined}
              className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-[#bbc9cf] hover:bg-red-500/10 hover:text-red-400 transition-colors ${
                collapsed && !isMobile ? "justify-center w-9 px-0" : "w-full"
              }`}
            >
              <LogOut className="h-3.5 w-3.5 flex-shrink-0" />
              {(!collapsed || isMobile) && "Sign out"}
            </button>
          </form>
        </div>
      )}
    </div>
  );

  const desktopWidth = mounted && collapsed ? "lg:w-12" : "lg:w-56";
  const contentPad = mounted && collapsed ? "lg:pl-12" : "lg:pl-56";

  return (
    <div className="min-h-screen">
      <div className="flex min-h-screen">

        {/* Desktop Sidebar — glassmorphism with cyan border per design system */}
        <aside
          className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 bg-[#0a0d1c]/85 backdrop-blur-xl border-r border-[rgba(0,255,255,0.08)] transition-all duration-200 z-30 ${desktopWidth}`}
        >
          {/* Header */}
          <div
            className={`flex h-14 flex-shrink-0 items-center border-b border-[rgba(0,255,255,0.08)] ${
              collapsed ? "justify-center px-2" : "gap-2.5 px-4"
            }`}
          >
            {collapsed
              ? <img src="/nexus.png" alt="CyberSage Nexus" className="h-8 w-8 flex-shrink-0 object-contain" />
              : <img src="/nexusLogo.png" alt="CyberSage Nexus" className="h-8 w-auto flex-shrink-0 object-contain max-w-[140px]" />
            }
            {!collapsed && (
              <>
                <div className="flex-1" />
                <button
                  onClick={toggleCollapsed}
                  className="p-1 rounded-md text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] transition-colors flex-shrink-0"
                  title="Collapse sidebar"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {collapsed && (
              <button
                onClick={toggleCollapsed}
                className="absolute -right-3 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-[#0a0d1c] border border-[rgba(0,255,255,0.08)] text-[#bbc9cf] hover:text-[#dfe1f6] transition-colors z-10"
                title="Expand sidebar"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>

          {sidebarContent(false)}
        </aside>

        {/* Mobile Overlay Drawer */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="relative z-10 flex w-56 flex-col bg-[#0a0d1c]/90 backdrop-blur-xl shadow-2xl">
              <div className="flex h-12 items-center gap-2.5 border-b border-[rgba(0,255,255,0.08)] px-4">
                <img src="/nexusLogo.png" alt="CyberSage Nexus" className="h-7 w-auto object-contain max-w-[130px]" />
                <div className="flex-1" />
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-1 rounded-md text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {sidebarContent(true)}
            </aside>
          </div>
        )}

        {/* Mobile Top Bar */}
        <div className="lg:hidden fixed top-0 inset-x-0 z-40 flex h-12 items-center gap-3 bg-[#0a0d1c]/85 backdrop-blur-xl border-b border-[rgba(0,255,255,0.08)] px-4">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-md text-[#bbc9cf] hover:bg-[#1b1f2e] transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center">
            <img src="/nexusLogo.png" alt="CyberSage Nexus" className="h-7 w-auto object-contain max-w-[120px]" />
          </div>
          {currentUser && (
            <div className="ml-auto flex items-center gap-2">
              <Suspense fallback={null}>
                <NotificationCenter userId={currentUser.id} />
              </Suspense>
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#262939] text-[#dfe1f6] text-xs font-semibold">
                {currentUser.fullName.charAt(0).toUpperCase()}
              </div>
            </div>
          )}
        </div>

        {/* Desktop top-right notification bar */}
        <div className={`hidden lg:flex fixed top-0 right-0 z-20 h-11 items-center px-4 gap-2 transition-all duration-200 ${contentPad}`}>
          {currentUser && (
            <div className="ml-auto flex items-center gap-2">
              <Suspense fallback={null}>
                <NotificationCenter userId={currentUser.id} />
              </Suspense>
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className={`flex-1 transition-[padding] duration-200 pt-12 lg:pt-11 ${contentPad}`}>
          <main className="min-h-screen">{children}</main>
        </div>

      </div>
    </div>
  );
}
