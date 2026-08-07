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

  useEffect(() => {
    if (!valid) return;
    const update = () => setLabel(formatDistanceToNow(parsed, { addSuffix: true }));
    update();
    const t = setInterval(update, refreshMs);
    return () => clearInterval(t);
    // `iso` rather than `parsed` — a new Date object every render would restart
    // the interval on every parent re-render.
  }, [iso, refreshMs, valid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!valid) return null;

  return (
    <time dateTime={iso} title={parsed.toLocaleString()} className={className}>
      {label}
    </time>
  );
}
