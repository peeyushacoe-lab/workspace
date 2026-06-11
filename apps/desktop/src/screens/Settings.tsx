import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/store/auth";

type SystemInfo = { platform: string; version: string; apiBase: string };

export function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [activeSection, setActiveSection] = useState("profile");

  useEffect(() => {
    window.nexus.system.info().then(setSysInfo).catch(() => {});
  }, []);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const initial = user?.fullName?.[0]?.toUpperCase() ?? "?";

  const sections = [
    { id: "profile", label: "Profile" },
    { id: "appearance", label: "Appearance" },
    { id: "about", label: "About" },
  ];

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[200px] flex-shrink-0 border-r border-brand-border bg-bg-sidebar flex flex-col overflow-hidden">
        <div className="h-[52px] flex-shrink-0 flex items-center px-4 border-b border-brand-border no-select">
          <span className="text-sm font-semibold text-text-primary">Settings</span>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-fast mb-0.5 ${
                activeSection === s.id
                  ? "bg-brand-dim text-text-primary font-medium"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              }`}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-lg">
          {activeSection === "profile" && (
            <div>
              <h2 className="text-lg font-semibold text-text-primary mb-6">Profile</h2>

              {/* Avatar */}
              <div className="flex items-center gap-5 mb-8">
                <div
                  className="h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-brand flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, rgba(0,210,255,0.15), rgba(0,70,100,0.3))", border: "1px solid rgba(0,210,255,0.2)" }}
                >
                  {initial}
                </div>
                <div>
                  <p className="text-base font-semibold text-text-primary">{user?.fullName}</p>
                  <p className="text-sm text-text-muted">{user?.email}</p>
                  <span className="inline-block mt-1.5 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20">
                    {user?.role}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-brand-border bg-bg-card p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Account Details</h3>
                  <div className="space-y-3">
                    {[
                      { label: "Full Name", value: user?.fullName },
                      { label: "Email", value: user?.email },
                      { label: "Role", value: user?.role },
                      { label: "MFA", value: user?.mfaEnabled ? "Enabled" : "Disabled" },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between">
                        <span className="text-xs text-text-muted">{row.label}</span>
                        <span className="text-sm text-text-primary font-medium">{row.value ?? "–"}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => void handleLogout()}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-danger/30 bg-danger/8 py-3 text-sm font-medium text-danger hover:bg-danger/15 transition-fast"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                  </svg>
                  Sign out
                </button>
              </div>
            </div>
          )}

          {activeSection === "appearance" && (
            <div>
              <h2 className="text-lg font-semibold text-text-primary mb-6">Appearance</h2>
              <div className="rounded-xl border border-brand-border bg-bg-card p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-4">Theme</h3>
                <div className="flex gap-3">
                  <div className="flex-1 rounded-xl border-2 border-brand bg-bg-base p-4 cursor-default">
                    <div className="flex gap-2 mb-3">
                      <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                      <div className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
                      <div className="h-3 w-3 rounded-full bg-[#28c840]" />
                    </div>
                    <div className="flex gap-1.5">
                      <div className="w-6 rounded bg-bg-sidebar h-8" />
                      <div className="flex-1 rounded bg-bg-card h-8" />
                    </div>
                    <p className="text-[11px] text-brand mt-2 font-medium text-center">Dark ✓</p>
                  </div>
                  <div className="flex-1 rounded-xl border border-brand-border/40 bg-bg-card/50 p-4 cursor-not-allowed opacity-40">
                    <div className="flex gap-2 mb-3">
                      <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                      <div className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
                      <div className="h-3 w-3 rounded-full bg-[#28c840]" />
                    </div>
                    <div className="flex gap-1.5">
                      <div className="w-6 rounded bg-gray-200 h-8" />
                      <div className="flex-1 rounded bg-white h-8" />
                    </div>
                    <p className="text-[11px] text-text-muted mt-2 text-center">Light</p>
                  </div>
                </div>
                <p className="text-[11px] text-text-muted mt-3">Light theme coming in a future update</p>
              </div>
            </div>
          )}

          {activeSection === "about" && (
            <div>
              <h2 className="text-lg font-semibold text-text-primary mb-6">About Nexus</h2>
              <div className="rounded-xl border border-brand-border bg-bg-card p-5 space-y-3">
                {[
                  { label: "Application", value: "Nexus Desktop" },
                  { label: "Version", value: sysInfo?.version ?? "Loading…" },
                  { label: "Platform", value: sysInfo?.platform ? `${sysInfo.platform === "darwin" ? "macOS" : sysInfo.platform === "win32" ? "Windows" : "Linux"}` : "–" },
                  { label: "Server", value: sysInfo?.apiBase ?? "–" },
                  { label: "Build", value: "Electron + Vite + React" },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="text-xs text-text-muted">{row.label}</span>
                    <span className="text-sm text-text-primary font-mono">{row.value}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-xl border border-brand-border bg-bg-card p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">CyberSage Ecosystem</h3>
                <div className="space-y-2">
                  {[
                    { name: "Nexus", desc: "Communication & productivity platform" },
                    { name: "Sentinel", desc: "Enterprise security & threat intelligence" },
                    { name: "Brain", desc: "AI-powered workflow automation" },
                  ].map(p => (
                    <div key={p.name} className="flex items-center gap-3">
                      <div className="h-6 w-6 rounded-md bg-brand-dim border border-brand-border flex items-center justify-center text-[9px] font-bold text-brand flex-shrink-0">
                        {p.name[0]}
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-text-primary leading-none">{p.name}</p>
                        <p className="text-[11px] text-text-muted mt-0.5">{p.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <p className="mt-5 text-center text-[11px] text-text-muted/40">Copyright © 2025 CyberSage. All rights reserved.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
