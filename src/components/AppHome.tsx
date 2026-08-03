"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, LayoutGrid, List, ArrowDownAZ, Clock, Users, MoreVertical,
  Trash2, ExternalLink, Star, FolderOpen, Search, X,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

/**
 * Home screen for a document app.
 *
 * The first version of this screen was a faithful copy of docs.google.com:
 * grey line-art template tiles, 5px thumbnail text, three bands of neutral.
 * Faithful, and lifeless — Google's home screen is a ten-year-old utility page,
 * so cloning it inherited its dullness.
 *
 * This is the same information with a spine:
 *   1. an editorial header — app name, a greeting, and the search field,
 *   2. saturated colour-blocked template covers, big enough to read as art,
 *   3. sticky controls,
 *   4. file cards whose thumbnails look like actual paper, at a legible size.
 *
 * Colour discipline: every value is derived from a token via color-mix, and
 * each app supplies one `accent` (Docs indigo, Sheets green, Slides amber).
 * Covers alternate that accent with violet — the one hue Atrium keeps free of
 * status meaning — so a gallery reads as bold without becoming a rainbow.
 *
 * Shared by Docs, Sheets and Slides. Three near-identical screens drift apart
 * the moment one is touched.
 */

export type HomeTemplate = {
  id: string;
  label: string;
  /** Second line, e.g. a style name — matches Google's "Resume / Serif". */
  sublabel?: string;
  /** Which cover composition to draw. */
  preview?: "blank" | "doc" | "table" | "deck";
};

export type HomeItem = {
  id: string;
  title: string;
  updatedAt: string;
  isOwner?: boolean;
  sharedRole?: string | null;
  pinned?: boolean;
  /**
   * Real content for the card thumbnail. Each app supplies whichever shape it
   * has — a few lines of prose, or a small grid of cells. Rendering the actual
   * content is what makes the grid scannable; identical placeholder pages make
   * every card look the same.
   */
  previewLines?: string[];
  previewCells?: string[][];
};

type Ownership = "anyone" | "me" | "shared";
type SortKey = "recent" | "name";

/** color-mix against a base, so every colour still traces back to a token. */
const mix = (colour: string, pct: number, base = "var(--surface)") =>
  `color-mix(in srgb, ${colour} ${pct}%, ${base})`;

/* ──────────────────────────────────────────────────────────────────────────
   Template covers

   Flat geometric compositions rather than line art or a screenshot: bold at
   150px, cheap to render, and they never go stale the way a cached render of
   the template would.
   ────────────────────────────────────────────────────────────────────────── */

