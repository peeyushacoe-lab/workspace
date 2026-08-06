"use client";

import { useCallback, useEffect, useRef, useState } from "react";
// Global search jumps between apps, and Docs/Drive/Meet now live on their own
// subdomains — appNavigate() cannot cross origins, so navigation goes through
// appNavigate, which falls back to router.push for same-origin targets.
import { useAppNavigate } from "@/components/AppLink";
import {
  Search,
  X,
  Loader2,
  Mail,
  MessageSquare,
  HardDrive,
  CalendarDays,
  Pencil,
  Calendar,
  Upload,
  Inbox,
  LayoutDashboard,
  ArrowRight,
  Sparkles,
  Video,
  StickyNote,
  Users,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type SearchResultType =
  | "mail"
  | "chat"
  | "drive"
  | "calendar"
  | "meeting"
  | "note"
  | "people";

type SearchResult = {
  id: string;
  type: SearchResultType;
  title: string;
  excerpt: string;
  link: string;
  createdAt: string;
  metadata?: Record<string, string>;
};

const TYPE_FILTERS = [
  "all",
  "mail",
  "chat",
  "drive",
  "calendar",
  "meeting",
  "note",
  "people",
] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

// ─── Static action list ───────────────────────────────────────────────────────

type Action = {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  keywords: string[];
  kind: "navigate" | "compose" | "upload" | "calendar-event" | "chat-message";
  href?: string;
};

const ACTIONS: Action[] = [
  {
    id: "compose-email",
    label: "Compose email",
    description: "Write a new email",
    icon: Pencil,
    iconColor: "text-accent",
    keywords: ["compose", "write", "email", "new", "draft"],
    kind: "compose",
  },
  {
    id: "go-inbox",
    label: "Go to Inbox",
    description: "Open your inbox",
    icon: Inbox,
    iconColor: "text-accent",
    keywords: ["inbox", "mail", "email", "go"],
    kind: "navigate",
    href: "/inbox",
  },
  {
    id: "go-chat",
    label: "Go to Chat",
    description: "Open workspace chat",
    icon: MessageSquare,
    iconColor: "text-ok",
    keywords: ["chat", "messages", "dm", "go"],
    kind: "navigate",
    href: "/connect/chat",
  },
  {
    id: "go-drive",
    label: "Go to Drive",
    description: "Open file storage",
    icon: HardDrive,
    iconColor: "text-warn",
    keywords: ["drive", "files", "storage", "documents", "go"],
    kind: "navigate",
    href: "/drive",
  },
  {
    id: "go-calendar",
    label: "Go to Calendar",
    description: "Open calendar",
    icon: CalendarDays,
    iconColor: "text-violet",
    keywords: ["calendar", "events", "schedule", "go"],
    kind: "navigate",
    href: "/calendar",
  },
  {
    id: "go-dashboard",
    label: "Go to Dashboard",
    description: "Open your dashboard",
    icon: LayoutDashboard,
    iconColor: "text-accent",
    keywords: ["dashboard", "home", "overview", "go"],
    kind: "navigate",
    href: "/dashboard",
  },
  {
    id: "new-calendar-event",
    label: "New calendar event",
    description: "Create a new event",
    icon: Calendar,
    iconColor: "text-violet",
    keywords: ["new", "event", "calendar", "schedule", "create"],
    kind: "calendar-event",
    href: "/calendar",
  },
  {
    id: "upload-file",
    label: "Upload file",
    description: "Upload a file to Drive",
    icon: Upload,
    iconColor: "text-warn",
    keywords: ["upload", "file", "drive", "attach"],
    kind: "upload",
    href: "/drive",
  },
  {
    id: "new-chat-message",
    label: "New chat message",
    description: "Start a new conversation",
    icon: MessageSquare,
    iconColor: "text-ok",
    keywords: ["new", "chat", "message", "conversation"],
    kind: "chat-message",
    href: "/connect/chat",
  },
];

// ─── Type metadata ────────────────────────────────────────────────────────────

const TYPE_META: Record<
  SearchResultType,
  { label: string; color: string; bg: string; Icon: React.ElementType }
> = {
  mail: {
    label: "Mail",
    color: "text-accent dark:text-accent",
    bg: "bg-accent/15 dark:bg-accent/20",
    Icon: Mail,
  },
  chat: {
    label: "Chat",
    color: "text-violet dark:text-violet",
    bg: "bg-violet/15 dark:bg-violet/20",
    Icon: MessageSquare,
  },
  drive: {
    label: "Files",
    color: "text-ok dark:text-ok",
    bg: "bg-ok/15 dark:bg-ok/20",
    Icon: HardDrive,
  },
  calendar: {
    label: "Calendar",
    color: "text-warn dark:text-warn",
    bg: "bg-warn/15 dark:bg-warn/20",
    Icon: CalendarDays,
  },
  meeting: {
    label: "Meetings",
    color: "text-crit dark:text-crit",
    bg: "bg-crit/15 dark:bg-crit/20",
    Icon: Video,
  },
  note: {
    label: "Notes",
    color: "text-ok dark:text-ok",
    bg: "bg-ok/15 dark:bg-ok/20",
    Icon: StickyNote,
  },
  people: {
    label: "People",
    color: "text-accent dark:text-accent",
    bg: "bg-accent/15 dark:bg-accent/20",
    Icon: Users,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _TypeBadge({ type }: { type: SearchResultType }) {
  const { label, color, bg, Icon } = TYPE_META[type];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${bg} ${color}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Unified item type for keyboard nav ──────────────────────────────────────

type PaletteItem =
  | { kind: "action"; action: Action }
  | { kind: "result"; result: SearchResult }
  | { kind: "ai-command" };

type AiActionResult = {
  action: string;
  params: Record<string, string>;
  displayText: string;
  confidence: number;
};

// ─── Main CommandPalette ──────────────────────────────────────────────────────

export function GlobalSearch({
  onClose,
  onAction,
}: {
  onClose: () => void;
  onAction?: (action: Action) => void;
}) {
  const appNavigate = useAppNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);

  const debouncedQuery = useDebounce(query, 300);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Search API
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    const params = new URLSearchParams({ q: debouncedQuery, type: typeFilter, limit: "20" });
    fetch(`/api/search?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { results: SearchResult[] }) => {
        setResults(data.results ?? []);
        setSelectedIndex(0);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, typeFilter]);

  // Filter actions by query
  const filteredActions: Action[] = query.trim().length === 0
    ? ACTIONS
    : ACTIONS.filter((a) => {
        const q = query.toLowerCase();
        return (
          a.label.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.keywords.some((k) => k.includes(q))
        );
      });

  // Build the unified flat list for keyboard nav
  const isSearchMode = debouncedQuery.length >= 2;
  const showAiRow = query.trim().length >= 2;

  const items: PaletteItem[] = isSearchMode
    ? [
        ...filteredActions.map((action): PaletteItem => ({ kind: "action", action })),
        ...results.map((result): PaletteItem => ({ kind: "result", result })),
        ...(showAiRow ? [{ kind: "ai-command" as const }] : []),
      ]
    : [
        ...filteredActions.map((action): PaletteItem => ({ kind: "action", action })),
        ...(showAiRow ? [{ kind: "ai-command" as const }] : []),
      ];

  const navigateToResult = useCallback(
    (result: SearchResult) => {
      appNavigate(result.link);
      onClose();
    },
    [appNavigate, onClose]
  );

  const executeAction = useCallback(
    (action: Action) => {
      if (action.kind === "navigate" || action.kind === "upload" || action.kind === "calendar-event" || action.kind === "chat-message") {
        if (action.href) appNavigate(action.href);
      } else if (action.kind === "compose") {
        // Trigger compose via the global keyboard shortcut 'c'
        // or delegate to parent via onAction callback
        if (onAction) {
          onAction(action);
        } else {
          // Dispatch synthetic Ctrl+Shift+C to open ComposeButton modal
          const evt = new KeyboardEvent("keydown", { key: "C", ctrlKey: true, shiftKey: true, bubbles: true });
          window.dispatchEvent(evt);
        }
      }
      onClose();
    },
    [appNavigate, onClose, onAction]
  );

  const executeAiCommand = useCallback(async () => {
    if (!query.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/natural-language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: query.trim() }),
      });
      const data: AiActionResult = await res.json();

      switch (data.action) {
        case "navigate":
          appNavigate(data.params.href || "/inbox");
          break;
        case "compose_email":
          if (onAction) {
            onAction(ACTIONS.find((a) => a.id === "compose-email")!);
          } else {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
          }
          break;
        case "search":
          appNavigate(`/inbox?q=${encodeURIComponent(data.params.query || query)}`);
          break;
        case "create_event":
          appNavigate("/calendar");
          break;
        case "create_note":
          appNavigate("/notes");
          break;
        case "create_doc":
          appNavigate("/docs");
          break;
        case "upload_file":
          appNavigate("/drive");
          break;
        case "create_channel":
          appNavigate("/connect/chat");
          break;
        case "summarize_inbox":
          appNavigate("/inbox");
          break;
        default:
          break;
      }
      onClose();
    } catch {
      // fail silently — AI unavailable
    } finally {
      setAiLoading(false);
    }
  }, [query, onClose, onAction, appNavigate]);

  const activateItem = useCallback(
    (item: PaletteItem) => {
      if (item.kind === "action") executeAction(item.action);
      else if (item.kind === "result") navigateToResult(item.result);
      else executeAiCommand();
    },
    [executeAction, navigateToResult, executeAiCommand]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && items.length > 0) {
      e.preventDefault();
      const item = items[selectedIndex];
      if (item) activateItem(item);
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, typeFilter]);

  // Group search results
  const grouped = results.reduce<Partial<Record<SearchResultType, SearchResult[]>>>(
    (acc, r) => {
      (acc[r.type] ??= []).push(r);
      return acc;
    },
    {}
  );
  const typeOrder: SearchResultType[] = [
    "mail",
    "chat",
    "drive",
    "calendar",
    "meeting",
    "note",
    "people",
  ];

  // For display: track cumulative indices in the flat items array
  // Actions come first, then results grouped by type
  const actionCount = isSearchMode ? filteredActions.length : filteredActions.length;

  return (
    <div
      className="nexfade fixed inset-0 z-50 bg-overlay backdrop-blur-sm flex items-start justify-center pt-[10vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="nexpop bg-surface rounded-xl shadow-2xl border border-border w-full max-w-xl overflow-hidden flex flex-col max-h-[70vh]">

        {/* Search input */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-3">
          <Search className="h-5 w-5 text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search or type a command... (try from:, in:, has:attachment, before:, after:)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 text-foreground bg-transparent outline-none text-sm placeholder:text-muted"
          />
          {loading && <Loader2 className="h-4 w-4 text-accent animate-spin flex-shrink-0" />}
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1 rounded-lg text-muted hover:text-foreground hover:bg-hover transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Type filter tabs — shown only when searching */}
        {isSearchMode && (
          <div className="flex gap-1 px-4 py-2 border-b border-border bg-surface">
            {TYPE_FILTERS.map((f) => {
              const label =
                f === "all"
                  ? "All"
                  : TYPE_META[f as SearchResultType]?.label ?? f;
              return (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    typeFilter === f
                      ? "bg-surface text-accent-foreground"
                      : "text-muted hover:bg-hover"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Results / Actions list */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden" ref={listRef}>

          {/* Actions section (always shown unless search returned lots of results and no actions match) */}
          {filteredActions.length > 0 && (
            <div>
              {isSearchMode && (
                <div className="px-4 py-1.5 text-xs font-semibold text-muted bg-surface">
                  Actions
                </div>
              )}
              {!isSearchMode && (
                <div className="px-4 py-1.5 text-xs font-semibold text-muted bg-surface">
                  Quick Actions
                </div>
              )}
              {filteredActions.map((action, idx) => {
                const Icon = action.icon;
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={action.id}
                    onClick={() => executeAction(action)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                      isSelected
                        ? "bg-ok/10"
                        : "hover:bg-hover"
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-md bg-hover flex items-center justify-center flex-shrink-0 ${action.iconColor}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {action.label}
                      </p>
                      <p className="text-xs text-muted truncate">
                        {action.description}
                      </p>
                    </div>
                    {isSelected && (
                      <ArrowRight className="h-3.5 w-3.5 text-muted flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Search results */}
          {isSearchMode && !loading && results.length === 0 && filteredActions.length === 0 && (
            <div className="py-12 text-center text-sm text-muted">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}

          {isSearchMode && results.length > 0 && (
            <div>
              {typeOrder
                .filter((t) => grouped[t]?.length)
                .map((t) => (
                  <div key={t}>
                    <div className="px-4 py-1.5 text-xs font-semibold text-muted bg-surface">
                      {TYPE_META[t].label}
                    </div>
                    {grouped[t]!.map((result) => {
                      // Calculate flat index: actions come first
                      const flatIndex = actionCount + results.indexOf(result);
                      const isSelected = flatIndex === selectedIndex;
                      return (
                        <button
                          key={result.id}
                          onClick={() => navigateToResult(result)}
                          onMouseEnter={() => setSelectedIndex(flatIndex)}
                          className={`w-full text-left px-4 py-2.5 flex items-center gap-3 cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-ok/10"
                              : "hover:bg-hover"
                          }`}
                        >
                          {(() => {
                            const meta = TYPE_META[result.type];
                            const Icon = meta?.Icon;
                            return (
                              <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${meta?.bg ?? "bg-hover"}`}>
                                {Icon && <Icon className={`h-3.5 w-3.5 ${meta?.color ?? "text-muted"}`} />}
                              </div>
                            );
                          })()}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {result.title}
                            </p>
                            {result.excerpt && (
                              <p className="text-xs text-muted mt-0.5 line-clamp-1">
                                {result.excerpt}
                              </p>
                            )}
                          </div>
                          {isSelected && (
                            <ArrowRight className="h-3.5 w-3.5 text-muted flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
            </div>
          )}

          {/* Empty state when no query */}
          {!isSearchMode && filteredActions.length === 0 && !showAiRow && (
            <div className="py-12 text-center text-sm text-muted">
              No matching actions
            </div>
          )}

          {/* AI Command row */}
          {showAiRow && (() => {
            const aiIdx = items.length - 1;
            const isSelected = selectedIndex === aiIdx;
            return (
              <div>
                <div className="px-4 py-1.5 text-xs font-semibold text-accent bg-surface/5 border-t border-accent/20 flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" />
                  AI Command
                </div>
                <button
                  onClick={() => executeAiCommand()}
                  onMouseEnter={() => setSelectedIndex(aiIdx)}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                    isSelected
                      ? "bg-ok/10"
                      : "hover:bg-hover"
                  }`}
                >
                  <div className="w-7 h-7 rounded-md bg-ok/10 flex items-center justify-center text-accent flex-shrink-0">
                    {aiLoading
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Sparkles className="h-3.5 w-3.5" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-accent truncate">
                      Ask AI: &ldquo;{query}&rdquo;
                    </p>
                    <p className="text-xs text-muted truncate">
                      Let AI understand your intent and take action
                    </p>
                  </div>
                  {isSelected && !aiLoading && (
                    <ArrowRight className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                  )}
                </button>
              </div>
            );
          })()}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-border bg-surface flex items-center gap-4 text-[11px] text-muted">
          <span>
            <kbd className="text-xs text-muted bg-hover px-1.5 py-0.5 rounded border border-border">↑↓</kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="text-xs text-muted bg-hover px-1.5 py-0.5 rounded border border-border">Enter</kbd>{" "}
            select
          </span>
          <span>
            <kbd className="text-xs text-muted bg-hover px-1.5 py-0.5 rounded border border-border">Esc</kbd>{" "}
            close
          </span>
          <span className="ml-auto">
            <kbd className="text-xs text-muted bg-hover px-1.5 py-0.5 rounded border border-border">Ctrl K</kbd>{" "}
            anywhere
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Search Trigger Button ────────────────────────────────────────────────────

export function SearchTrigger({ variant = "light" }: { variant?: "light" | "dark" | "collapsed" | "topbar" | "icon" | "searchbar" }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (variant === "icon") {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          aria-label="Search"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-sunken transition-colors"
        >
          <Search className="h-[18px] w-[18px]" />
        </button>
        {open && <GlobalSearch onClose={() => setOpen(false)} />}
      </>
    );
  }

  if (variant === "collapsed") {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          title="Search (Ctrl+K)"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-subtle hover:bg-surface-sunken hover:text-muted transition-colors"
        >
          <Search className="h-[17px] w-[17px]" />
        </button>
        {open && <GlobalSearch onClose={() => setOpen(false)} />}
      </>
    );
  }

  if (variant === "searchbar") {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="flex-1 flex items-center gap-2.5 h-[40px] rounded-full bg-surface-sunken border border-border hover:border-border-strong hover:bg-surface px-4 transition-colors"
        >
          <Search className="h-4 w-4 text-subtle flex-shrink-0" />
          <span className="text-[13px] text-subtle flex-1 text-left">Search in Nexus</span>
        </button>
        {open && <GlobalSearch onClose={() => setOpen(false)} />}
      </>
    );
  }

  if (variant === "topbar") {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2.5 w-full max-w-[440px] h-9 px-3.5 rounded-lg bg-surface border border-border hover:border-border-strong text-[13px] text-subtle hover:text-muted transition-colors"
        >
          <Search className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1 text-left">Search or jump to…</span>
          <kbd className="hidden sm:inline-block text-[10px] font-mono bg-surface-sunken border border-border text-subtle px-1.5 py-0.5 rounded">⌘K</kbd>
        </button>
        {open && <GlobalSearch onClose={() => setOpen(false)} />}
      </>
    );
  }

  const btnClass =
    "flex items-center gap-2 w-full px-3 py-2 rounded-xl bg-surface-sunken hover:bg-border text-[13px] text-subtle hover:text-muted transition-colors";

  const kbdClass =
    "hidden sm:inline-block text-[10px] font-mono bg-surface border border-border text-subtle px-1.5 py-0.5 rounded";

  return (
    <>
      <button onClick={() => setOpen(true)} className={btnClass}>
        <Search className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className={kbdClass}>Ctrl K</kbd>
      </button>

      {open && <GlobalSearch onClose={() => setOpen(false)} />}
    </>
  );
}
