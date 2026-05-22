"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Bold,
  ChevronLeft,
  Code,
  Italic,
  Link2,
  List,
  ListOrdered,
  MoreVertical,
  Palette,
  Pin,
  PinOff,
  Plus,
  Quote,
  Search,
  Strikethrough,
  StickyNote,
  Trash2,
  Underline,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

type Note = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  color: string | null;
  createdAt: string;
  updatedAt: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const NOTE_COLORS: { label: string; value: string; dot: string; border: string }[] = [
  { label: "None",   value: "",          dot: "bg-[#859399]",   border: "border-[#859399]" },
  { label: "Cyan",   value: "#00d2ff1a", dot: "bg-[#00d2ff]",   border: "border-[#00d2ff]" },
  { label: "Green",  value: "#00feb21a", dot: "bg-[#00feb2]",   border: "border-[#00feb2]" },
  { label: "Blue",   value: "#a5e7ff1a", dot: "bg-[#a5e7ff]",   border: "border-[#a5e7ff]" },
  { label: "Pink",   value: "#ff4d6d1a", dot: "bg-[#ff4d6d]",   border: "border-[#ff4d6d]" },
  { label: "Purple", value: "#c084fc1a", dot: "bg-purple-400",   border: "border-purple-400" },
  { label: "Red",    value: "#ffb4ab1a", dot: "bg-[#ffb4ab]",   border: "border-[#ffb4ab]" },
  { label: "Grey",   value: "#3c494e1a", dot: "bg-[#859399]",   border: "border-[#859399]" },
];

function getBorderColor(color: string | null): string {
  const found = NOTE_COLORS.find((c) => c.value === (color ?? ""));
  return found && found.value ? found.border : "border-transparent";
}

function getDotClass(color: string | null): string {
  const found = NOTE_COLORS.find((c) => c.value === (color ?? ""));
  return found ? found.dot : "bg-[#cbd5e1]";
}

function getEditorBg(color: string | null): string {
  if (!color) return "";
  return `[background-color:${color}]`;
}

// ─── NoteListItem ─────────────────────────────────────────────────────────────