function TemplateCover({
  kind, hue, accent, variant,
}: {
  kind: NonNullable<HomeTemplate["preview"]>;
  hue: string;
  accent: string;
  /** Rotates the "doc" composition so a gallery of five documents doesn't
   *  render as five identical tiles. */
  variant: number;
}) {
  if (kind === "blank") {
    // The one tile that is a verb rather than a thing — solid accent, so it
    // anchors the row and the eye lands on "start" first.
    return (
      <div
        className="flex h-full w-full items-center justify-center"
        style={{ background: accent }}
      >
        <Plus className="h-8 w-8" style={{ color: "var(--accent-foreground)" }} />
      </div>
    );
  }

  if (kind === "table") {
    return (
      <div className="h-full w-full" style={{ background: "var(--surface)" }}>
        <div className="h-[22%] w-full" style={{ background: hue }} />
        <div className="grid grid-cols-4 gap-px p-2" style={{ background: "transparent" }}>
          {Array.from({ length: 16 }, (_, i) => (
            <div
              key={i}
              className="h-[9px] rounded-[1px]"
              style={{
                background: i === 4 || i === 9 ? mix(hue, 45) : mix("var(--border)", 55),
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (kind === "deck") {
    // A slide sitting on a coloured stage — instantly reads as "presentation".
    return (
      <div className="flex h-full w-full items-center justify-center p-3" style={{ background: hue }}>
        <div
          className="flex h-full w-full flex-col gap-1.5 rounded-[3px] p-2.5"
          style={{ background: "var(--surface)" }}
        >
          <div className="h-[7px] w-3/4 rounded-full" style={{ background: hue }} />
          <div className="h-[4px] w-1/2 rounded-full" style={{ background: mix("var(--border-strong)", 70) }} />
          <div className="mt-auto h-[38%] w-full rounded-[2px]" style={{ background: mix(hue, 18) }} />
        </div>
      </div>
    );
  }

  // "doc" — three layouts drawn from the shapes real documents actually take:
  // a masthead report, a sidebar CV, a centred letter.
  const bars = (widths: string[], pad: string) => (
    <div className={`flex flex-col gap-[5px] ${pad}`}>
      {widths.map((w, i) => (
        <div
          key={i}
          className="h-[3px] rounded-full"
          style={{ width: w, background: mix("var(--border-strong)", i === widths.length - 1 ? 45 : 80) }}
        />
      ))}
    </div>
  );

  if (variant % 3 === 1) {
    // Sidebar CV
    return (
      <div className="flex h-full w-full" style={{ background: "var(--surface)" }}>
        <div className="h-full w-[34%] flex-shrink-0" style={{ background: hue }} />
        <div className="min-w-0 flex-1 pt-4">
          <div className="mb-2 ml-2 h-[6px] w-[60%] rounded-full" style={{ background: mix(hue, 55) }} />
          {bars(["86%", "72%", "80%", "50%"], "px-2")}
        </div>
      </div>
    );
  }

  if (variant % 3 === 2) {
    // Centred letter
    return (
      <div className="flex h-full w-full flex-col items-center pt-6" style={{ background: mix(hue, 9) }}>
        <div className="h-[7px] w-[46%] rounded-full" style={{ background: hue }} />
        <div className="mt-2 h-px w-[62%]" style={{ background: mix("var(--border-strong)", 80) }} />
        <div className="mt-3 w-full">{bars(["78%", "88%", "70%", "44%"], "px-3")}</div>
      </div>
    );
  }

  // Masthead report
  return (
    <div className="h-full w-full" style={{ background: mix(hue, 12) }}>
      <div className="h-[38%] w-full" style={{ background: hue }} />
      <div className="pt-3">{bars(["82%", "94%", "88%", "60%"], "px-3")}</div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   File thumbnails

   A sheet of paper inset on a sunken tray, the way a real document sits on a
   desk. The previous version ran content edge-to-edge at 5px, which rendered
   as grey noise — the point of a thumbnail is that you can tell two documents
   apart without reading the title.
   ────────────────────────────────────────────────────────────────────────── */

function ContentPreview({
  item, accent, shape,
}: {
  item: HomeItem;
  accent: string;
  shape: "page" | "slide";
}) {
  /**
   * A sheet inset on a tray. The sheet fills the tray rather than holding a
   * true paper ratio: a thumbnail is a crop of the top of the page, which is
   * what Google shows too, and forcing an exact ratio inside a fixed-aspect
   * card either overflows or leaves the sheet floating in dead space.
   */
  const paper = (children: React.ReactNode) => (
    <div className="h-full w-full p-3" style={{ background: "var(--surface-sunken)" }}>
      <div
        className="h-full w-full overflow-hidden rounded-[2px] shadow-sm"
        style={{ background: "var(--surface)" }}
      >
        {children}
      </div>
    </div>
  );

  if (item.previewCells?.length) {
    const rows = item.previewCells.slice(0, 7);
    const cols = Math.min(Math.max(...rows.map(r => r.length), 1), 5);
    return paper(
      <table className="w-full table-fixed border-collapse">
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {Array.from({ length: cols }, (_, c) => (
                <td
                  key={c}
                  className="truncate border px-1"
                  style={{
                    borderColor: "var(--border-soft)",
                    fontSize: 6,
                    height: 14,
                    // First row reads as a header, matching how ranges are
                    // almost always laid out.
                    background: r === 0 ? mix(accent, 12) : undefined,
                    color: r === 0 ? "var(--foreground)" : "var(--muted)",
                    fontWeight: r === 0 ? 600 : 400,
                  }}
                >
                  {row[c] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>,
    );
  }

  if (item.previewLines?.length) {
    const [first, ...rest] = item.previewLines;

    if (shape === "slide") {
      return paper(
        <div className="flex h-full w-full flex-col justify-center px-3">
          <p className="truncate font-semibold" style={{ fontSize: 9, color: "var(--foreground)" }}>
            {first}
          </p>
          <div className="mt-1 h-[2px] w-8 rounded-full" style={{ background: accent }} />
          {rest.slice(0, 3).map((line, i) => (
            <p key={i} className="mt-1 truncate" style={{ fontSize: 6.5, color: "var(--muted)" }}>
              {line}
            </p>
          ))}
        </div>,
      );
    }

    return paper(
      <div className="h-full w-full px-2.5 py-3">
        <p className="mb-1.5 truncate font-semibold" style={{ fontSize: 8, color: accent }}>
          {first}
        </p>
        {rest.slice(0, 8).map((line, i) => (
          <p key={i} className="truncate" style={{ fontSize: 6.5, lineHeight: 1.75, color: "var(--muted)" }}>
            {line}
          </p>
        ))}
      </div>,
    );
  }

  // Empty document — an honest blank page rather than fake content.
  return paper(
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex flex-col gap-[4px]" style={{ width: "58%" }}>
        {[100, 82, 90].map((w, i) => (
          <div
            key={i}
            className="h-[3px] rounded-full"
            style={{ width: `${w}%`, background: mix("var(--border-strong)", 55) }}
          />
        ))}
      </div>
    </div>,
  );
}

export function AppHome({
  /** "document" | "spreadsheet" | "presentation" — used in copy. */
  noun,
  /** Display name in the header, e.g. "Sage Docs". Defaults from the noun. */
  appName,
  templates,
  items,
  loading,
  creating,
  accent = "var(--accent)",
  /** Slides thumbnails are 16:9; everything else is a page. */
  thumb = "page",
  onCreate,
  onOpen,
  onDelete,
  emptyIcon: EmptyIcon = FolderOpen,
}: {
  noun: string;
  appName?: string;
  templates: HomeTemplate[];
  items: HomeItem[];
  loading: boolean;
  creating?: boolean;
  accent?: string;
  thumb?: "page" | "slide";
  onCreate: (templateId: string) => void;
  onOpen: (id: string) => void;
  onDelete?: (id: string) => void;
  emptyIcon?: React.ElementType;
}) {
  const [query, setQuery] = useState("");
  const [ownership, setOwnership] = useState<Ownership>("anyone");
  const [sort, setSort] = useState<SortKey>("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // Two-step delete: the menu asks for confirmation in place rather than
  // firing on the first click. Removing a document with one unlabelled click
  // and no undo is the kind of thing people only notice once it's gone.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Anything derived from the clock is set after mount. Rendering "Good
  // evening" on a server in UTC and "Good afternoon" on the client is a
  // hydration mismatch, and React resolves those by blowing away the subtree.
  const [greeting, setGreeting] = useState<string | null>(null);
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);

  // View preferences persist per app. Re-picking list view and a sort order on
  // every visit is a small annoyance that never stops being annoying.
  const prefsKey = `nexus_home_prefs_${noun}`;
  const prefsLoaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(prefsKey);
      if (raw) {
        const p = JSON.parse(raw) as { view?: string; sort?: string; ownership?: string };
        if (p.view === "grid" || p.view === "list") setView(p.view);
        if (p.sort === "recent" || p.sort === "name") setSort(p.sort);
        if (p.ownership === "anyone" || p.ownership === "me" || p.ownership === "shared") {
          setOwnership(p.ownership);
        }
      }
    } catch { /* corrupt or unavailable storage — defaults are fine */ }
    prefsLoaded.current = true;
  }, [prefsKey]);

  useEffect(() => {
    // Skip the first run, or the defaults would overwrite stored prefs before
    // the load effect above has applied them.
    if (!prefsLoaded.current) return;
    try {
      localStorage.setItem(prefsKey, JSON.stringify({ view, sort, ownership }));
    } catch { /* storage may be full */ }
  }, [prefsKey, view, sort, ownership]);

  // Escape closes the row menu — it was only dismissible by clicking away,
  // which leaves keyboard users stuck in it.
  useEffect(() => {
    if (!menuFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMenuFor(null); setConfirmDelete(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuFor]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter(i => {
      const byOwner =
        ownership === "anyone" ? true : ownership === "me" ? i.isOwner !== false : i.isOwner === false;
      if (!byOwner) return false;
      if (!q) return true;
      // Search titles AND thumbnail content, so "budget" finds a sheet whose
      // title is "Untitled" but whose first row says Budget.
      const haystack = [
        i.title,
        ...(i.previewLines ?? []),
        ...(i.previewCells ?? []).flat(),
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
    return [...filtered].sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title)
        : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [items, ownership, sort, query]);

  const title = appName ?? `${noun.charAt(0).toUpperCase()}${noun.slice(1)}s`;
  const plural = `${noun}s`;

  return (
    <div className="min-h-full" onClick={() => { setMenuFor(null); setConfirmDelete(null); }}>
      {/* ── 1. Editorial header ── */}
      <header className="px-6 pt-7 pb-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[26px] font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="mt-1 text-[13px] text-muted">
              {greeting && <span>{greeting} · </span>}
              {items.length === 0
                ? `No ${plural} yet`
                : `${items.length} ${items.length === 1 ? noun : plural}`}
            </p>
          </div>

          <div className="relative w-full sm:w-[300px]">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Escape") setQuery(""); }}
              placeholder={`Search ${plural}`}
              aria-label={`Search ${plural}`}
              className="h-10 w-full rounded-full border border-border bg-surface pl-10 pr-9
                         text-sm text-foreground placeholder:text-subtle transition-colors
                         focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center
                           rounded-full text-subtle transition-colors hover:bg-hover hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── 2. Template gallery ── */}
      <section className="px-6 pb-7">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-3 text-[13px] font-medium text-foreground">Start something new</h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {templates.map((tpl, i) => {
              // Alternate the app accent with violet. Violet is the one hue
              // Atrium keeps free of status meaning, so it decorates without
              // implying success, warning or breach.
              const hue = i % 2 === 1 ? "var(--violet)" : accent;
              return (
                <button
                  key={tpl.id}
                  onClick={() => onCreate(tpl.id)}
                  disabled={creating}
                  className="group w-[132px] flex-shrink-0 text-left disabled:opacity-50"
                >
                  <div
                    className="aspect-[3/4] w-full overflow-hidden rounded-xl border border-border
                               shadow-sm transition-all duration-150
                               group-hover:-translate-y-1 group-hover:shadow-panel
                               group-focus-visible:-translate-y-1"
                  >
                    <TemplateCover kind={tpl.preview ?? "doc"} hue={hue} accent={accent} variant={i} />
                  </div>
                  <p className="mt-2 truncate text-[12.5px] font-medium text-foreground">{tpl.label}</p>
                  <p className="truncate text-[11px] text-subtle">{tpl.sublabel ?? "Template"}</p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 3. Controls ──
          Sticky: with a long list, scrolling otherwise takes the filters
          off-screen exactly when you want to narrow things down.
          Opaque, not translucent-with-blur: Atrium reserves backdrop-blur for
          full-screen modal scrims, and a solid bar reads cleaner over a
          scrolling grid anyway. */}
      <div className="sticky top-0 z-10 border-y border-border-soft bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-[13px] font-medium text-foreground">
              {query
                ? `${visible.length} result${visible.length === 1 ? "" : "s"} for “${query}”`
                : `Recent ${plural}`}
            </h2>

            <select
              value={ownership}
              onChange={e => setOwnership(e.target.value as Ownership)}
              aria-label="Filter by owner"
              className="h-8 cursor-pointer rounded-lg border border-transparent bg-transparent px-2
                         text-[12px] text-muted hover:bg-hover focus:border-border focus:outline-none"
            >
              <option value="anyone">Owned by anyone</option>
              <option value="me">Owned by me</option>
              <option value="shared">Shared with me</option>
            </select>

            <button
              onClick={() => setSort(s => (s === "recent" ? "name" : "recent"))}
              title={sort === "recent" ? "Sorted by last modified" : "Sorted by name"}
              aria-label={sort === "recent" ? "Sorted by last modified" : "Sorted by name"}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover"
            >
              {sort === "recent" ? <Clock className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
            </button>

            <button
              onClick={() => setView(v => (v === "grid" ? "list" : "grid"))}
              title={view === "grid" ? "Switch to list view" : "Switch to grid view"}
              aria-label={view === "grid" ? "Switch to list view" : "Switch to grid view"}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover"
            >
              {view === "grid" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* ── 4. Files ── */}
      <div className="mx-auto max-w-6xl px-6 py-5">
        {loading ? (
          // Skeletons in the real grid shape, not a centred spinner: the cards
          // land exactly where the placeholders were, so nothing jumps when the
          // data arrives.
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-4" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-border bg-surface">
                <div
                  className="animate-pulse bg-surface-sunken"
                  style={{ aspectRatio: thumb === "slide" ? "16 / 10" : "4 / 3" }}
                />
                <div className="space-y-2 px-3 py-2.5">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-surface-sunken" />
                  <div className="h-2 w-1/2 animate-pulse rounded bg-surface-sunken" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div
              className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ background: mix(accent, 12) }}
            >
              <EmptyIcon className="h-6 w-6" style={{ color: accent }} />
            </div>
            <p className="text-sm font-medium text-foreground">
              {items.length === 0
                ? `No ${plural} yet`
                : query
                  ? `No ${plural} match “${query}”`
                  : "Nothing matches that filter"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {items.length === 0
                ? `Pick a template above to create your first ${noun}.`
                : query
                  ? "Search looks at titles and content."
                  : "Try “Owned by anyone”."}
            </p>
          </div>
        ) : view === "grid" ? (
          // nx-stagger cascades the first twelve cards in ~22ms apart; the rest
          // appear immediately, so a large grid never feels slow.
          <div className="nx-stagger grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map(item => (
              <div
                key={item.id}
                onClick={() => onOpen(item.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(item.id); } }}
                className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-surface
                           shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-panel
                           focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                <div
                  className="overflow-hidden border-b border-border-soft"
                  style={{ aspectRatio: thumb === "slide" ? "16 / 10" : "4 / 3" }}
                >
                  <ContentPreview item={item} accent={accent} shape={thumb} />
                </div>
                <div className="px-3 py-2.5">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {item.title || "Untitled"}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    {item.isOwner === false
                      ? <Users className="h-3 w-3 flex-shrink-0 text-subtle" />
                      : <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: accent }} />}
                    {/* suppressHydrationWarning: this text is a function of the
                        clock, so the server's "3 hours ago" and the client's
                        can legitimately differ by a tick. That mismatch is
                        React error #418. Timestamps are the case this API
                        exists for. */}
                    <span suppressHydrationWarning className="truncate text-[11px] text-subtle">
                      {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}
                    </span>
                    {item.pinned && <Star className="ml-auto h-3 w-3 flex-shrink-0 text-warn" />}
                    {onDelete && (
                      <div className="relative ml-auto" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setMenuFor(m => (m === item.id ? null : item.id))}
                          aria-label={`Actions for ${item.title || "Untitled"}`}
                          className="flex h-6 w-6 items-center justify-center rounded text-subtle
                                     opacity-0 transition-all hover:bg-hover hover:text-foreground
                                     focus:opacity-100 group-hover:opacity-100"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                        {menuFor === item.id && (
                          <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-border
                                          bg-surface py-1 shadow-pop">
                            <button
                              onClick={() => { setMenuFor(null); onOpen(item.id); }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-foreground hover:bg-hover"
                            >
                              <ExternalLink className="h-3.5 w-3.5" /> Open
                            </button>
                            {confirmDelete === item.id ? (
                              <button
                                onClick={() => { setMenuFor(null); setConfirmDelete(null); onDelete(item.id); }}
                                autoFocus
                                className="flex w-full items-center gap-2 bg-crit-soft px-3 py-1.5
                                           text-[12px] font-semibold text-crit"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Really remove?
                              </button>
                            ) : (
                              <button
                                onClick={() => setConfirmDelete(item.id)}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-crit hover:bg-crit-soft"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Remove
                              </button>
                            )}
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
                  className="group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5
                             transition-colors hover:bg-hover focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  <span
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md"
                    style={{ background: mix(accent, 14) }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
                  </span>
                  <span className="flex-1 truncate text-[13px] text-foreground">
                    {item.title || "Untitled"}
                  </span>
                  {item.isOwner === false && <Users className="h-3.5 w-3.5 flex-shrink-0 text-subtle" />}
                  {/* Also hydration-unstable: the server formats in UTC and the
                      browser in the user's zone, so this can differ by a day. */}
                  <span suppressHydrationWarning className="hidden flex-shrink-0 text-[11px] text-subtle sm:block">
                    {format(new Date(item.updatedAt), "d MMM yyyy")}
                  </span>
                  {onDelete && (
                    confirmDelete === item.id ? (
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmDelete(null); onDelete(item.id); }}
                        className="flex-shrink-0 rounded bg-crit-soft px-2 py-1 text-[11px] font-semibold
                                   text-crit transition-opacity hover:opacity-80"
                      >
                        Really remove?
                      </button>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmDelete(item.id); }}
                        aria-label={`Remove ${item.title || "Untitled"}`}
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-subtle
                                   opacity-0 transition-all hover:bg-crit-soft hover:text-crit
                                   focus:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )
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
