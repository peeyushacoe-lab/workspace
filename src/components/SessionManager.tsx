"use client";

import { useEffect, useState, useCallback } from "react";

type Session = {
  id: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  lastSeenAt: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function isMobileDevice(deviceInfo: string | null): boolean {
  if (!deviceInfo) return false;
  return /Mobile|iPhone|Android|iPad/i.test(deviceInfo);
}

export function SessionManager() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/sessions");
      if (!res.ok) throw new Error("Failed to load sessions");
      const data = await res.json();
      setSessions(data.sessions);
    } catch {
      setError("Could not load active sessions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  async function revokeSession(id: string) {
    setRevoking(id);
    try {
      const res = await fetch(`/api/auth/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      setError("Failed to revoke session.");
    } finally {
      setRevoking(null);
    }
  }

  async function revokeAll() {
    setConfirmRevokeAll(false);
    setRevoking("all");
    try {
      const res = await fetch("/api/auth/sessions/revoke-all", { method: "POST" });
      if (!res.ok) throw new Error();
      setSessions((prev) => prev.filter((s) => s.isCurrent));
    } catch {
      setError("Failed to revoke other sessions.");
    } finally {
      setRevoking(null);
    }
  }

  const otherSessionCount = sessions.filter((s) => !s.isCurrent).length;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-[#f1f3f4] animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#5f6368]">
          {sessions.length} active session{sessions.length !== 1 ? "s" : ""}
        </p>
        {otherSessionCount > 0 && (
          <button
            onClick={() => setConfirmRevokeAll(true)}
            disabled={revoking === "all"}
            className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50 transition-colors"
          >
            {revoking === "all" ? "Revoking…" : `Revoke all other sessions (${otherSessionCount})`}
          </button>
        )}
      </div>

      {confirmRevokeAll && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="font-medium text-red-600 mb-3">
            Revoke {otherSessionCount} other session{otherSessionCount !== 1 ? "s" : ""}? You will remain logged in on this device.
          </p>
          <div className="flex gap-3">
            <button
              onClick={revokeAll}
              className="bg-[#1a56db] text-white hover:bg-[#f8fafd] rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
            >
              Yes, revoke all
            </button>
            <button
              onClick={() => setConfirmRevokeAll(false)}
              className="bg-[#f1f3f4] text-[#5f6368] hover:bg-[#303444] border border-[#e8eaed] rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {sessions.map((session) => {
          const mobile = isMobileDevice(session.deviceInfo);
          return (
            <div
              key={session.id}
              className="bg-[#f1f3f4] border border-[#e8eaed] rounded-xl px-4 py-3 flex items-center justify-between"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5" aria-hidden>
                  {mobile ? "📱" : "🖥️"}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[#202124]">
                      {session.deviceInfo ?? "Unknown device"}
                    </p>
                    {session.isCurrent && (
                      <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full font-medium">
                        Current session
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#5f6368] mt-0.5">
                    {session.ipAddress ?? "Unknown IP"} · Last seen {timeAgo(session.lastSeenAt)}
                  </p>
                  <p className="text-xs text-[#5f6368] mt-0.5">
                    Started {new Date(session.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>

              {!session.isCurrent && (
                <button
                  onClick={() => revokeSession(session.id)}
                  disabled={revoking === session.id}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs px-2 py-1 rounded-md transition-colors disabled:opacity-50 ml-4 flex-shrink-0"
                >
                  {revoking === session.id ? "Revoking…" : "Revoke"}
                </button>
              )}
            </div>
          );
        })}

        {sessions.length === 0 && (
          <div className="p-8 text-center text-sm text-[#5f6368]">
            No active sessions found.
          </div>
        )}
      </div>
    </div>
  );
}
