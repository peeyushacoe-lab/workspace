"use client";

import { useState } from "react";
import { PresenceStatusPicker } from "@/components/PresenceStatusPicker";
import { PresenceDot } from "@/components/PresenceIndicator";
import type { PresenceStatus } from "@/app/api/presence/route";

// ─── Status reference data ────────────────────────────────────────────────────

interface StatusInfo {
  value: PresenceStatus;
  label: string;
  description: string;
  detail: string;
}

const STATUS_REFERENCE: StatusInfo[] = [
  {
    value: "online",
    label: "Online",
    description: "You're active and available.",
    detail:
      "Other team members will see your green indicator and know you can be reached immediately.",
  },
  {
    value: "away",
    label: "Away",
    description: "You've stepped away briefly.",
    detail:
      "Set this when you're away from your desk but still logged in. Messages will still reach you.",
  },
  {
    value: "busy",
    label: "Busy",
    description: "You're focused — minimal interruptions please.",
    detail:
      "Let your colleagues know you're in deep work. Notifications are still delivered.",
  },
  {
    value: "in_meeting",
    label: "In Meeting",
    description: "You're currently in a meeting.",
    detail:
      "Automatically surfaced by Sage Meet when you join a call. You can also set it manually.",
  },
  {
    value: "dnd",
    label: "Do Not Disturb",
    description: "Suppress all non-critical notifications.",
    detail:
      "Only critical security alerts will break through. All other notifications are queued until you're available again.",
  },
  {
    value: "offline",
    label: "Offline",
    description: "You appear offline to teammates.",
    detail:
      "Your presence key in Redis expires after 5 minutes of inactivity. You can also set this explicitly to go dark.",
  },
];

// ─── Mock history ─────────────────────────────────────────────────────────────

interface HistoryEntry {
  status: PresenceStatus;
  label: string;
  timestamp: string;
  message?: string;
}

const MOCK_HISTORY: HistoryEntry[] = [
  {
    status: "online",
    label: "Online",
    timestamp: "Today, 09:14 AM",
  },
  {
    status: "in_meeting",
    label: "In Meeting",
    timestamp: "Today, 08:30 AM",
    message: "Stand-up sync",
  },
  {
    status: "busy",
    label: "Busy",
    timestamp: "Yesterday, 03:45 PM",
    message: "Incident response",
  },
  {
    status: "away",
    label: "Away",
    timestamp: "Yesterday, 01:02 PM",
  },
  {
    status: "offline",
    label: "Offline",
    timestamp: "Yesterday, 08:58 AM",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PresenceSettingsPage() {
  const [activeSection, setActiveSection] = useState<"picker" | "reference" | "history">("picker");

  return (
    <div className="min-h-screen bg-[#0f1321] text-[#dfe1f6]">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6">

        {/* ── Header ── */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(0,210,255,0.08)] border border-[rgba(0,210,255,0.15)]">
              <svg className="h-4.5 w-4.5 text-[#00d2ff]" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <circle cx="10" cy="10" r="3.5" />
                <path fillRule="evenodd" d="M10 1.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM0 10a10 10 0 1 1 20 0A10 10 0 0 1 0 10Z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-[#dfe1f6] leading-tight">Presence &amp; Status</h1>
              <p className="text-sm text-[#5d6579]">Let your team know what you&apos;re up to</p>
            </div>
          </div>
        </div>

        {/* ── Set Status Card ── */}
        <section className="rounded-xl border border-[rgba(0,210,255,0.1)] bg-[#1b1f2e] p-6 mb-6">
          <h2 className="text-sm font-semibold text-[#5d6579] mb-4">
            Your Current Status
          </h2>
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="flex-1">
              <p className="text-sm text-[#9aa3b8] mb-3">
                Your presence is stored in Redis with a 5-minute TTL and refreshed automatically
                every 4 minutes while you&apos;re active. If you close the app, you&apos;ll appear
                offline after 5 minutes.
              </p>
              <PresenceStatusPicker />
            </div>
            <div className="rounded-lg bg-[#0f1321] border border-[rgba(0,210,255,0.06)] px-4 py-3 text-xs text-[#5d6579] sm:w-48 flex-shrink-0">
              <p className="font-semibold text-[#9aa3b8] mb-1">How it works</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Refreshed every 4 min</li>
                <li>Expires after 5 min idle</li>
                <li>Visible to all teammates</li>
                <li>Stored in Redis, not DB</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── Tab nav ── */}
        <div className="flex gap-1 mb-4">
          {(["reference", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveSection(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeSection === tab
                  ? "bg-[rgba(0,210,255,0.1)] text-[#00d2ff] border border-[rgba(0,210,255,0.2)]"
                  : "text-[#5d6579] hover:text-[#9aa3b8] hover:bg-[#1b1f2e]"
              }`}
            >
              {tab === "reference" ? "Status Guide" : "Recent History"}
            </button>
          ))}
        </div>

        {/* ── Status Reference ── */}
        {activeSection === "reference" && (
          <section className="rounded-xl border border-[rgba(0,210,255,0.1)] bg-[#1b1f2e] overflow-hidden">
            <div className="px-5 py-3 border-b border-[rgba(0,210,255,0.06)]">
              <h2 className="text-sm font-semibold text-[#5d6579]">
                Status Meanings
              </h2>
            </div>
            <ul className="divide-y divide-[rgba(0,210,255,0.05)]">
              {STATUS_REFERENCE.map((s) => (
                <li key={s.value} className="flex items-start gap-4 px-5 py-4">
                  <div className="mt-1 flex-shrink-0">
                    <PresenceDot status={s.value} size="md" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-[#dfe1f6]">{s.label}</span>
                      <span className="text-xs text-[#5d6579]">{s.description}</span>
                    </div>
                    <p className="text-xs text-[#9aa3b8] leading-relaxed">{s.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── History ── */}
        {activeSection === "history" && (
          <section className="rounded-xl border border-[rgba(0,210,255,0.1)] bg-[#1b1f2e] overflow-hidden">
            <div className="px-5 py-3 border-b border-[rgba(0,210,255,0.06)] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#5d6579]">
                Recent Status Changes
              </h2>
              <span className="text-xs text-[#5d6579] italic">Last 5 changes (demo)</span>
            </div>
            <ul className="divide-y divide-[rgba(0,210,255,0.05)]">
              {MOCK_HISTORY.map((entry, i) => (
                <li key={i} className="flex items-center gap-4 px-5 py-3.5">
                  <PresenceDot status={entry.status} size="md" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-[#dfe1f6]">{entry.label}</span>
                    {entry.message && (
                      <span className="ml-2 text-xs text-[#5d6579]">— {entry.message}</span>
                    )}
                  </div>
                  <time className="text-xs text-[#5d6579] flex-shrink-0">{entry.timestamp}</time>
                </li>
              ))}
            </ul>
            <div className="px-5 py-3 border-t border-[rgba(0,210,255,0.06)]">
              <p className="text-xs text-[#5d6579]">
                Full history persistence requires a separate audit log implementation. This view
                shows mocked data for UI reference.
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
