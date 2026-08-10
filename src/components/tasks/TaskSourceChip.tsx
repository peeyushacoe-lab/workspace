"use client";

import { Mail, MessageSquare, Video, FileText, ArrowUpRight, type LucideIcon } from "lucide-react";
import { AppLink } from "@/components/AppLink";
import { resolveTaskSource, taskSourceLabel } from "@/lib/task-source";

/**
 * "From mail" / "From chat" chip on a task, linking back to where it came from.
 *
 * This is the return leg of the round trip: creating a task from an email was
 * always possible in the data model, but with nothing rendering `sourceType` the
 * link was one-way and the columns were dead weight. The chip closes it.
 *
 * Renders nothing when there is no recognised source, and renders plain
 * (unclickable) text when the source can't be linked — currently meetings, whose
 * `sourceId` is a title string rather than an id. See lib/task-source.ts.
 */

const ICONS: Record<string, LucideIcon> = {
  mail: Mail,
  chat: MessageSquare,
  meeting: Video,
  doc: FileText,
};

export function TaskSourceChip({
  sourceType,
  sourceId,
  sourceTitle,
  /** `xs` for dense kanban cards and list rows, `sm` for the task drawer. */
  size = "xs",
}: {
  sourceType?: string | null;
  sourceId?: string | null;
  sourceTitle?: string | null;
  size?: "xs" | "sm";
}) {
  const source = resolveTaskSource(sourceType, sourceId);
  if (!source) return null;

  const Icon = ICONS[source.icon] ?? FileText;
  const text = taskSourceLabel(source, sourceTitle);

  const textSize = size === "sm" ? "text-[11px]" : "text-[9px]";
  const iconSize = size === "sm" ? "w-3 h-3" : "w-2.5 h-2.5";
  const base = `inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium ${textSize} max-w-full`;

  if (!source.href) {
    return (
      <span className={`${base} border-border bg-surface-sunken text-subtle`} title={text}>
        <Icon className={`${iconSize} flex-shrink-0`} />
        <span className="truncate">{text}</span>
      </span>
    );
  }

  return (
    <AppLink
      href={source.href}
      // The chip sits inside clickable task cards and rows — without this, opening
      // the source would also fire the card's own "open task" handler behind it.
      onClick={(e) => e.stopPropagation()}
      className={`${base} group border-accent/25 bg-accent-soft text-accent-strong transition-colors hover:border-accent/50`}
      title={`${text} — open`}
    >
      <Icon className={`${iconSize} flex-shrink-0`} />
      <span className="truncate">{text}</span>
      <ArrowUpRight className={`${iconSize} flex-shrink-0 opacity-60 transition-opacity group-hover:opacity-100`} />
    </AppLink>
  );
}
