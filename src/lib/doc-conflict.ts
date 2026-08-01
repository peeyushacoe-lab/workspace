import { NextResponse } from "next/server";

/**
 * Optimistic concurrency for office-document saves.
 *
 * Every editor autosaves the WHOLE document on a debounce. With two people in
 * the same file that is last-write-wins: B's save lands on top of A's and A's
 * work disappears with no error, no warning, and no way to recover it short of
 * version history.
 *
 * This is not real-time collaboration — it does not merge concurrent edits. It
 * makes the collision *visible*: the client sends the `updatedAt` it last saw,
 * and a save built on a stale copy is rejected with 409 plus the current server
 * state, so the UI can offer reload-or-overwrite instead of destroying work.
 *
 * True co-editing needs a persistent CRDT sync server, which serverless hosting
 * can't provide — see docs/subdomains.md's sibling note and the roadmap.
 */

/** Timestamps are compared at second granularity — JSON drops sub-ms precision. */
const TOLERANCE_MS = 1000;

export type ConflictCheck =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * Compares the client's base timestamp against the row's current `updatedAt`.
 *
 * `baseUpdatedAt` absent → the caller is an older client that doesn't send it.
 * Those are allowed through unchecked, so the feature can ship without breaking
 * any client that hasn't been updated yet.
 */
export function checkConflict(opts: {
  baseUpdatedAt?: string | null;
  current: { updatedAt: Date; content?: string; title?: string };
  /** Set true to bypass the check — the user chose "overwrite anyway". */
  force?: boolean;
}): ConflictCheck {
  if (opts.force || !opts.baseUpdatedAt) return { ok: true };

  const base = new Date(opts.baseUpdatedAt).getTime();
  if (Number.isNaN(base)) return { ok: true };

  const current = opts.current.updatedAt.getTime();
  if (current - base <= TOLERANCE_MS) return { ok: true };

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: "conflict",
        message:
          "This document was changed by someone else since you opened it.",
        serverUpdatedAt: opts.current.updatedAt,
        serverContent: opts.current.content ?? null,
        serverTitle: opts.current.title ?? null,
      },
      { status: 409 },
    ),
  };
}
