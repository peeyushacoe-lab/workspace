"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Recently-opened tracking, shared by Drive, Docs, Sheets and Slides.
 * Backed by /api/recent — see the route for why Recent can't just sort by
 * `updatedAt`.
 */

export type RecentResourceType = "file" | "doc" | "sheet" | "slide" | "note";

export type RecentItem = {
  id: string;
  type: RecentResourceType;
  name: string;
  mimeType: string | null;
  href: string;
  lastOpenedAt: string;
  updatedAt: string;
};

/**
 * Records that the current user opened a resource. Fire-and-forget: a failed
 * write must never interrupt opening a document.
 */
export function recordOpen(resourceType: RecentResourceType, resourceId: string): void {
  if (!resourceId) return;
  fetch("/api/recent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resourceType, resourceId }),
  }).catch(() => { /* best-effort */ });
}

/**
 * Calls recordOpen once per resource id. Safe to place in an editor body —
 * it won't re-fire on every render, only when the id actually changes.
 */
export function useRecordOpen(resourceType: RecentResourceType, resourceId: string | null): void {
  useEffect(() => {
    if (!resourceId) return;
    recordOpen(resourceType, resourceId);
  }, [resourceType, resourceId]);
}

/** Loads the caller's recent items, optionally scoped to certain types. */
export function useRecentItems(
  types?: RecentResourceType[],
  limit = 12,
): { items: RecentItem[]; loading: boolean; reload: () => void } {
  const [items, setItems] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Stringified so a fresh array literal from the caller doesn't retrigger.
  const typeKey = types?.join(",") ?? "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (typeKey) params.set("type", typeKey);
      const res = await fetch(`/api/recent?${params}`);
      if (res.ok) setItems((await res.json()) as RecentItem[]);
    } catch {
      // Recent is a convenience surface — fail quietly rather than erroring
      // the whole home screen.
    } finally {
      setLoading(false);
    }
  }, [typeKey, limit]);

  useEffect(() => { void load(); }, [load]);

  return { items, loading, reload: load };
}
