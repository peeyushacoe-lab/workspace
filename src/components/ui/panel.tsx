"use client";

import { X } from "lucide-react";
import { IconButton } from "./icon-button";

/**
 * A docked side panel — header with a title and close control, scrollable
 * body. The shape ChatView's ThreadPanel, PinPanel and ChannelInfoPanel each
 * already hand-roll independently; this is the same shape available to new
 * surfaces (starting with the meeting participants list) without a fourth
 * copy. Not retrofitted onto ChatView's existing panels for the same reason
 * IconButton wasn't retrofitted onto its 55 call sites — that surface has
 * broken twice this project from smaller edits than a structural swap.
 */
export function Panel({
  title,
  onClose,
  children,
  width = "w-72",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <div className={`flex h-full ${width} flex-shrink-0 flex-col border-l border-border-soft bg-surface`}>
      <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-border-soft px-3">
        <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
        <IconButton icon={X} label={`Close ${title.toLowerCase()}`} size="sm" onClick={onClose} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </div>
  );
}
