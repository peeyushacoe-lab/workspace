"use client";

import { useRef, useState, useCallback } from "react";
import { AlertTriangle, RotateCcw, Save } from "lucide-react";

/**
 * Save-conflict handling for the office editors.
 *
 * Every editor autosaves the whole document on a debounce, so two people in the
 * same file means last-write-wins: one person's work vanishes silently. The
 * save routes now reject a stale write with 409 (see src/lib/doc-conflict.ts);
 * this surfaces that rejection instead of swallowing it.
 *
 * Not a merge. It's the difference between losing work silently and being told
 * you're about to. True co-editing needs a CRDT sync server — separate project.
 */

export type ConflictState = {
  serverUpdatedAt: string;
  serverContent: string | null;
  serverTitle: string | null;
} | null;

/**
 * Tracks the `updatedAt` the client last saw and detects 409s.
 *
 * Usage in an editor:
 *   const conflict = useSaveConflict();
 *   // after loading:      conflict.setBase(doc.updatedAt)
 *   // in the save body:   body: JSON.stringify({ ...payload, ...conflict.saveFields() })
 *   // after the fetch:    if (await conflict.handleResponse(res)) return;
 */
export function useSaveConflict() {
  const baseRef = useRef<string | null>(null);
  const forceRef = useRef(false);
  const [conflict, setConflict] = useState<ConflictState>(null);

  const setBase = useCallback((updatedAt: string | Date | null | undefined) => {
    baseRef.current = updatedAt
      ? (typeof updatedAt === "string" ? updatedAt : updatedAt.toISOString())
      : null;
  }, []);

  /** Extra fields to merge into the save request body. */
  const saveFields = useCallback(() => {
    const fields: { baseUpdatedAt?: string; force?: boolean } = {};
    if (baseRef.current) fields.baseUpdatedAt = baseRef.current;
    if (forceRef.current) { fields.force = true; forceRef.current = false; }
    return fields;
  }, []);

  /**
   * Returns true when the response was a conflict and the caller should stop.
   * On success it advances the base timestamp so the next save is checked
   * against the copy we just wrote.
   */
  const handleResponse = useCallback(async (res: Response): Promise<boolean> => {
    if (res.status === 409) {
      try {
        const data = await res.json() as {
          serverUpdatedAt: string;
          serverContent: string | null;
          serverTitle: string | null;
        };
        setConflict(data);
      } catch {
        setConflict({ serverUpdatedAt: new Date().toISOString(), serverContent: null, serverTitle: null });
      }
      return true;
    }
    if (res.ok) {
      try {
        const data = await res.clone().json() as { updatedAt?: string };
        if (data?.updatedAt) baseRef.current = data.updatedAt;
      } catch { /* response wasn't JSON — leave the base as-is */ }
    }
    return false;
  }, []);

  /** User chose "overwrite": next save bypasses the check. */
  const overwrite = useCallback(() => {
    forceRef.current = true;
    setConflict(null);
  }, []);

  const dismiss = useCallback(() => setConflict(null), []);

  return { conflict, setBase, saveFields, handleResponse, overwrite, dismiss };
}

export function ConflictBanner({
  conflict,
  onReload,
  onOverwrite,
}: {
  conflict: ConflictState;
  /** Discard local changes and load the server copy. */
  onReload: () => void;
  /** Keep local changes and force them over the server copy. */
  onOverwrite: () => void;
}) {
  if (!conflict) return null;

  return (
    <div
      role="alert"
      className="absolute inset-x-0 top-0 z-50 flex flex-wrap items-center gap-3 px-4 py-2.5
                 bg-warn-soft border-b border-warn/30"
    >
      <AlertTriangle className="w-4 h-4 text-warn flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground">
          Someone else edited this while you had it open
        </p>
        <p className="text-[11px] text-muted mt-0.5">
          Your changes haven&apos;t been saved yet. Reload to take their version,
          or overwrite to keep yours.
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={onReload}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold
                     bg-surface text-foreground border border-border hover:bg-hover transition-colors"
        >
          <RotateCcw className="w-3 h-3" /> Reload theirs
        </button>
        {/* Outlined rather than a solid warn fill: there is no
            `warn-foreground` token, and text-white on bg-warn is unreadable in
            dark mode, where --warn is a light amber. */}
        <button
          onClick={onOverwrite}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold
                     text-warn bg-surface border border-warn/40 hover:bg-warn-soft transition-colors"
        >
          <Save className="w-3 h-3" /> Keep mine
        </button>
      </div>
    </div>
  );
}
