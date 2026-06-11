import { useState, useEffect, useRef, useCallback } from "react";
import { getNotes, createNote, updateNote, deleteNote, type Note } from "@/api/client";

const NOTE_COLORS = [
  { key: null, bg: "bg-bg-card", border: "border-brand-border", label: "Default" },
  { key: "#1e2d1e", bg: "bg-[#1e2d1e]", border: "border-green-800/50", label: "Green" },
  { key: "#2d1e1e", bg: "bg-[#2d1e1e]", border: "border-red-800/50", label: "Red" },
  { key: "#1e2035", bg: "bg-[#1e2035]", border: "border-blue-800/50", label: "Blue" },
  { key: "#2d2a1e", bg: "bg-[#2d2a1e]", border: "border-amber-800/50", label: "Yellow" },
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getNotes().then(n => { setNotes(n); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function selectNote(note: Note) {
    if (saveTimer.current) { clearTimeout(saveTimer.current); void flushSave(); }
    setSelected(note);
    setTitle(note.title);
    setContent(note.content);
    setSaved(false);
  }

  const flushSave = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await updateNote(selected.id, { title, content });
      setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
      setSelected(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* silent */ }
    finally { setSaving(false); }
  }, [selected, title, content]);

  function scheduleAutoSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushSave(), 1500);
  }

  async function handleNewNote() {
    try {
      const note = await createNote({ title: "Untitled Note", content: "" });
      setNotes(prev => [note, ...prev]);
      selectNote(note);
    } catch { /* silent */ }
  }

  async function handleDelete(noteId: string) {
    if (!confirm("Delete this note?")) return;
    try {
      await deleteNote(noteId);
      setNotes(prev => prev.filter(n => n.id !== noteId));
      if (selected?.id === noteId) { setSelected(null); setTitle(""); setContent(""); }
    } catch { /* silent */ }
  }

  async function togglePin(note: Note) {
    try {
      const updated = await updateNote(note.id, { pinned: !note.pinned });
      setNotes(prev => prev.map(n => n.id === updated.id ? updated : n).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)));
      if (selected?.id === note.id) setSelected(updated);
    } catch { /* silent */ }
  }

  const filtered = notes.filter(n =>
    !query || n.title.toLowerCase().includes(query.toLowerCase()) || n.content.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Note list */}
      <aside className="w-[260px] flex-shrink-0 border-r border-brand-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-[52px] flex-shrink-0 flex items-center justify-between px-4 border-b border-brand-border no-select">
          <span className="text-sm font-semibold text-text-primary">Notes</span>
          <button
            onClick={() => void handleNewNote()}
            title="New note"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-fast"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-brand-border/40">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted/60" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search notes…"
              className="w-full pl-7 pr-3 py-1.5 rounded-md bg-bg-base border border-brand-border/50 text-xs text-text-primary placeholder-text-muted/50 outline-none focus:border-brand/40 transition-fast"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="space-y-1 p-2">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-14 rounded-lg" />)}
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-text-muted">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-25">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" />
              </svg>
              <p className="text-xs">{query ? "No notes found" : "No notes yet"}</p>
              {!query && (
                <button onClick={() => void handleNewNote()} className="text-xs text-brand hover:text-brand/80 transition-fast">
                  Create your first note
                </button>
              )}
            </div>
          )}
          {filtered.map(note => (
            <div
              key={note.id}
              onClick={() => selectNote(note)}
              className={`relative px-3 py-2.5 border-b border-brand-border/40 cursor-pointer hover:bg-bg-hover transition-fast group ${
                selected?.id === note.id ? "bg-brand-dim border-l-2 border-l-brand" : "border-l-2 border-l-transparent"
              }`}
              style={note.color ? { borderLeftColor: note.color } : undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {note.pinned && <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-brand flex-shrink-0"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.4 2.4-7.4L2 9.4h7.6z"/></svg>}
                    <p className="text-[13px] font-semibold text-text-primary truncate">{note.title}</p>
                  </div>
                  <p className="text-[11px] text-text-muted truncate">{note.content || "No content"}</p>
                  <p className="text-[10px] text-text-muted/60 mt-0.5">{timeAgo(note.updatedAt)}</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); void togglePin(note); }}
                  className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-text-muted/50 hover:text-brand transition-fast mt-0.5"
                  title={note.pinned ? "Unpin" : "Pin"}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Editor */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selected ? (
          <>
            {/* Editor header */}
            <div className="flex-shrink-0 flex items-center gap-3 h-[52px] px-5 border-b border-brand-border no-select">
              <input
                type="text"
                value={title}
                onChange={e => { setTitle(e.target.value); scheduleAutoSave(); }}
                className="flex-1 bg-transparent text-base font-semibold text-text-primary outline-none placeholder-text-muted/40"
                placeholder="Note title"
              />
              <div className="flex items-center gap-2 ml-auto">
                {saving && (
                  <span className="flex items-center gap-1 text-[11px] text-text-muted">
                    <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Saving…
                  </span>
                )}
                {saved && !saving && <span className="text-[11px] text-text-muted">Saved</span>}

                {/* Color picker */}
                <div className="flex items-center gap-1">
                  {NOTE_COLORS.map(c => (
                    <button
                      key={String(c.key)}
                      onClick={async () => {
                        const updated = await updateNote(selected.id, { color: c.key ?? null });
                        setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
                        setSelected(updated);
                      }}
                      className={`h-4 w-4 rounded-full border-2 transition-fast ${
                        selected.color === c.key ? "border-brand scale-110" : "border-brand-border/40 hover:border-brand/40"
                      }`}
                      style={c.key ? { background: c.key } : { background: "rgba(27,31,46,0.8)" }}
                      title={c.label}
                    />
                  ))}
                </div>

                <button
                  onClick={() => void handleDelete(selected.id)}
                  title="Delete note"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted/60 hover:text-danger hover:bg-danger/10 transition-fast"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content area */}
            <textarea
              value={content}
              onChange={e => { setContent(e.target.value); scheduleAutoSave(); }}
              placeholder="Start writing…"
              className="flex-1 resize-none bg-transparent px-6 py-5 text-sm text-text-secondary leading-relaxed outline-none placeholder-text-muted/30"
              style={selected.color ? { background: selected.color } : undefined}
            />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-text-muted no-select">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-20">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" />
            </svg>
            <div className="text-center">
              <p className="text-sm font-medium text-text-secondary">Select a note</p>
              <p className="text-xs mt-1">Or create a new one</p>
            </div>
            <button
              onClick={() => void handleNewNote()}
              className="mt-1 px-4 py-2 rounded-lg text-xs font-semibold text-bg-deep"
              style={{ background: "linear-gradient(135deg, #00d2ff 0%, #0098c7 100%)" }}
            >
              New Note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