function NoteListItem({
  note,
  selected,
  onClick,
  onPin,
  onColor,
  onDelete,
}: {
  note: Note;
  selected: boolean;
  onClick: () => void;
  onPin: () => void;
  onColor: (c: string) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const preview = note.content.slice(0, 60).replace(/\n/g, " ") || "No content";
  const when = formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true });

  useEffect(() => {
    if (!menuOpen && !colorOpen) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setColorOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen, colorOpen]);

  const borderClass = getBorderColor(note.color);
  const hasBorder = note.color && note.color !== "";

  return (
    <div
      className={`relative group transition-colors duration-150 ${
        selected
          ? "bg-[#00d2ff]/10 text-[#a5e7ff] font-medium"
          : "hover:bg-[#262939]"
      }`}
    >
      {/* Colored left border */}
      {hasBorder && (
        <div
          className={`absolute left-0 top-0 bottom-0 w-1 rounded-l border-l-4 ${borderClass}`}
        />
      )}
      <button
        onClick={onClick}
        className={`w-full text-left px-4 py-3 border-b border-[rgba(0,255,255,0.1)] cursor-pointer transition-colors ${hasBorder ? "pl-5" : ""}`}
      >
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${getDotClass(note.color)}`} />
          <span className="font-medium text-sm text-[#dfe1f6] truncate flex-1">
            {note.title || "Untitled"}
          </span>
          {note.pinned && (
            <Pin className="w-3 h-3 text-[#a5e7ff] shrink-0" />
          )}
        </div>
        <p className="text-xs text-[#bbc9cf] truncate ml-4">{preview}</p>
        <p className="text-xs text-[#859399] ml-4 mt-0.5">{when}</p>
      </button>

      {/* 3-dot menu */}
      <div
        ref={menuRef}
        className={`absolute right-2 top-2 transition-opacity duration-150 ${
          menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
            setColorOpen(false);
          }}
          className="p-1 rounded-md hover:bg-[#3c494e] text-[#bbc9cf]"
          aria-label="Note options"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 z-30 bg-[#1b1f2e] rounded-xl shadow-lg border border-[rgba(0,255,255,0.1)] py-1 min-w-[140px]">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onPin();
              }}
              className="w-full text-left px-3 py-2 text-sm text-[#dfe1f6] hover:bg-[#262939] flex items-center gap-2"
            >
              {note.pinned ? (
                <><PinOff className="w-3.5 h-3.5" /> Unpin</>
              ) : (
                <><Pin className="w-3.5 h-3.5" /> Pin</>
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setColorOpen((v) => !v);
              }}
              className="w-full text-left px-3 py-2 text-sm text-[#dfe1f6] hover:bg-[#262939] flex items-center gap-2"
            >
              <Palette className="w-3.5 h-3.5" /> Color
            </button>
            {colorOpen && (
              <div className="px-3 py-2 flex flex-wrap gap-1.5 border-t border-[rgba(0,255,255,0.1)]">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      onColor(c.value);
                      setColorOpen(false);
                      setMenuOpen(false);
                    }}
                    title={c.label}
                    className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${c.dot} ${
                      (note.color ?? "") === c.value ? "border-[#dfe1f6]" : "border-transparent"
                    }`}
                  />
                ))}
              </div>
            )}
            <div className="border-t border-[rgba(0,255,255,0.1)] mt-1" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete();
              }}
              className="w-full text-left px-3 py-2 text-sm text-[#ff4d6d] hover:bg-[#ff4d6d]/10 flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Formatting toolbar button ─────────────────────────────────────────────────

function FmtBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault(); // prevent editor blur
        onClick();
      }}
      title={title}
      className="p-1.5 text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded transition-colors text-sm"
    >
      {children}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NotesView() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">("idle");
  const [showEditor, setShowEditor] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  // ── Filtered notes (client-side search) ───────────────────────────────────

  const filteredNotes = query.trim()
    ? notes.filter(
        (n) =>
          n.title.toLowerCase().includes(query.toLowerCase()) ||
          n.content.toLowerCase().includes(query.toLowerCase())
      )
    : notes;

  const pinnedNotes = filteredNotes.filter((n) => n.pinned);
  const unpinnedNotes = filteredNotes.filter((n) => !n.pinned);
  const hasBothSections = pinnedNotes.length > 0 && unpinnedNotes.length > 0;

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch("/api/notes");
      if (!res.ok) throw new Error("Failed to fetch notes");
      const data = (await res.json()) as Note[];
      setNotes(data);
    } catch {
      toast.error("Could not load notes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNotes();
  }, [fetchNotes]);

  // Close color picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    if (contentRef.current) {
      contentRef.current.style.height = "auto";
      contentRef.current.style.height = `${contentRef.current.scrollHeight}px`;
    }
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────────

  const scheduleSave = useCallback(
    (id: string, patch: Partial<Pick<Note, "title" | "content" | "pinned" | "color">>) => {
      // Optimistic update in list
      setNotes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n
        )
      );

      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
      setSaveStatus("saving");

      saveDebounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/notes/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
          if (!res.ok) throw new Error("Save failed");
          const updated = (await res.json()) as Note;
          setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
          setSaveStatus("saved");
        } catch {
          toast.error("Auto-save failed");
          setSaveStatus("idle");
        }
      }, 1500);
    },
    []
  );

  // Immediate save (no debounce) for pin and color
  const saveNow = useCallback(
    async (id: string, patch: Partial<Pick<Note, "title" | "content" | "pinned" | "color">>) => {
      // Optimistic update
      setNotes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n
        )
      );
      try {
        const res = await fetch(`/api/notes/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error("Save failed");
        const updated = (await res.json()) as Note;
        setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
      } catch {
        toast.error("Could not save");
      }
    },
    []
  );

  // ── Search ──────────────────────────────────────────────────────────────────

  const handleSearch = (q: string) => {
    setQuery(q);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    // Client-side filtering is instant; server search for accurate results on debounce
    searchDebounceRef.current = setTimeout(() => void fetchNotes(), 400);
  };

  // ── Create ──────────────────────────────────────────────────────────────────

  const handleNew = async () => {
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", content: "" }),
      });
      if (!res.ok) throw new Error("Failed to create note");
      const note = (await res.json()) as Note;
      setNotes((prev) => [note, ...prev]);
      setSelectedId(note.id);
      setShowEditor(true);
      setSaveStatus("saved");
      // Focus title after render
      setTimeout(() => titleRef.current?.focus(), 50);
    } catch {
      toast.error("Could not create note");
    }
  };

  // ── Pin toggle ──────────────────────────────────────────────────────────────

  const handlePin = useCallback(
    (id: string, currentPinned: boolean) => {
      void saveNow(id, { pinned: !currentPinned });
    },
    [saveNow]
  );

  // ── Color ───────────────────────────────────────────────────────────────────

  const handleColor = useCallback(
    (id: string, color: string) => {
      void saveNow(id, { color: color || null });
      setShowColorPicker(false);
    },
    [saveNow]
  );

  // ── Delete ──────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (id: string, title: string) => {
      if (!confirm(`Delete "${title || "Untitled"}"?`)) return;
      try {
        const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
        setNotes((prev) => prev.filter((n) => n.id !== id));
        if (selectedId === id) {
          setSelectedId(null);
          setShowEditor(false);
        }
        toast.success("Note deleted");
      } catch {
        toast.error("Could not delete note");
      }
    },
    [selectedId]
  );

  // ── Formatting commands (contentEditable fallback) ─────────────────────────
  // Using textarea — no execCommand needed. Toolbar inserts markdown-style text.

  const wrapSelection = (before: string, after: string = before) => {
    const el = contentRef.current;
    if (!el || !selected) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const sel = text.slice(start, end);
    const newText = text.slice(0, start) + before + sel + after + text.slice(end);
    const patch = { content: newText };
    setNotes((prev) =>
      prev.map((n) => (n.id === selected.id ? { ...n, ...patch } : n))
    );
    scheduleSave(selected.id, patch);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + before.length, end + before.length);
      autoResize();
    }, 0);
  };

  const insertLinePrefix = (prefix: string) => {
    const el = contentRef.current;
    if (!el || !selected) return;
    const start = el.selectionStart;
    const text = el.value;
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const newText = text.slice(0, lineStart) + prefix + text.slice(lineStart);
    const patch = { content: newText };
    setNotes((prev) =>
      prev.map((n) => (n.id === selected.id ? { ...n, ...patch } : n))
    );
    scheduleSave(selected.id, patch);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length);
      autoResize();
    }, 0);
  };

  const insertLink = () => {
    const url = prompt("Enter URL:");
    if (!url) return;
    const el = contentRef.current;
    if (!el || !selected) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const sel = text.slice(start, end) || "link text";
    const newText = text.slice(0, start) + `[${sel}](${url})` + text.slice(end);
    const patch = { content: newText };
    setNotes((prev) =>
      prev.map((n) => (n.id === selected.id ? { ...n, ...patch } : n))
    );
    scheduleSave(selected.id, patch);
    setTimeout(() => {
      el.focus();
      autoResize();
    }, 0);
  };

  // ── Saved timestamp ────────────────────────────────────────────────────────

  const savedLabel =
    saveStatus === "saving"
      ? "Saving…"
      : selected
      ? `Saved ${formatDistanceToNow(new Date(selected.updatedAt), { addSuffix: true })}`
      : "";

  // ── Editor background ──────────────────────────────────────────────────────

  const editorStyle: React.CSSProperties = selected?.color
    ? { backgroundColor: selected.color }
    : {};

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 overflow-hidden font-sans bg-[#0f1321]">
      {/* ── Left: Note list ── */}
      <aside
        className={`flex flex-col w-full md:w-72 lg:w-80 shrink-0 bg-[#1b1f2e] border-r border-[rgba(0,255,255,0.1)] ${
          showEditor ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(0,255,255,0.1)]">
          <div className="flex items-center gap-2">
            <StickyNote className="w-5 h-5 text-[#a5e7ff]" />
            <h1 className="font-semibold text-[#dfe1f6] text-sm">Notes</h1>
          </div>
          <button
            onClick={handleNew}
            className="bg-[#00d2ff] text-[#003543] hover:bg-[#47d6ff] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            New Note
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-[rgba(0,255,255,0.1)]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#bbc9cf]" />
            <input
              type="search"
              placeholder="Search notes…"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="bg-[#0f1321] border border-[rgba(0,255,255,0.1)] text-[#dfe1f6] placeholder-[#bbc9cf] rounded-lg pl-9 py-2 text-sm focus:ring-2 focus:ring-[#00d2ff] w-full outline-none"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-[#bbc9cf] text-sm">
              Loading…
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 px-6 text-center">
              <StickyNote className="w-10 h-10 text-[#3c494e]" />
              <p className="text-[#bbc9cf] text-sm text-center">
                {query ? "No notes match your search." : "No notes yet. Create your first note."}
              </p>
              {!query && (
                <button
                  onClick={handleNew}
                  className="bg-[#00d2ff] text-[#003543] hover:bg-[#47d6ff] rounded-lg px-4 py-2 text-sm font-medium"
                >
                  Create note
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Pinned section */}
              {pinnedNotes.length > 0 && (
                <>
                  {hasBothSections && (
                    <div className="text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider px-4 py-2">
                      Pinned
                    </div>
                  )}
                  {pinnedNotes.map((note) => (
                    <NoteListItem
                      key={note.id}
                      note={note}
                      selected={note.id === selectedId}
                      onClick={() => {
                        setSelectedId(note.id);
                        setShowEditor(true);
                        setSaveStatus("saved");
                      }}
                      onPin={() => handlePin(note.id, note.pinned)}
                      onColor={(c) => handleColor(note.id, c)}
                      onDelete={() => void handleDelete(note.id, note.title)}
                    />
                  ))}
                </>
              )}

              {/* Other section */}
              {unpinnedNotes.length > 0 && (
                <>
                  {hasBothSections && (
                    <div className="text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider px-4 py-2">
                      Other
                    </div>
                  )}
                  {unpinnedNotes.map((note) => (
                    <NoteListItem
                      key={note.id}
                      note={note}
                      selected={note.id === selectedId}
                      onClick={() => {
                        setSelectedId(note.id);
                        setShowEditor(true);
                        setSaveStatus("saved");
                      }}
                      onPin={() => handlePin(note.id, note.pinned)}
                      onColor={(c) => handleColor(note.id, c)}
                      onDelete={() => void handleDelete(note.id, note.title)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </aside>

      {/* ── Right: Editor ── */}
      <main
        style={editorStyle}
        className={`flex flex-col flex-1 min-w-0 transition-colors duration-150 ${
          showEditor ? "flex" : "hidden md:flex"
        }${!selected?.color ? " bg-[#0f1321]" : ""}`}
      >
        {selected ? (
          <>
            {/* ── Top toolbar ── */}
            <div className="border-b border-[rgba(0,255,255,0.1)] px-4 py-2 bg-[#1b1f2e] flex items-center gap-1 flex-wrap shrink-0">
              {/* Back (mobile) */}
              <button
                onClick={() => setShowEditor(false)}
                className="md:hidden p-1.5 text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded transition-colors text-sm mr-1"
                aria-label="Back to list"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Pin */}
              <button
                onClick={() => handlePin(selected.id, selected.pinned)}
                title={selected.pinned ? "Unpin" : "Pin"}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 ${
                  selected.pinned
                    ? "bg-[#00d2ff]/10 text-[#a5e7ff] rounded p-1.5 text-sm"
                    : "p-1.5 text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded transition-colors text-sm"
                }`}
              >
                {selected.pinned ? (
                  <><PinOff className="w-3.5 h-3.5" /> Unpin</>
                ) : (
                  <><Pin className="w-3.5 h-3.5" /> Pin</>
                )}
              </button>

              {/* Color picker */}
              <div className="relative" ref={colorPickerRef}>
                <button
                  onClick={() => setShowColorPicker((v) => !v)}
                  title="Note color"
                  className="p-1.5 text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded transition-colors text-sm flex items-center gap-1.5"
                >
                  <Palette className="w-3.5 h-3.5" />
                  Color
                </button>
                {showColorPicker && (
                  <div className="absolute top-full left-0 mt-1 z-20 bg-[#1b1f2e] rounded-xl shadow-lg border border-[rgba(0,255,255,0.1)] p-2 flex gap-1.5">
                    {NOTE_COLORS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => handleColor(selected.id, c.value)}
                        title={c.label}
                        className={`w-6 h-6 rounded-full border-2 transition-transform duration-150 hover:scale-110 ${c.dot} ${
                          (selected.color ?? "") === c.value
                            ? "border-[#dfe1f6]"
                            : "border-transparent"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="w-px h-5 bg-[#3c494e] mx-1" />

              {/* Formatting toolbar */}
              <FmtBtn onClick={() => wrapSelection("**")} title="Bold">
                <Bold className="w-3.5 h-3.5" />
              </FmtBtn>
              <FmtBtn onClick={() => wrapSelection("_")} title="Italic">
                <Italic className="w-3.5 h-3.5" />
              </FmtBtn>
              <FmtBtn onClick={() => wrapSelection("__")} title="Underline">
                <Underline className="w-3.5 h-3.5" />
              </FmtBtn>
              <FmtBtn onClick={() => wrapSelection("~~")} title="Strikethrough">
                <Strikethrough className="w-3.5 h-3.5" />
              </FmtBtn>

              {/* Divider */}
              <div className="w-px h-5 bg-[#3c494e] mx-1" />

              <FmtBtn onClick={() => insertLinePrefix("- ")} title="Bullet list">
                <List className="w-3.5 h-3.5" />
              </FmtBtn>
              <FmtBtn onClick={() => insertLinePrefix("1. ")} title="Numbered list">
                <ListOrdered className="w-3.5 h-3.5" />
              </FmtBtn>

              {/* Divider */}
              <div className="w-px h-5 bg-[#3c494e] mx-1" />

              <FmtBtn onClick={() => insertLinePrefix("> ")} title="Blockquote">
                <Quote className="w-3.5 h-3.5" />
              </FmtBtn>
              <FmtBtn onClick={() => wrapSelection("`")} title="Inline code">
                <Code className="w-3.5 h-3.5" />
              </FmtBtn>
              <FmtBtn onClick={insertLink} title="Insert link">
                <Link2 className="w-3.5 h-3.5" />
              </FmtBtn>

              {/* Spacer + save status + delete */}
              <div className="flex-1" />

              <span className="text-xs text-[#859399] whitespace-nowrap" aria-label="save status">
                {savedLabel}
              </span>

              <button
                onClick={() => void handleDelete(selected.id, selected.title)}
                title="Delete note"
                className="text-[#ff4d6d] hover:text-[#ff4d6d]/80 hover:bg-[#ff4d6d]/10 p-1.5 rounded-md transition-colors ml-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Title */}
            <input
              ref={titleRef}
              type="text"
              value={selected.title}
              onChange={(e) => scheduleSave(selected.id, { title: e.target.value })}
              placeholder="Untitled"
              className="text-xl font-bold text-[#dfe1f6] border-none bg-transparent focus:ring-0 outline-none w-full px-6 pt-6 pb-2 placeholder-[#3c494e]"
            />

            {/* Content (auto-resizing textarea) */}
            <textarea
              ref={contentRef}
              value={selected.content}
              onChange={(e) => {
                scheduleSave(selected.id, { content: e.target.value });
                autoResize();
              }}
              onFocus={autoResize}
              placeholder="Start writing…"
              rows={1}
              className="text-sm text-[#dfe1f6] leading-relaxed w-full px-6 py-3 bg-transparent border-none outline-none resize-none placeholder-[#3c494e] overflow-hidden"
              style={{ minHeight: "200px" }}
            />
          </>
        ) : (
          /* ── Empty state ── */
          <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center px-8">
            <StickyNote className="w-16 h-16 text-[#3c494e]" />
            <div>
              <p className="text-[#bbc9cf] text-sm text-center">
                Select a note or create one
              </p>
              <p className="text-[#bbc9cf] text-sm text-center mt-1">
                Pick a note from the list or create a new one.
              </p>
            </div>
            <button
              onClick={handleNew}
              className="bg-[#00d2ff] text-[#003543] hover:bg-[#47d6ff] rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Note
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
