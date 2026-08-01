"use client";

import { useMemo, useState } from "react";
import {
  Plus, LayoutGrid, List, ArrowDownAZ, Clock, Users, MoreVertical,
  Trash2, ExternalLink, Star, Loader2, FolderOpen,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

/**
 * Home screen for a document app — the docs.google.com layout.
 *
 * Three bands, in Google's order:
 *   1. a template gallery ("Start a new document") with page-shaped previews,
 *   2. a controls row — ownership filter, sort, grid/list toggle,
 *   3. the file list, grid or list.
 *
 * Shared by Docs, Sheets and Slides because the only real differences are the
 * templates, the accent used in previews, and the noun. Three near-identical
 * screens drift apart the moment one is touched.
 */

export type HomeTemplate = {
  id: string;
  label: string;
  /** Second line, e.g. a style name — matches Google's "Resume / Serif". */
  sublabel?: string;
  /** Simple page preview drawn from these lines. */
  preview?: "blank" | "doc" | "table" | "deck";
};

export type HomeItem = {
  id: string;
  title: string;
  updatedAt: string;
  isOwner?: boolean;
  sharedRole?: string | null;
  pinned?: boolean;
};

type Ownership = "anyone" | "me" | "shared";
type SortKey = "recent" | "name";

/** Miniature page thumbnails. Line art rather than a screenshot — cheap, and
 *  it never goes stale the way a cached render would. */
function TemplatePreview({ kind, accent }: { kind: NonNullable<HomeTemplate["preview"]>; accent: string }) {
  const line = (w: string, y: number, dim = false) => (
    <div
      key={y}
      className="absolute h-[3px] rounded-full"
      style={{ width: w, top: y, left: "14%", background: dim ? "var(--border)" : "var(--border-strong)" }}
    />
  );

  if (kind === "blank") {
    return (
      <div className="relative h-full w-full flex items-center justify-center">
        <Plus className="h-6 w-6" style={{ color: accent }} />
      </div>
    );
  }
  if (kind === "table") {
    return (
      <div className="relative h-full w-full p-3">
        <div className="grid grid-cols-4 gap-[2px] h-full">
          {Array.from({ length: 24 }, (_, i) => (
            <div
              key={i}
              className="rounded-[1px]"
              style={{ background: i < 4 ? accent : "var(--surface-sunken)", opacity: i < 4 ? 0.35 : 1 }}
            />
          ))}
        </div>
      </div>
    );
  }
  if (kind === "deck") {
    return (
      <div className="relative h-full w-full p-3 flex flex-col gap-1.5">
        <div className="h-[6px] w-2/3 rounded-full" style={{ background: accent, opacity: 0.5 }} />
        <div className="flex-1 rounded-[2px]" style={{ background: "var(--surface-sunken)" }} />
      </div>
    );
  }
  return (
    <div className="relative h-full w-full">
      <div className="absolute h-[5px] rounded-full" style={{ width: "48%", top: 16, left: "14%", background: accent, opacity: 0.55 }} />
      {[32, 42, 52, 62, 72].map((y, i) => line(i === 4 ? "44%" : "72%", y, i > 2))}
    </div>
  );
}

export function AppHome({
  /** "document" | "spreadsheet" | "presentation" — used in copy. */
  noun,
  templates,
  items,
  loading,
  creating,
  accent = "var(--accent)",
  onCreate,
  onOpen,
  onDelete,
  emptyIcon: EmptyIcon = FolderOpen,
}: {
  noun: string;
  templates: HomeTemplate[];
  items: HomeItem[];
  loading: boolean;
  creating?: boolean;
  accent?: string;
  onCreate: (templateId: string) => void;
  onOpen: (id: string) => void;
  onDelete?: (id: string) => void;
  emptyIcon?: React.ElementType;
}) {
  const [ownership, setOwnership] = useState<Ownership>("anyone");
  const [sort, setSort] = useState<SortKey>("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const visible = useMemo(() => {
    const filtered = items.filter(i =>
      ownership === "anyone" ? true : ownership === "me" ? i.isOwner !== false : i.isOwner === false,
    );
    return [...filtered].sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title)
        : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [items, ownership, sort]);

  return (
    <div className="min-h-full" onClick={() => setMenuFor(null)}>
      {/* ── 1. Template gallery ── */}
      <section className="border-b border-border-soft bg-surface-sunken/40">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[13px] font-medium text-foreground">Start a new {noun}</h2>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-1">
            {templates.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => onCreate(tpl.id)}
                disabled={creating}
                className="group flex-shrink-0 w-[104px] text-left disabled:opacity-50"
              >
                <div
                  className="h-[134px] w-full rounded-md bg-surface border border-border overflow-hidden
                             group-hover:border-accent transition-colors"
                >
                  <TemplatePreview kind={tpl.preview ?? "doc"} accent={accent} />
                </div>
                <p className="mt-1.5 text-[12px] font-medium text-foreground truncate">{tpl.label}</p>
                {tpl.sublabel && (
                  <p className="text-[11px] text-subtle truncate">{tpl.sublabel}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── 2. Controls ── */}
      <div className="max-w-6xl mx-auto px-6 pt-5">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-[13px] font-medium text-foreground mr-auto">
            Recent {noun}s
          </h2>

          <select
            value={ownership}
            onChange={e => setOwnership(e.target.value as Ownership)}
            aria-label="Filter by owner"
            className="h-8 px-2 rounded-lg bg-transparent border border-transparent hover:bg-hover
                       text-[12px] text-muted focus:outline-none focus:border-border cursor-pointer"
          >
            <option value="anyone">Owned by anyone</option>
            <option value="me">Owned by me</option>
            <option value="shared">Shared with me</option>
          </select>

          <button
            onClick={() => setSort(s => (s === "recent" ? "name" : "recent"))}
            title={sort === "recent" ? "Sorted by last modified" : "Sorted by name"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-hover transition-colors"
          >
            {sort === "recent" ? <Clock className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
          </button>

          <button
            onClick={() => setView(v => (v === "grid" ? "list" : "grid"))}
            title={view === "grid" ? "Switch to list view" : "Switch to grid view"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-hover transition-colors"
          >
            {view === "grid" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* ── 3. Files ── */}
      <div className="max-w-6xl mx-auto px-6 py-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-subtle" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <EmptyIcon className="h-8 w-8 text-subtle mb-3" />
            <p className="text-sm font-medium text-foreground">
              {items.length === 0 ? `No ${noun}s yet` : `Nothing matches that filter`}
            </p>
            <p className="text-xs text-muted mt-1">
              {items.length === 0
                ? `Pick a template above to create your first ${noun}.`
                : "Try “Owned by anyone”."}
            </p>
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {visible.map(item => (
              <div
                key={item.id}
                onClick={() => onOpen(item.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(item.id); } }}
                className="group rounded-lg border border-border bg-surface overflow-hidden cursor-pointer
                           hover:border-accent/40 hover:shadow-sm transition-all focus:outline-none
                           focus:ring-2 focus:ring-accent/30"
              >
                {/* Page-shaped preview, matching Google's card proportions */}
                <div className="h-[132px] border-b border-border-soft bg-surface-sunken/50 overflow-hidden">
                  <TemplatePreview kind="doc" accent={accent} />
                </div>
                <div className="px-3 py-2">
                  <p className="text-[13px] font-medium text-foreground truncate">
                    {item.title || "Untitled"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {item.isOwner === false
                      ? <Users className="h-3 w-3 text-subtle flex-shrink-0" />
                      : <span className="h-3 w-3 rounded-[2px] flex-shrink-0" style={{ background: accent, opacity: 0.5 }} />}
                    <span className="text-[11px] text-subtle truncate">
                      {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}
                    </span>
                    {item.pinned && <Star className="h-3 w-3 text-warn flex-shrink-0 ml-auto" />}
                    {onDelete && (
                      <div className="relative ml-auto" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setMenuFor(m => (m === item.id ? null : item.id))}
                          aria-label={`Actions for ${item.title || "Untitled"}`}
                          className="flex h-6 w-6 items-center justify-center rounded text-subtle
                                     opacity-0 group-hover:opacity-100 focus:opacity-100
                                     hover:bg-hover hover:text-foreground transition-all"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                        {menuFor === item.id && (
                          <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-border
                                          bg-surface shadow-pop py-1 z-20">
                            <button
                              onClick={() => { setMenuFor(null); onOpen(item.id); }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-foreground hover:bg-hover"
                            >
                              <ExternalLink className="h-3.5 w-3.5" /> Open
                            </button>
                            <button
                              onClick={() => { setMenuFor(null); onDelete(item.id); }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-crit hover:bg-crit-soft"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Remove
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border-soft">
            {visible.map(item => (
              <li key={item.id}>
                <div
                  onClick={() => onOpen(item.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === "Enter") onOpen(item.id); }}
                  className="group flex items-center gap-3 px-2 py-2.5 rounded-lg cursor-pointer
                             hover:bg-hover transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  <span className="h-4 w-4 rounded-[3px] flex-shrink-0" style={{ background: accent, opacity: 0.5 }} />
                  <span className="text-[13px] text-foreground truncate flex-1">
                    {item.title || "Untitled"}
                  </span>
                  {item.isOwner === false && <Users className="h-3.5 w-3.5 text-subtle flex-shrink-0" />}
                  <span className="text-[11px] text-subtle flex-shrink-0 hidden sm:block">
                    {format(new Date(item.updatedAt), "d MMM yyyy")}
                  </span>
                  {onDelete && (
                    <button
                      onClick={e => { e.stopPropagation(); onDelete(item.id); }}
                      aria-label={`Remove ${item.title || "Untitled"}`}
                      className="flex h-7 w-7 items-center justify-center rounded text-subtle
                                 opacity-0 group-hover:opacity-100 focus:opacity-100
                                 hover:bg-crit-soft hover:text-crit transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
