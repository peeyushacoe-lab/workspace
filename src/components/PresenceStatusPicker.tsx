"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { PresenceDot } from "./PresenceIndicator";
import type { PresenceData, PresenceStatus } from "@/app/api/presence/route";

// ─── Config ───────────────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 240_000; // 4 minutes

interface StatusOption {
  value: PresenceStatus;
  label: string;
  description: string;
}

const STATUS_OPTIONS: StatusOption[] = [
  { value: "online",     label: "Online",         description: "Available and active" },
  { value: "away",       label: "Away",            description: "Stepped away briefly" },
  { value: "busy",       label: "Busy",            description: "Focused — minimal interruptions" },
  { value: "in_meeting", label: "In Meeting",      description: "Currently in a meeting" },
  { value: "dnd",        label: "Do Not Disturb",  description: "Do not send notifications" },
  { value: "offline",    label: "Offline",         description: "Appear offline to others" },
];

// ─── PresenceStatusPicker ────────────────────────────────────────────────────

export function PresenceStatusPicker({
  initialPresence,
}: {
  initialPresence?: PresenceData;
}) {
  const [presence, setPresence] = useState<PresenceData>(
    initialPresence ?? { status: "online", updatedAt: new Date().toISOString() }
  );
  const [isOpen, setIsOpen] = useState(false);
  const [customMessage, setCustomMessage] = useState(
    initialPresence?.customMessage ?? ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // ── Initial fetch of own presence ──
  useEffect(() => {
    async function fetchSelf() {
      try {
        const res = await fetch("/api/presence?userIds=me-placeholder", {
          cache: "no-store",
        });
        // We can't easily pass userId here without props — the parent
        // should pass initialPresence; this is a best-effort fallback.
        if (res.ok) {
          const data = await res.json();
          const values = Object.values(data) as PresenceData[];
          if (values[0]) {
            setPresence(values[0]);
            setCustomMessage(values[0].customMessage ?? "");
          }
        }
      } catch {
        // ignore
      }
    }
    if (!initialPresence) fetchSelf();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Heartbeat ──
  const sendHeartbeat = useCallback(async () => {
    try {
      await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heartbeat: true }),
      });
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => {
      if (heartbeatRef.current !== null) clearInterval(heartbeatRef.current);
    };
  }, [sendHeartbeat]);

  // ── Close on outside click ──
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  // ── Status change ──
  async function selectStatus(status: PresenceStatus) {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/presence", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          ...(customMessage.trim() ? { customMessage: customMessage.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Failed to update status");
      }
      const { presence: updated } = (await res.json()) as { presence: PresenceData };
      setPresence(updated);
      setIsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveCustomMessage() {
    await selectStatus(presence.status);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") setIsOpen(false);
  }

  const currentOption =
    STATUS_OPTIONS.find((o) => o.value === presence.status) ?? STATUS_OPTIONS[0]!;

  return (
    <div className="relative inline-block" onKeyDown={handleKeyDown}>
      {/* ── Trigger ── */}
      <button
        ref={triggerRef}
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium text-foreground bg-surface border border-accent/[0.12] hover:border-accent/[0.3] hover:bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Presence status: ${currentOption.label}`}
      >
        <PresenceDot status={presence.status} size="sm" />
        <span>{currentOption.label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-subtle transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* ── Popover ── */}
      {isOpen && (
        <div
          ref={popoverRef}
          role="listbox"
          aria-label="Set your status"
          className="absolute left-0 top-full mt-1.5 z-50 w-72 rounded-xl border border-accent/[0.12] bg-surface shadow-2xl shadow-black/50 overflow-hidden"
        >
          <div className="px-3 pt-3 pb-1">
            <p className="text-xs font-semibold text-subtle mb-2">
              Set Status
            </p>

            {/* Custom message */}
            <input
              type="text"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="What are you working on?"
              maxLength={200}
              className="w-full rounded-md bg-surface border border-accent/[0.1] px-2.5 py-1.5 text-sm text-foreground placeholder-subtle focus:outline-none focus:border-accent/[0.35] transition-colors"
            />
          </div>

          {/* Status options */}
          <ul className="py-1">
            {STATUS_OPTIONS.map((opt) => {
              const isSelected = opt.value === presence.status;
              return (
                <li key={opt.value}>
                  <button
                    role="option"
                    aria-selected={isSelected}
                    disabled={isSaving}
                    onClick={() => selectStatus(opt.value)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors ${
                      isSelected
                        ? "bg-accent/[0.08] text-foreground"
                        : "text-muted hover:bg-accent/[0.05] hover:text-foreground"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <PresenceDot status={opt.value} size="md" />
                    <div className="flex-1 text-left">
                      <span className="font-medium">{opt.label}</span>
                      <span className="block text-xs text-subtle">
                        {opt.description}
                      </span>
                    </div>
                    {isSelected && (
                      <Check className="h-4 w-4 text-accent flex-shrink-0" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Save custom message button */}
          {customMessage.trim() && customMessage !== presence.customMessage && (
            <div className="px-3 pb-3 pt-1 border-t border-accent/[0.06]">
              <button
                onClick={saveCustomMessage}
                disabled={isSaving}
                className="w-full rounded-md bg-accent/10 border border-accent/[0.2] px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? "Saving…" : "Save message"}
              </button>
            </div>
          )}

          {error && (
            <p className="px-3 pb-2 text-xs text-crit">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
