import { useState, useEffect } from "react";
import { Routes, Route, NavLink, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/store/auth";
import { Inbox } from "./Inbox";
import { Chat } from "./Chat";
import { Calendar } from "./Calendar";
import { Drive } from "./Drive";
import { Notes } from "./Notes";
import { AI } from "./AI";
import { Settings } from "./Settings";
import { Meetings } from "./Meetings";
import { CommandPalette } from "./CommandPalette";
import { getUnreadCount } from "@/api/client";

type NavItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
};

function SidebarIcon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const NAV_ICONS: Record<string, string> = {
  inbox: "M2.563 8.001h18.874M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  meet: "M15 10l4.553-2.069A1 1 0 0 1 21 8.845v6.31a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z",
  drive: "M22 17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.5C2 7 4 5 6.5 5H18c1.5 0 3 1.5 3 3v2M6 17l3-5 3 5 3-4 3 4",
  calendar: "M8 2v4M16 2v4M3 10h18M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z",
  notes: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  ai: "M12 2a8 8 0 1 0 0 16A8 8 0 0 0 12 2zM12 6v6l4 2",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
};

function NavBtn({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={`/app/${item.to}`}
      title={item.label}
      className={({ isActive }) =>
        `group relative flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm transition-fast no-select ${
          isActive
            ? "bg-brand-dim text-brand border border-brand-border shadow-[0_0_12px_rgba(0,210,255,0.08)]"
            : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
        }`
      }
    >
      {item.icon}
      <span className="flex-1 leading-none font-medium">{item.label}</span>
      {typeof item.badge === "number" && item.badge > 0 && (
        <span className="flex h-4.5 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-bg-deep leading-none">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
    </NavLink>
  );
}

export function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [dnd, setDnd] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    getUnreadCount().then(setUnread).catch(() => {});
    const iv = setInterval(() => {
      getUnreadCount().then(setUnread).catch(() => {});
    }, 30_000);

    const off = window.nexus.system.onDndToggle(() => setDnd(d => !d));

    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);

    return () => { clearInterval(iv); off(); window.removeEventListener("keydown", onKey); };
  }, []);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const navItems: NavItem[] = [
    { to: "inbox",    label: "Inbox",    icon: <SidebarIcon d={NAV_ICONS.inbox} />,    badge: unread },
    { to: "chat",     label: "Chat",     icon: <SidebarIcon d={NAV_ICONS.chat} /> },
    { to: "meet",     label: "Meetings", icon: <SidebarIcon d={NAV_ICONS.meet} /> },
    { to: "drive",    label: "Drive",    icon: <SidebarIcon d={NAV_ICONS.drive} /> },
    { to: "calendar", label: "Calendar", icon: <SidebarIcon d={NAV_ICONS.calendar} /> },
    { to: "notes",    label: "Notes",    icon: <SidebarIcon d={NAV_ICONS.notes} /> },
    { to: "ai",       label: "AI",       icon: <SidebarIcon d={NAV_ICONS.ai} /> },
  ];

  const initial = user?.fullName?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-base">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="no-select flex w-[220px] flex-shrink-0 flex-col border-r border-brand-border bg-bg-sidebar">
        {/* Workspace header / drag region */}
        <div
          className="drag-region flex h-[52px] flex-shrink-0 items-center gap-2.5 border-b border-brand-border px-4"
        >
          <div
            className="no-drag h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(0,210,255,0.2), rgba(0,100,150,0.3))",
              border: "1px solid rgba(0,210,255,0.2)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00d2ff" strokeWidth="2.5" strokeLinecap="round">
              <path d="M4 8H20M4 16H16" />
            </svg>
          </div>
          <div className="no-drag flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-accent leading-tight truncate">Nexus</p>
            <p className="text-[10px] text-text-muted uppercase tracking-[0.15em] leading-tight">by CyberSage</p>
          </div>
          {dnd && (
            <span className="no-drag text-[10px] text-text-muted bg-bg-hover rounded px-1.5 py-0.5 flex-shrink-0">DND</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
          {navItems.map(item => (
            <NavBtn key={item.to} item={item} />
          ))}
        </nav>

        {/* Bottom: Settings + user */}
        <div className="flex-shrink-0 border-t border-brand-border p-2 space-y-0.5">
          <NavBtn item={{ to: "settings", label: "Settings", icon: <SidebarIcon d={NAV_ICONS.settings} /> }} />

          {/* User pill */}
          <div className="flex items-center gap-2.5 rounded-md px-3 py-2 hover:bg-bg-hover transition-fast cursor-default">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-bg-active text-xs font-bold text-brand">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-text-primary truncate leading-tight">{user?.fullName}</p>
              <p className="text-[10px] text-text-muted truncate leading-tight">{user?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="no-drag flex-shrink-0 text-text-muted/50 hover:text-danger transition-fast"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <Routes>
          <Route path="inbox" element={<Inbox />} />
          <Route path="chat" element={<Chat />} />
          <Route path="meet" element={<Meetings />} />
          <Route path="drive" element={<Drive />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="notes" element={<Notes />} />
          <Route path="ai" element={<AI />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="inbox" replace />} />
        </Routes>
      </main>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}

function MeetIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-20">
      <path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.845v6.31a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
    </svg>
  );
}

function Placeholder({ label, desc, icon }: { label: string; desc?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-text-muted no-select">
      {icon}
      <div className="text-center">
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        <p className="text-xs mt-1">{desc ?? "Coming soon"}</p>
      </div>
    </div>
  );
}
