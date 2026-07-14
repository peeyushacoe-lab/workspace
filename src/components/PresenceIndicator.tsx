"use client";

import { useEffect, useRef, useState } from "react";
import type { PresenceData, PresenceStatus } from "@/app/api/presence/route";

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  PresenceStatus,
  { color: string; label: string; strikethrough?: boolean }
> = {
  online:     { color: "#0f9d58", label: "Online" },
  away:       { color: "#b06000", label: "Away" },
  busy:       { color: "#ea4335", label: "Busy" },
  in_meeting: { color: "#a855f7", label: "In Meeting" },
  dnd:        { color: "#ea4335", label: "Do Not Disturb", strikethrough: true },
  offline:    { color: "#5d6579", label: "Offline" },
};

// ─── PresenceDot — pure visual, no data fetching ─────────────────────────────

export function PresenceDot({
  status,
  size = "sm",
}: {
  status: PresenceStatus | string;
  size?: "sm" | "md";
}) {
  const cfg = STATUS_CONFIG[status as PresenceStatus] ?? STATUS_CONFIG.offline;

  const diameter = size === "md" ? 10 : 8;

  return (
    <span
      title={cfg.label}
      style={{
        display: "inline-block",
        width: diameter,
        height: diameter,
        borderRadius: "50%",
        backgroundColor: cfg.color,
        flexShrink: 0,
        boxShadow: `0 0 0 1.5px rgba(0,0,0,0.5)`,
      }}
      aria-label={cfg.label}
    />
  );
}

// ─── PresenceIndicator — fetches & polls ─────────────────────────────────────

const POLL_INTERVAL_MS = 60_000; // 1 minute

export function PresenceIndicator({
  userId,
  size = "sm",
}: {
  userId: string;
  size?: "sm" | "md";
}) {
  const [presence, setPresence] = useState<PresenceData>({
    status: "offline",
    updatedAt: new Date().toISOString(),
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchPresence() {
    try {
      const res = await fetch(
        `/api/presence?userIds=${encodeURIComponent(userId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data[userId]) setPresence(data[userId] as PresenceData);
    } catch {
      // silently ignore — keep last known state
    }
  }

  useEffect(() => {
    fetchPresence();
    timerRef.current = setInterval(fetchPresence, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const cfg = STATUS_CONFIG[presence.status] ?? STATUS_CONFIG.offline;
  const tooltipLabel = presence.customMessage
    ? `${cfg.label} — ${presence.customMessage}`
    : cfg.label;

  return (
    <span title={tooltipLabel} aria-label={tooltipLabel}>
      <PresenceDot status={presence.status} size={size} />
    </span>
  );
}
