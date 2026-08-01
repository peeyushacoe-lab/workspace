"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Live co-authoring presence for a Note-backed document.
 *
 * Heartbeats the caller's location to /api/documents/[id]/presence and returns
 * the other people currently in the document. Polling (not WebSockets) because
 * production runs serverless on Vercel with no Socket.IO server — see the note
 * in the presence route for the full reasoning.
 */

export type DocPeer = {
  userId: string;
  name: string;
  color: string;
  /** Sheets: focused cell ("B7"). Slides: slide id. */
  location?: string;
  /** Sheets: active sheet-tab id, so cursors only draw on the matching tab. */
  scope?: string;
  updatedAt: number;
};

const HEARTBEAT_MS = 5_000;

export function useDocPresence(
  docId: string | null,
  location?: string,
  scope?: string,
): DocPeer[] {
  const [peers, setPeers] = useState<DocPeer[]>([]);

  // Held in refs so a cursor move doesn't tear down and rebuild the interval —
  // the beat reads the latest values when it fires.
  const locationRef = useRef(location);
  const scopeRef = useRef(scope);
  locationRef.current = location;
  scopeRef.current = scope;

  useEffect(() => {
    if (!docId) { setPeers([]); return; }

    let cancelled = false;

    const beat = async () => {
      try {
        const res = await fetch(`/api/documents/${docId}/presence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location: locationRef.current,
            scope: scopeRef.current,
          }),
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { peers?: DocPeer[] };
        if (!cancelled) setPeers(data.peers ?? []);
      } catch {
        // Offline or Redis down — keep the last known peers rather than
        // flickering the avatar stack empty on a single failed beat.
      }
    };

    void beat();
    const timer = setInterval(() => void beat(), HEARTBEAT_MS);

    // Best-effort departure so collaborators see you leave immediately instead
    // of waiting out the TTL. keepalive lets it survive page unload.
    const leave = () => {
      try {
        fetch(`/api/documents/${docId}/presence`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leaving: true }),
          keepalive: true,
        }).catch(() => {});
      } catch { /* ignore */ }
    };
    window.addEventListener("beforeunload", leave);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("beforeunload", leave);
      leave();
    };
  }, [docId]);

  return peers;
}

/** Initials for the presence avatar stack, e.g. "Ada Lovelace" → "AL". */
export function peerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
