import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { globalSearch, type SearchResults } from "@/api/client";

type Item =
  | { type: "nav"; label: string; to: string; icon: string; kind: string }
  | { type: "mail"; id: string; subject: string }
  | { type: "chat"; id: string; channelId: string; channelName: string; sender: string; content: string }
  | { type: "person"; id: string; fullName: string; email: string };

const NAV_COMMANDS = [
  { label: "Go to Inbox",    to: "/app/inbox",    icon: "M2 8h20M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" },
  { label: "Go to Chat",     to: "/app/chat",     icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
  { label: "Go to Calendar", to: "/app/calendar", icon: "M8 2v4M16 2v4M3 10h18M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" },
  { label: "Go to Drive",    to: "/app/drive",    icon: "M22 17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.5C2 7 4 5 6.5 5H18c1.5 0 3 1.5 3 3v2" },
  { label: "Go to Notes",    to: "/app/notes",    icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" },
  { label: "Go to Meetings", to: "/app/meet",     icon: "M15 10l4.553-2.069A1 1 0 0 1 21 8.845v6.31a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" },
  { label: "Go to AI",       to: "/app/ai",       icon: "M12 2a8 8 0 1 0 0 16A8 8 0 0 0 12 2zM12 6v6l4 2" },
  { label: "Go to Settings", to: "/app/settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" },
];

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (debounced.length < 2) { setResults(null); return; }
    let cancelled = false;
    globalSearch(debounced)
      .then(r => { if (!cancelled) setResults(r); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [debounced]);

  const items: Item[] = [];
  // Nav items
  const navMatches = NAV_COMMANDS.filter(c => c.label.toLowerCase().includes(query.toLowerCase()));
  for (const n of navMatches) items.push({ type: "nav", label: n.label, to: n.to, icon: n.icon, kind: "Navigation" });

  if (results) {
    for (const m of results.mail) items.push({ type: "mail", id: m.id, subject: m.subject });
    for (const c of results.chat) items.push({ type: "chat", id: c.id, channelId: c.channelId, channelName: c.channelName, sender: c.sender, content: c.content });
    for (const p of results.people) items.push({ type: "person", id: p.id, fullName: p.fullName, email: p.email });
  }

  useEffect(() => { setHighlight(0); }, [items.length, query]);

  const runItem = useCallback((item: Item) => {
    if (item.type === "nav") {
      navigate(item.to);
    } else if (item.type === "mail") {
      navigate(`/app/inbox?thread=${item.id}`);
    } else if (item.type === "chat") {
      navigate(`/app/chat?channel=${item.channelId}&message=${item.id}`);
    } else if (item.type === "person") {
      navigate(`/app/chat?dm=${item.id}`);
    }
    onClose();
  }, [navigate, onClose]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight(h => Math.min(items.length - 1, h + 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setHighlight(h => Math.max(0, h - 1)); }
    if (e.key === "Enter")     { e.preventDefault(); if (items[highlight]) runItem(items[highlight]); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-24 no-select" onKeyDown={handleKey}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-[600px] rounded-xl border border-brand-border bg-bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 border-b border-brand-border px-4">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search Nexus or jump to…"
            className="flex-1 bg-transparent py-3.5 text-sm text-text-primary placeholder-text-muted/60 outline-none"
          />
          <kbd className="text-[10px] text-text-muted/60 border border-brand-border px-1.5 py-0.5 rounded">esc</kbd>
        </div>

        <div className="max-h-[400px] overflow-y-auto py-2">
          {items.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-text-muted">
              {query.length < 2 ? "Type to search — across mail, chat, people, and more." : "No results"}
            </p>
          )}
          {items.map((item, i) => {
            const isActive = i === highlight;
            return (
              <button
                key={`${item.type}-${"id" in item ? item.id : item.to}`}
                onClick={() => runItem(item)}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-fast ${isActive ? "bg-brand-dim text-text-primary" : "text-text-secondary hover:bg-bg-hover"}`}
              >
                {item.type === "nav" && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={item.icon} /></svg>
                )}
                {item.type === "mail" && <span className="text-base">✉️</span>}
                {item.type === "chat" && <span className="text-base">💬</span>}
                {item.type === "person" && <span className="text-base">👤</span>}

                <div className="flex-1 min-w-0">
                  {item.type === "nav" && <p className="text-[13px] truncate">{item.label}</p>}
                  {item.type === "mail" && <p className="text-[13px] truncate">{item.subject || "(no subject)"}</p>}
                  {item.type === "chat" && (
                    <>
                      <p className="text-[13px] truncate">{item.content}</p>
                      <p className="text-[11px] text-text-muted truncate">#{item.channelName} · {item.sender}</p>
                    </>
                  )}
                  {item.type === "person" && (
                    <>
                      <p className="text-[13px] truncate">{item.fullName}</p>
                      <p className="text-[11px] text-text-muted truncate">{item.email}</p>
                    </>
                  )}
                </div>

                <span className={`text-[10px] uppercase tracking-wider ${isActive ? "text-brand" : "text-text-muted/60"}`}>
                  {item.type === "nav" ? "Go" : item.type === "mail" ? "Mail" : item.type === "chat" ? "Chat" : "Person"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="border-t border-brand-border px-4 py-2 text-[10px] text-text-muted/60 flex items-center gap-3">
          <span className="flex items-center gap-1"><kbd className="border border-brand-border px-1 rounded">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="border border-brand-border px-1 rounded">↵</kbd> select</span>
          <span className="flex items-center gap-1"><kbd className="border border-brand-border px-1 rounded">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
