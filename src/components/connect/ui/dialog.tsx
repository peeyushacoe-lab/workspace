"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

/**
 * The centered-modal shell — backdrop, card, header with title and close.
 *
 * ChatView.tsx hand-rolls this shape 5 separate times (NewChannelModal, the
 * add-members modal, manage-members, new-group-DM, and the AI summarize
 * modal), each one typing out `fixed inset-0 bg-black/60 flex items-center
 * justify-center z-50` and `bg-surface rounded-2xl shadow-xl p-6 w-full
 * max-w-md mx-4 border border-border` independently — close enough to be
 * clearly the same idea, different enough (p-5 vs p-6, shadow-xl vs
 * shadow-2xl) that they'd already drifted. This is that shape, once.
 *
 * Two behaviours are added here that most of the 5 originals didn't have:
 * Escape-to-close and backdrop-click-to-close. Both are standard modal
 * affordances, and every migrated call site still has its own explicit close
 * button, so this isn't introducing a new way to lose unsaved input without
 * also keeping the old ones — it's closing a gap, not changing the contract.
 */

export type DialogSize = "sm" | "md" | "lg";

const SIZE: Record<DialogSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

export function Dialog({
  title,
  onClose,
  size = "md",
  footer,
  children,
}: {
  /** A plain string covers most cases; a node lets a title carry its own icon
   *  (e.g. the AI summary modal's Sparkles glyph) without a second prop. */
  title: React.ReactNode;
  onClose: () => void;
  size?: DialogSize;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`mx-4 w-full ${SIZE[size]} rounded-2xl border border-border bg-surface p-6 shadow-xl`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
        </div>
        {children}
        {footer && <div className="mt-6 flex gap-3">{footer}</div>}
      </div>
    </div>
  );
}
