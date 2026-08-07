"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { User, Settings, Bell, LogOut, Check } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { avatarGradient } from "@/lib/avatar";
import { PresenceDot } from "@/components/PresenceIndicator";
import type { PresenceStatus } from "@/app/api/presence/route";

/**
 * Status options, set inline rather than through PresenceStatusPicker.
 *
 * The picker is its own 288px-wide popover; nesting it inside this 256px menu
 * meant a dropdown inside a dropdown, clipped by the parent's rounded overflow.
 * Four flat buttons do the same job in one click instead of two.
 */
const STATUSES: { value: PresenceStatus; label: string }[] = [
  { value: "online", label: "Available" },
  { value: "away", label: "Away" },
  { value: "busy", label: "Busy" },
  { value: "dnd", label: "Do not disturb" },
];

/**
 * The account entry point in Connect's shell.
 *
 * This used to be a bare `<Link href="/profile">` wrapped around the avatar —
 * one click, no warning, and you were looking at Nexus's full sidebar with no
 * way back except the browser's back button. `/profile` and `/settings` are
 * genuinely Nexus pages (there's no reason to fork them), so leaving Connect
 * to reach them is correct — the fix is making that a deliberate second click
 * inside a menu, not something a single accidental tap on your own avatar
 * does. Status-setting is the one action people want *without* leaving, so
 * it's inlined here via the existing PresenceStatusPicker rather than also
 * requiring a trip to Nexus.
 */
export function ConnectProfileMenu({
  currentUser,
  showName = false,
  placement = "top",
}: {
  currentUser: SessionUser;
  /** Full row with name, for the desktop sidebar footer. */
  showName?: boolean;
  /** Which way the menu opens relative to the trigger. */
  placement?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PresenceStatus>("online");
  const [savingStatus, setSavingStatus] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const setPresence = async (next: PresenceStatus) => {
    const previous = status;
    setStatus(next); // optimistic — a status flag should feel instant
    setSavingStatus(true);
    try {
      const res = await fetch("/api/presence", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setStatus(previous);
    } finally {
      setSavingStatus(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";

  return (
    <div className={`relative ${showName ? "w-full" : ""}`} ref={ref}>
      <button
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${currentUser.fullName} — account menu`}
        className={`flex items-center gap-2.5 rounded-lg py-1.5 pl-1.5 pr-2 transition-colors hover:bg-hover ${showName ? "w-full" : ""} ${focusRing}`}
      >
        <span
          className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold uppercase text-white"
          style={{ background: avatarGradient(currentUser.fullName) }}
        >
          {currentUser.fullName.charAt(0)}
          {/* Presence pip on your own avatar doubles as confirmation the
              socket is actually connected. */}
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-canvas bg-ok"
          />
        </span>
        {showName && (
          <span className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-foreground">
            {currentUser.fullName}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-50 w-64 rounded-xl border border-border bg-surface py-1 shadow-pop ${
            placement === "top" ? "bottom-full left-0 mb-2" : "right-0 top-full mt-2"
          }`}
        >
          <div className="border-b border-border-soft px-3.5 pb-3 pt-2">
            <p className="truncate text-[13.5px] font-semibold text-foreground">
              {currentUser.fullName}
            </p>
            <p className="truncate text-xs text-subtle">{currentUser.email}</p>
          </div>

          <div className="border-b border-border-soft py-1.5">
            {STATUSES.map((s) => (
              <button
                key={s.value}
                onClick={() => void setPresence(s.value)}
                disabled={savingStatus}
                className={`flex w-full items-center gap-3 px-3.5 py-1.5 text-[13px] transition-colors disabled:opacity-60 ${
                  status === s.value
                    ? "font-semibold text-foreground"
                    : "font-medium text-muted hover:bg-hover hover:text-foreground"
                }`}
              >
                <PresenceDot status={s.value} size="sm" />
                <span className="flex-1 text-left">{s.label}</span>
                {status === s.value && <Check className="h-3.5 w-3.5 text-accent" />}
              </button>
            ))}
          </div>

          <div className="py-1.5">
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-foreground ${focusRing}`}
            >
              <User className="h-4 w-4" />
              Profile
            </Link>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-foreground ${focusRing}`}
            >
              <Bell className="h-4 w-4" />
              Notifications
            </Link>
            <Link
              href="/connect/settings"
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-foreground ${focusRing}`}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </div>

          <form action="/api/auth/logout" method="post" className="border-t border-border-soft py-1.5">
            <button
              type="submit"
              className={`flex w-full items-center gap-3 px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-crit-soft hover:text-crit ${focusRing}`}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
