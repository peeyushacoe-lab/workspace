"use client";

import { useState, useId } from "react";

/**
 * Nothing like this exists in the codebase today — every hover hint is a
 * native `title=""` attribute (browser-styled, delayed, inconsistent across
 * browsers) rather than an app-styled tooltip. This is a small, deliberately
 * unambitious wrapper: hover/focus shows a floating Atrium-styled label above
 * the child, no portal, no collision detection. For anything anchored near a
 * viewport edge, prefer a positioned `Menu` instead of stretching this.
 */
export function Tooltip({
  label,
  children,
  side = "top",
}: {
  label: string;
  children: React.ReactElement;
  side?: "top" | "bottom";
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  const positionCls =
    side === "top"
      ? "bottom-full left-1/2 -translate-x-1/2 mb-1.5"
      : "top-full left-1/2 -translate-x-1/2 mt-1.5";

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          id={id}
          role="tooltip"
          className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-medium text-foreground shadow-pop ${positionCls}`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
