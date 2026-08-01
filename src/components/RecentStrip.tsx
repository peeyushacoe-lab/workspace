"use client";

import { Clock, FileText, FileSpreadsheet, Presentation, File as FileIcon, StickyNote } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useRecentItems, type RecentResourceType } from "@/lib/use-recent";
import { useAppNavigate } from "@/components/AppLink";

/**
 * Horizontal "Recent" row for an app's home screen, mirroring the strip at the
 * top of docs.google.com / Drive.
 *
 * Ordered by when the current user last *opened* each item — see
 * /api/recent for why modified-time is the wrong signal.
 *
 * Renders nothing when there's no history, so a new workspace doesn't show an
 * empty shelf.
 */

const ICONS: Record<RecentResourceType, React.ElementType> = {
  doc: FileText,
  sheet: FileSpreadsheet,
  slide: Presentation,
  note: StickyNote,
  file: FileIcon,
};

export function RecentStrip({
  types,
  limit = 6,
  heading = "Recent",
}: {
  types?: RecentResourceType[];
  limit?: number;
  heading?: string;
}) {
  const { items, loading } = useRecentItems(types, limit);
  const appNavigate = useAppNavigate();

  // Deliberately no skeleton: the strip sits above the main list, and a
  // placeholder that vanishes would shift the grid under the user's cursor.
  if (loading || items.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="flex items-center gap-1.5 mb-2">
        <Clock className="w-3.5 h-3.5 text-subtle" />
        <h2 className="text-xs font-medium text-muted">{heading}</h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {items.map(item => {
          const Icon = ICONS[item.type] ?? FileIcon;
          return (
            <button
              key={`${item.type}:${item.id}`}
              onClick={() => appNavigate(item.href)}
              title={item.name}
              className="group flex-shrink-0 w-40 text-left bg-surface border border-border rounded-xl p-3
                         hover:border-accent/30 hover:shadow-sm transition-all"
            >
              <div className="w-full h-14 rounded-lg bg-surface-sunken flex items-center justify-center mb-2
                              group-hover:bg-accent-soft transition-colors">
                <Icon className="w-5 h-5 text-accent" />
              </div>
              <p className="text-xs font-medium text-foreground truncate">{item.name}</p>
              <p className="text-[10px] text-subtle mt-0.5">
                {formatDistanceToNow(new Date(item.lastOpenedAt), { addSuffix: true })}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
