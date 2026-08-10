"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

/**
 * A relative timestamp that doesn't break hydration.
 *
 * `formatDistanceToNow(...)` reads the clock. Rendered directly in a component,
 * it runs once on the server and again on the client — and between those two
 * moments the clock moved. The server ships "2 minutes ago", the browser
 * computes "3 minutes ago", the text doesn't match, and React throws
 * **error #418** (hydration text mismatch). It then discards the server HTML
 * for that subtree and re-renders it on the client, which is why pages with
 * lots of timestamps flash and feel slow even when nothing looks wrong.
 *
 * The fix is to render something *deterministic* during SSR and the first
 * client paint, then swap to the live relative string in an effect — effects
 * only run on the client, so there is nothing for React to compare.
 *
 * The placeholder is an absolute time rather than a blank: a timestamp that
 * appears out of nowhere a frame later is worse than one that starts precise
 * and then relaxes into "3 minutes ago".
 *
 * ── The `title` attribute is the same trap ────────────────────────────────────
 * The original fix here made the *text* deterministic but left
 * `title={parsed.toLocaleString()}`, which reads the **host** locale — and the
 * Node server's locale is not the browser's. The server emitted
 * "04/08/2026, 01:15:16" while the browser computed "8/4/2026, 1:15:16 AM", so
 * React still reported #418 and still threw away the subtree; the mismatch had
 * just moved from the children to an attribute. Home made it obvious by
 * rendering a dozen of these at once.
 *
 * So the tooltip is now handled exactly like the label: a deterministic UTC
 * string for SSR and first paint, swapped to the viewer's own locale in the
 * effect. Anything that formats with the ambient locale or the ambient timezone
 * has to be set in an effect, never during render.
 */
export function RelativeTime({
  date,
  className,
  /** Ticks the label so "just now" doesn't sit there for an hour. */
  refreshMs = 60_000,
}: {
  date: string | Date;
  className?: string;
  refreshMs?: number;
}) {
  const iso = typeof date === "string" ? date : date.toISOString();
  const parsed = new Date(iso);
  const valid = !Number.isNaN(parsed.getTime());

  // Deterministic on both sides of hydration: derived only from the input.
  const absolute = valid
    ? parsed.toISOString().slice(0, 16).replace("T", " ")
    : "";

  const [label, setLabel] = useState(absolute);
  // Seeded with the same deterministic string as the label, then localised
  // client-side. Must never be `toLocaleString()` during render.
  const [title, setTitle] = useState(absolute ? `${absolute} UTC` : "");

  useEffect(() => {
    if (!valid) return;
    setTitle(parsed.toLocaleString());
    const update = () => setLabel(formatDistanceToNow(parsed, { addSuffix: true }));
    update();
    const t = setInterval(update, refreshMs);
    return () => clearInterval(t);
    // `iso` rather than `parsed` — a new Date object every render would restart
    // the interval on every parent re-render.
  }, [iso, refreshMs, valid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!valid) return null;

  return (
    <time dateTime={iso} title={title} className={className}>
      {label}
    </time>
  );
}
