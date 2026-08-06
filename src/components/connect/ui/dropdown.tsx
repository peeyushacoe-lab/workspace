"use client";

import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * The popover-menu shell: click-outside-to-close, Escape-to-close, `role="menu"`.
 *
 * Reimplemented independently in ConnectProfileMenu.tsx, ChatView's header
 * overflow menu, ChatView's message context menu, and ChannelTabs.tsx's "pin a
 * tab" picker — four copies of the same ~10-line effect, one of which
 * (ChannelTabs) only wires the Escape half and explicitly comments that
 * click-outside is the caller's problem. This is that effect, once, plus the
 * `role="menu"` container styling `MenuItem` rows expect.
 *
 * Deliberately unopinionated about position: some call sites anchor via a
 * `relative` wrapper + `absolute` classes (ConnectProfileMenu), others via
 * viewport `position: fixed` coordinates computed from a click event
 * (ChatView's message menu). Both pass through `className`/`style` rather
 * than this component owning placement — the one thing that's genuinely
 * different per call site shouldn't be forced into one shape.
 */
export function Menu({
  onClose,
  className = "",
  style,
  /** For a viewport-`position: fixed` menu anchored to a click point (e.g. a
   *  message context menu) rather than a `relative` trigger — without this,
   *  scrolling the list leaves the menu floating over content it no longer
   *  belongs to. Off by default since most call sites anchor via a `relative`
   *  wrapper that scrolls together with its trigger. */
  closeOnScroll = false,
  children,
}: {
  onClose: () => void;
  className?: string;
  style?: React.CSSProperties;
  closeOnScroll?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    if (closeOnScroll) window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
      if (closeOnScroll) window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose, closeOnScroll]);

  return (
    <div
      ref={ref}
      role="menu"
      style={style}
      className={`z-50 rounded-xl border border-border bg-surface py-1.5 shadow-pop ${className}`}
    >
      {children}
    </div>
  );
}

export function MenuItem({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  destructive = false,
  /** Overrides the icon's colour — e.g. a document-kind picker where the icon
   *  carries the target app's identity (green Sheets, orange Slides) rather
   *  than following the row's own hover state. CSS colour value. */
  iconColor,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  iconColor?: string;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 px-3.5 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40 ${
        destructive ? "text-muted hover:bg-crit-soft hover:text-crit" : "text-muted hover:bg-hover hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" style={iconColor ? { color: iconColor } : undefined} />
      {label}
    </button>
  );
}
