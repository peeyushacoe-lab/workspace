"use client";

/**
 * Nexus Notes — Notion + Keep + OneNote competitor
 * Features: rich text, folders/tags, pinning, colors, markdown-aware,
 * search, AI (summarize/title/action items/convert), wiki backlinks,
 * checklists, code blocks, images, attachments
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus, Search, Trash2, Pin, PinOff, StickyNote, Palette, MoreVertical,
Folder, Check, X, Sparkles, Loader2,   Bold, Italic, Strikethrough, Code, List, ListOrdered, ListChecks,
  Quote, Minus, Link2, Image as ImageIcon, Type, Hash,   Download, Copy,
  LayoutTemplate, WifiOff, Mic, Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

type Note = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  color: string | null;
  folder: string | null;
  createdAt: string;
  updatedAt: string;
};

type Folder = { id: string; name: string };

const NOTE_COLORS = [
  { label: "Default", value: "",           bg: "bg-white",          border: "border-[#e8eaed]", dot: "#e8eaed" },
  { label: "Blue",    value: "#dbeafe",    bg: "bg-blue-50",        border: "border-blue-200",  dot: "#93c5fd" },
  { label: "Green",   value: "#dcfce7",    bg: "bg-emerald-50",     border: "border-emerald-200", dot: "#6ee7b7" },
  { label: "Yellow",  value: "#fef9c3",    bg: "bg-yellow-50",      border: "border-yellow-200", dot: "#fde047" },
  { label: "Red",     value: "#fee2e2",    bg: "bg-red-50",         border: "border-red-200",   dot: "#fca5a5" },
  { label: "Purple",  value: "#f3e8ff",    bg: "bg-purple-50",      border: "border-purple-200", dot: "#d8b4fe" },
  { label: "Orange",  value: "#ffedd5",    bg: "bg-orange-50",      border: "border-orange-200", dot: "#fdba74" },
  { label: "Grey",    value: "#f1f3f4",    bg: "bg-[#f1f3f4]",      border: "border-[#d0d5dd]", dot: "#bdc1c6" },
];

function getNoteColor(color: string | null) {
  return NOTE_COLORS.find(c => c.value === (color ?? "")) ?? NOTE_COLORS[0];
}

function notePreview(content: string): string {
  return content.replace(/<[^>]+>/g, "").replace(/\n/g, " ").slice(0, 100) || "Empty note";
}

function countWords(content: string): number {
  return content.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

// ─── Note templates ─────────────────────────────────────────────────────────────

const NOTE_TEMPLATES: { id: string; label: string; html: string }[] = [
  {
    id: "meeting",
    label: "Meeting notes",
    html: [
      "<h2>Meeting notes</h2>",
      "<p><strong>Date:</strong> &nbsp; &nbsp; <strong>Attendees:</strong></p>",
      "<p><strong>Agenda</strong></p>",
      "<ul><li>Topic one</li><li>Topic two</li></ul>",
      "<p><strong>Notes</strong></p>",
      "<p>Discussion notes…</p>",
      "<p><strong>Action items</strong></p>",
      '<p><input type="checkbox"> Owner — task</p>',
      '<p><input type="checkbox"> Owner — task</p>',
    ].join(""),
  },
  {
    id: "todo",
    label: "To-do list",
    html: [
      "<h2>To-do list</h2>",
      '<p><input type="checkbox"> First task</p>',
      '<p><input type="checkbox"> Second task</p>',
      '<p><input type="checkbox"> Third task</p>',
      '<p><input type="checkbox"> Fourth task</p>',
    ].join(""),
  },
  {
    id: "journal",
    label: "Daily journal",
    html: [
      "<h2>Daily journal</h2>",
      "<p><strong>Today I&rsquo;m grateful for</strong></p>",
      "<ul><li></li></ul>",
      "<p><strong>What happened today</strong></p>",
      "<p>Write about your day…</p>",
      "<p><strong>Top priorities for tomorrow</strong></p>",
      '<p><input type="checkbox"> Priority one</p>',
      '<p><input type="checkbox"> Priority two</p>',
    ].join(""),
  },
];

function notesDraftKey(id: string): string {
  return "nexus_notes_draft_" + id;
}

// ─── Toolbar button ───────────────────────────────────────────────────────────

function TB({ icon, title, active, onClick }: {
  icon: React.ReactNode; title: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button title={title} onClick={onClick}
      className={`flex items-center justify-center h-6 w-6 rounded text-xs transition-colors ${active ? "bg-[#e8f0fe] text-[#1a56db]" : "text-[#5f6368] hover:bg-[#f1f3f4]"}`}>
      {icon}
    </button>
  );
}

// ─── Simple rich-text editor ──────────────────────────────────────────────────

function RichEditor({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastValue = useRef(value);

  // ── Voice recording state ──
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Size / duration caps
  const MAX_AUDIO_SECONDS = 5 * 60; // ~5 minutes
  const MAX_FILE_BYTES = 3 * 1024 * 1024; // ~3 MB

  useEffect(() => {
    if (ref.current && value !== lastValue.current) {
      ref.current.innerHTML = value;
      lastValue.current = value;
    }
  }, [value]);

  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    if (ref.current) { onChange(ref.current.innerHTML); lastValue.current = ref.current.innerHTML; }
    ref.current?.focus();
  };

  const insertBlock = (html: string) => {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !ref.current?.contains(sel.anchorNode)) {
      ref.current?.focus();
    }
    document.execCommand("insertHTML", false, html);
    if (ref.current) { onChange(ref.current.innerHTML); lastValue.current = ref.current.innerHTML; }
  };

  // ── Clean up recording resources ──
  const stopMediaStream = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch { /* ignore */ }
      stopMediaStream();
    };
  }, [stopMediaStream]);

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      try { mr.stop(); } catch { /* ignore */ }
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Audio recording is not supported in this browser");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Microphone access denied");
      return;
    }
    mediaStreamRef.current = stream;
    chunksRef.current = [];
    let mr: MediaRecorder;
    try {
      mr = new MediaRecorder(stream);
    } catch {
      toast.error("Recording is not supported in this browser");
      stopMediaStream();
      return;
    }
    mediaRecorderRef.current = mr;

    mr.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      const type = mr.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      stopMediaStream();
      setRecording(false);
      setElapsed(0);
      if (blob.size === 0) { toast.error("No audio captured"); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl) { toast.error("Failed to process recording"); return; }
        insertBlock('<audio controls src="' + dataUrl + '" style="display:block;margin:8px 0;max-width:100%"></audio><p><br></p>');
        toast.success("Voice note added");
      };
      reader.onerror = () => toast.error("Failed to process recording");
      reader.readAsDataURL(blob);
    };

    mr.start();
    setRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed(prev => {
        const next = prev + 1;
        if (next >= MAX_AUDIO_SECONDS) {
          toast.message("Recording limit reached (5 min)");
          stopRecording();
        }
        return next;
      });
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopMediaStream, stopRecording]);

  const toggleRecording = useCallback(() => {
    if (recording) stopRecording();
    else void startRecording();
  }, [recording, startRecording, stopRecording]);

  // ── File attachment ──
  const handleAttachFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error("File too large (max 3 MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) { toast.error("Failed to read file"); return; }
      const safeName = (file.name || "attachment").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      if (file.type.startsWith("image/")) {
        insertBlock('<img src="' + dataUrl + '" alt="' + safeName + '" style="max-width:100%;border-radius:8px;margin:8px 0"><p><br></p>');
      } else {
        const chip = '<a href="' + dataUrl + '" download="' + safeName + '" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;margin:2px 0;background:#f1f3f4;border:1px solid #e8eaed;border-radius:8px;color:#1a56db;text-decoration:none;font-size:13px">📎 ' + safeName + '</a>';
        insertBlock(chip + '<p><br></p>');
      }
      toast.success("Attachment added");
    };
    reader.onerror = () => toast.error("Failed to read file");
    reader.readAsDataURL(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatElapsed = (s: number): string => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m + ":" + (sec < 10 ? "0" + sec : String(sec));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Mini toolbar */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-[#e8eaed] bg-white flex-wrap">
        <TB icon={<Bold className="h-3 w-3" />} title="Bold" onClick={() => exec("bold")} />
        <TB icon={<Italic className="h-3 w-3" />} title="Italic" onClick={() => exec("italic")} />
        <TB icon={<Strikethrough className="h-3 w-3" />} title="Strikethrough" onClick={() => exec("strikeThrough")} />
        <TB icon={<Code className="h-3 w-3" />} title="Code" onClick={() => insertBlock("<code>code</code>")} />
        <div className="w-px h-4 bg-[#e8eaed] mx-0.5" />
        <TB icon={<List className="h-3 w-3" />} title="Bullet list" onClick={() => exec("insertUnorderedList")} />
        <TB icon={<ListOrdered className="h-3 w-3" />} title="Numbered list" onClick={() => exec("insertOrderedList")} />
        <TB icon={<ListChecks className="h-3 w-3" />} title="Checklist" onClick={() => insertBlock('<p><input type="checkbox"> </p>')} />
        <div className="w-px h-4 bg-[#e8eaed] mx-0.5" />
        <TB icon={<Quote className="h-3 w-3" />} title="Quote" onClick={() => insertBlock("<blockquote></blockquote>")} />
        <TB icon={<Type className="h-3 w-3" />} title="Code block" onClick={() => insertBlock("<pre><code></code></pre>")} />
        <TB icon={<Minus className="h-3 w-3" />} title="Divider" onClick={() => insertBlock("<hr>")} />
        <TB icon={<Link2 className="h-3 w-3" />} title="Link" onClick={() => { const u = prompt("URL:"); if (u) exec("createLink", u); }} />
        <TB icon={<ImageIcon className="h-3 w-3" />} title="Image" onClick={() => { const u = prompt("Image URL:"); if (u) insertBlock(`<img src="${u}" style="max-width:100%;border-radius:8px;margin:8px 0">`); }} />
        <TB icon={<Hash className="h-3 w-3" />} title="H2 Heading" onClick={() => exec("formatBlock", "h2")} />
        <div className="w-px h-4 bg-[#e8eaed] mx-0.5" />
        <TB icon={<Paperclip className="h-3 w-3" />} title="Attach file" onClick={() => fileInputRef.current?.click()} />
        <button
          title={recording ? "Stop recording" : "Record voice note"}
          onClick={toggleRecording}
          className={`flex items-center justify-center h-6 rounded text-xs transition-colors ${recording ? "px-1.5 gap-1 bg-red-50 text-[#ea4335]" : "w-6 text-[#5f6368] hover:bg-[#f1f3f4]"}`}>
          {recording ? <span className="h-2 w-2 rounded-full bg-[#ea4335] animate-pulse" /> : <Mic className="h-3 w-3" />}
          {recording && <span className="text-[11px] font-medium tabular-nums">{formatElapsed(elapsed)}</span>}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleAttachFile}
        />
      </div>
      {/* Content area */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder ?? "Start writing…"}
        className="flex-1 overflow-y-auto px-4 py-4 text-sm text-[#202124] leading-7 focus:outline-none notes-editor"
        onInput={() => { if (ref.current) { onChange(ref.current.innerHTML); lastValue.current = ref.current.innerHTML; } }}
      />
    </div>
  );
}

// ─── Note card (grid view) ────────────────────────────────────────────────────

function NoteCard({ note, selected, onSelect, onPin, onDelete, onColor }: {
  note: Note; selected: boolean;
  onSelect: () => void;
  onPin: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onColor: (color: string, e: React.MouseEvent) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const _colorInfo = getNoteColor(note.color);

  return (
    <div
      onClick={onSelect}
      className={`relative group rounded-xl border-2 p-3 cursor-pointer transition-all hover:shadow-md ${_colorInfo.bg} ${selected ? "border-[#1a56db]" : _colorInfo.border} hover:border-[#1a56db]/40`}
      style={{ minHeight: 120 }}
    >
      {note.pinned && <Pin className="absolute top-2 right-2 h-3.5 w-3.5 text-[#f4b400]" />}
      <p className="text-xs font-semibold text-[#202124] mb-1 pr-5 line-clamp-2">{note.title || "Untitled"}</p>
      <p className="text-[11px] text-[#5f6368] line-clamp-4 leading-relaxed">{notePreview(note.content)}</p>
      <p className="text-[10px] text-[#bdc1c6] mt-2">{formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}</p>

      {/* Hover actions */}
      <div className="absolute bottom-2 right-2 hidden group-hover:flex items-center gap-1">
        <button onClick={e => { e.stopPropagation(); setShowMenu(v => !v); }}
          className="p-1 rounded bg-white/80 text-[#5f6368] hover:text-[#202124] shadow-sm"><MoreVertical className="h-3 w-3" /></button>
        {showMenu && (
          <div className="absolute bottom-full right-0 mb-1 w-36 bg-white border border-[#e8eaed] rounded-lg shadow-lg z-50 py-1" onClick={e => e.stopPropagation()}>
            <button onClick={e => { onPin(e); setShowMenu(false); }} className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs text-[#202124] hover:bg-[#f1f3f4]">
              {note.pinned ? <><PinOff className="h-3 w-3" /> Unpin</> : <><Pin className="h-3 w-3" /> Pin</>}
            </button>
            <div className="px-3 py-1.5 text-[10px] text-[#80868b] uppercase tracking-wider">Color</div>
            <div className="grid grid-cols-4 gap-1 px-3 pb-2">
              {NOTE_COLORS.map(c => (
                <button key={c.value} title={c.label} onClick={e => { onColor(c.value, e); setShowMenu(false); }}
                  className="h-5 w-5 rounded-full border border-[#e8eaed] hover:scale-110 transition-transform"
                  style={{ background: c.value || "#ffffff" }} />
              ))}
            </div>
            <button onClick={e => { onDelete(e); setShowMenu(false); }} className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs text-[#ea4335] hover:bg-red-50 border-t border-[#e8eaed]">
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NotesView() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [search, setSearch] = useState("");
  const [_viewMode, _setViewMode] = useState<"grid" | "list">("grid");

  // Folders & tags (local state — extend to API as needed)
  const [folders] = useState<Folder[]>([
    { id: "all", name: "All Notes" },
    { id: "personal", name: "Personal" },
    { id: "work", name: "Work" },
    { id: "meetings", name: "Meetings" },
  ]);
  const [activeFolder, setActiveFolder] = useState("all");
  const [_activeTag, _setActiveTag] = useState<string | null>(null);

  // UI
  const [showAI, setShowAI] = useState(false);
  const [aiMode, setAIMode] = useState<"summarize" | "title" | "actions" | "convert">("summarize");
  const [aiLoading, setAILoading] = useState(false);
  const [aiResult, setAIResult] = useState("");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load notes ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/notes")
      .then(r => r.json())
      .then((d: Note[]) => { setNotes(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // ── Offline indicator ─────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator !== "undefined") setIsOffline(!navigator.onLine);
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // ── Select note ───────────────────────────────────────────────────────────
  const selectNote = useCallback((note: Note) => {
    setSelectedId(note.id);

    let nextTitle = note.title;
    let nextContent = note.content;
    // Restore from offline draft if we have no network.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      try {
        const raw = localStorage.getItem(notesDraftKey(note.id));
        if (raw) {
          const draft = JSON.parse(raw) as { title?: string; content?: string };
          if (typeof draft.title === "string") nextTitle = draft.title;
          if (typeof draft.content === "string") nextContent = draft.content;
        }
      } catch { /* ignore corrupt draft */ }
    }

    setTitle(nextTitle);
    setContent(nextContent);
    setAIResult("");
  }, []);

  // ── Create note ───────────────────────────────────────────────────────────
  const createNote = async () => {
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", content: "", color: "", folder: activeFolder !== "all" ? activeFolder : null }),
    });
    if (!res.ok) return toast.error("Failed to create note");
    const note = await res.json() as Note;
    setNotes(prev => [note, ...prev]);
    selectNote(note);
  };

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const scheduleSave = useCallback((t: string, c: string) => {
    if (!selectedId) return;

    // Cache the latest draft locally right away for offline recovery.
    try {
      localStorage.setItem(notesDraftKey(selectedId), JSON.stringify({ title: t, content: c }));
    } catch { /* storage may be full / unavailable */ }

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch(`/api/notes/${selectedId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: t, content: c }),
        });
        setNotes(prev => prev.map(n => n.id === selectedId ? { ...n, title: t, content: c, updatedAt: new Date().toISOString() } : n));
      } finally { setSaving(false); }
    }, 1200);
  }, [selectedId]);

  const updateTitle = (t: string) => { setTitle(t); scheduleSave(t, content); };
  const updateContent = (c: string) => { setContent(c); scheduleSave(title, c); };

  // ── Delete note ───────────────────────────────────────────────────────────
  const deleteNote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
    setNotes(prev => prev.filter(n => n.id !== id));
    if (selectedId === id) { setSelectedId(null); setTitle(""); setContent(""); }
    toast.success("Note deleted");
  };

  // ── Pin note ──────────────────────────────────────────────────────────────
  const pinNote = async (id: string, pinned: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/notes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned: !pinned }) });
    setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned: !pinned } : n));
  };

  // ── Color note ────────────────────────────────────────────────────────────
  const colorNote = async (id: string, color: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    await fetch(`/api/notes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ color }) });
    setNotes(prev => prev.map(n => n.id === id ? { ...n, color } : n));
    setShowColorPicker(false);
  };

  // ── Move note to folder ───────────────────────────────────────────────────
  const moveToFolder = async (id: string, folder: string) => {
    const value = folder || null;
    await fetch(`/api/notes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder: value }) });
    setNotes(prev => prev.map(n => n.id === id ? { ...n, folder: value } : n));
  };

  // ── Templates ─────────────────────────────────────────────────────────────
  const applyTemplate = (tpl: { id: string; label: string; html: string }) => {
    if (!selectedId) return;
    const nextTitle = title && title.trim() ? title : tpl.label;
    setTitle(nextTitle);
    // Reuse the editor's content-setting + save path.
    updateContent(tpl.html);
    if (nextTitle !== title) scheduleSave(nextTitle, tpl.html);
    setShowTemplateMenu(false);
    toast.success(tpl.label + " template applied");
  };

  // ── Duplicate note ────────────────────────────────────────────────────────
  const duplicateNote = async () => {
    if (!selectedId) return;
    const note = notes.find(n => n.id === selectedId);
    if (!note) return;
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `${note.title} (copy)`, content: note.content, color: note.color ?? "" }),
    });
    if (res.ok) {
      const n = await res.json() as Note;
      setNotes(prev => [n, ...prev]);
      toast.success("Note duplicated");
    }
  };

  // ── Export note ───────────────────────────────────────────────────────────
  const exportNote = () => {
    const text = `# ${title}\n\n${content.replace(/<[^>]+>/g, "")}`;
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${title || "note"}.txt`; a.click();
  };

  // ── AI ────────────────────────────────────────────────────────────────────
  const runAI = async () => {
    if (!content.trim() && aiMode !== "title") return toast.error("Note is empty");
    setAILoading(true); setAIResult("");
    const text = content.replace(/<[^>]+>/g, " ").slice(0, 3000);
    const prompts: Record<string, string> = {
      summarize: `Summarize these notes concisely in 2-3 sentences:\n\n${text}`,
      title:     `Generate a concise, descriptive title for this note. Return only the title:\n\n${text}`,
      actions:   `Extract all action items and tasks from these notes. List them as bullet points:\n\n${text}`,
      convert:   `Convert these rough notes into a well-structured document with clear headings, proper sentences, and organized sections:\n\n${text}`,
    };
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompts[aiMode] }),
      });
      const d = await res.json() as { reply?: string; message?: string };
      setAIResult(d.reply ?? d.message ?? "");
    } catch { setAIResult("Failed to get AI response"); }
    finally { setAILoading(false); }
  };

  const applyAIResult = () => {
    if (!aiResult) return;
    if (aiMode === "title") {
      updateTitle(aiResult.replace(/^["']|["']$/g, "").trim());
    } else if (aiMode === "actions") {
      updateContent(content + `<hr><h3>Action Items</h3><p>${aiResult.replace(/\n/g, "<br>")}</p>`);
    } else {
      updateContent(content + `<hr><h3>AI Summary</h3><p>${aiResult.replace(/\n/g, "<br>")}</p>`);
    }
    toast.success("Applied");
    setShowAI(false);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredNotes = notes.filter(n => {
    const q = search.toLowerCase();
    const matchesSearch = !q || n.title.toLowerCase().includes(q) || notePreview(n.content).toLowerCase().includes(q);
    const matchesFolder = activeFolder === "all" || n.folder === activeFolder;
    return matchesSearch && matchesFolder;
  });
  const pinnedNotes = filteredNotes.filter(n => n.pinned);
  const unpinnedNotes = filteredNotes.filter(n => !n.pinned);
  const selectedNote = notes.find(n => n.id === selectedId);
  const _colorInfo = getNoteColor(selectedNote?.color ?? null);
  const words = countWords(content);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-white overflow-hidden text-[#202124]" onClick={() => { setShowColorPicker(false); setShowTemplateMenu(false); }}>

      {/* ── Left sidebar (folders + list) ── */}
      <aside className="w-72 flex flex-col border-r border-[#e8eaed] bg-[#f8f9fa] overflow-hidden flex-shrink-0">

        {/* New note */}
        <div className="p-3 border-b border-[#e8eaed]">
          <button onClick={() => void createNote()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7] transition-colors">
            <Plus className="h-4 w-4" /> New note
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-[#e8eaed]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#80868b]" />
            <input className="w-full pl-8 pr-2 py-1.5 text-xs bg-white border border-[#e8eaed] rounded-lg placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60"
              placeholder="Search notes…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {/* Folder list */}
        <div className="px-2 py-2 border-b border-[#e8eaed]">
          <p className="px-2 text-[10px] font-semibold text-[#80868b] uppercase tracking-wider mb-1">Folders</p>
          {folders.map(f => (
            <button key={f.id} onClick={() => setActiveFolder(f.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg transition-colors ${activeFolder === f.id ? "bg-[#e8f0fe] text-[#1a56db] font-semibold" : "text-[#5f6368] hover:bg-[#e8eaed]"}`}>
              <Folder className="h-3.5 w-3.5" /> {f.name}
              <span className="ml-auto text-[10px] text-[#bdc1c6]">
                {f.id === "all" ? notes.length : 0}
              </span>
            </button>
          ))}
        </div>

        {/* Note list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#1a56db]" /></div>
          ) : (
            <>
              {pinnedNotes.length > 0 && (
                <div className="pt-2">
                  <p className="px-3 py-1 text-[10px] font-semibold text-[#80868b] uppercase tracking-wider">Pinned</p>
                  {pinnedNotes.map(n => <NoteListItem key={n.id} note={n} selected={n.id === selectedId} onClick={() => selectNote(n)} />)}
                </div>
              )}
              {unpinnedNotes.length > 0 && (
                <div className="pt-2">
                  {pinnedNotes.length > 0 && <p className="px-3 py-1 text-[10px] font-semibold text-[#80868b] uppercase tracking-wider">Notes</p>}
                  {unpinnedNotes.map(n => <NoteListItem key={n.id} note={n} selected={n.id === selectedId} onClick={() => selectNote(n)} />)}
                </div>
              )}
              {filteredNotes.length === 0 && (
                <div className="text-center py-10 px-4">
                  <StickyNote className="h-10 w-10 text-[#bdc1c6] mx-auto mb-2" />
                  <p className="text-xs text-[#80868b]">{search ? "No matching notes" : "No notes yet"}</p>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* ── Editor ── */}
      {selectedId && selectedNote ? (
        <div className={`flex flex-col flex-1 min-w-0 overflow-hidden ${_colorInfo.bg}`}>

          {/* Note toolbar */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e8eaed] bg-white z-10">
            <input
              className="flex-1 text-base font-semibold text-[#202124] bg-transparent border-none outline-none focus:bg-[#f1f3f4] rounded px-1 min-w-0"
              value={title}
              placeholder="Note title"
              onChange={e => updateTitle(e.target.value)}
            />

            {isOffline && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-[#f4b400]">
                <WifiOff className="h-3.5 w-3.5" /> Offline — editing locally
              </span>
            )}

            <div className="flex items-center gap-1 text-[11px] text-[#80868b]">
              {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</> : "Saved"}
            </div>

            <span className="text-[11px] text-[#bdc1c6]">{words} words</span>

            {/* Templates */}
            <div className="relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowTemplateMenu(v => !v)} title="Templates"
                className={`p-1.5 rounded transition-colors ${showTemplateMenu ? "bg-[#e8f0fe] text-[#1a56db]" : "text-[#5f6368] hover:bg-[#f1f3f4]"}`}>
                <LayoutTemplate className="h-4 w-4" />
              </button>
              {showTemplateMenu && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-[#e8eaed] rounded-lg shadow-lg z-50 py-1">
                  <p className="px-3 py-1 text-[10px] font-medium text-[#80868b]">Quick templates</p>
                  {NOTE_TEMPLATES.map(tpl => (
                    <button key={tpl.id} onClick={() => applyTemplate(tpl)}
                      className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs text-[#202124] hover:bg-[#f1f3f4]">
                      <StickyNote className="h-3.5 w-3.5 text-[#5f6368]" /> {tpl.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Folder selector */}
            <select
              title="Move to folder"
              value={selectedNote.folder ?? ""}
              onChange={e => void moveToFolder(selectedId, e.target.value)}
              className="text-xs border border-[#e8eaed] rounded-lg px-2 py-1 bg-white text-[#5f6368] focus:outline-none focus:border-[#1a56db]/60 cursor-pointer"
            >
              <option value="">No folder</option>
              {folders.filter(f => f.id !== "all").map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>

            {/* Color picker */}
            <div className="relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowColorPicker(v => !v)} title="Note color" className="p-1.5 rounded text-[#5f6368] hover:bg-[#f1f3f4]">
                <Palette className="h-4 w-4" />
              </button>
              {showColorPicker && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-[#e8eaed] rounded-lg shadow-lg z-50 p-2">
                  <div className="grid grid-cols-4 gap-1.5">
                    {NOTE_COLORS.map(c => (
                      <button key={c.value} title={c.label} onClick={() => void colorNote(selectedId, c.value)}
                        className={`h-7 w-7 rounded-lg border-2 transition-transform hover:scale-110 ${selectedNote.color === c.value ? "border-[#1a56db]" : "border-transparent"}`}
                        style={{ background: c.value || "#ffffff", border: c.value ? undefined : "2px dashed #e8eaed" }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button onClick={() => { void pinNote(selectedId, selectedNote.pinned, new MouseEvent("click") as unknown as React.MouseEvent); }} title={selectedNote.pinned ? "Unpin" : "Pin"}
              className={`p-1.5 rounded transition-colors ${selectedNote.pinned ? "text-[#f4b400] bg-amber-50" : "text-[#5f6368] hover:bg-[#f1f3f4]"}`}>
              {selectedNote.pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
            </button>

            <button onClick={() => setShowAI(v => !v)} title="AI assistant"
              className={`p-1.5 rounded transition-colors ${showAI ? "text-purple-600 bg-purple-50" : "text-[#5f6368] hover:bg-[#f1f3f4]"}`}>
              <Sparkles className="h-4 w-4" />
            </button>

            <button onClick={duplicateNote} title="Duplicate" className="p-1.5 rounded text-[#5f6368] hover:bg-[#f1f3f4]"><Copy className="h-4 w-4" /></button>
            <button onClick={exportNote} title="Export" className="p-1.5 rounded text-[#5f6368] hover:bg-[#f1f3f4]"><Download className="h-4 w-4" /></button>
            <button onClick={e => void deleteNote(selectedId, e)} title="Delete" className="p-1.5 rounded text-[#5f6368] hover:text-[#ea4335] hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
          </div>

          {/* Editor + AI panel */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 overflow-hidden flex flex-col">
              <RichEditor
                value={content}
                onChange={updateContent}
                placeholder="Start writing your note…"
              />
            </div>

            {/* AI sidebar */}
            {showAI && (
              <div className="w-72 border-l border-[#e8eaed] bg-white flex flex-col flex-shrink-0">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8eaed]">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#202124]">
                    <Sparkles className="h-4 w-4 text-purple-600" /> AI Notes
                  </div>
                  <button onClick={() => setShowAI(false)} className="text-[#80868b] hover:text-[#202124]"><X className="h-4 w-4" /></button>
                </div>
                <div className="flex border-b border-[#e8eaed]">
                  {(["summarize","title","actions","convert"] as const).map(m => (
                    <button key={m} onClick={() => setAIMode(m)}
                      className={`flex-1 py-1.5 text-[10px] font-medium capitalize transition-colors ${aiMode === m ? "text-purple-600 border-b-2 border-purple-600" : "text-[#5f6368] hover:text-[#202124]"}`}>
                      {m === "actions" ? "Tasks" : m}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <p className="text-xs text-[#5f6368]">
                    {aiMode === "summarize" && "Get a quick summary of your note."}
                    {aiMode === "title" && "Generate a smart title based on content."}
                    {aiMode === "actions" && "Extract action items and tasks."}
                    {aiMode === "convert" && "Convert rough notes to a structured document."}
                  </p>
                  <button onClick={() => void runAI()} disabled={aiLoading}
                    className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
                    {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {aiLoading ? "Thinking…" : `Run: ${aiMode}`}
                  </button>
                  {aiResult && (
                    <>
                      <div className="bg-[#f8f9fa] rounded-lg p-3 text-xs text-[#202124] whitespace-pre-wrap leading-relaxed border border-[#e8eaed] max-h-52 overflow-y-auto">{aiResult}</div>
                      <button onClick={applyAIResult}
                        className="w-full py-2 text-xs font-semibold text-[#1a56db] border border-[#1a56db]/30 rounded-lg hover:bg-[#e8f0fe]">
                        <Check className="h-3 w-3 inline mr-1" />
                        {aiMode === "title" ? "Apply as title" : aiMode === "convert" ? "Replace content" : "Append to note"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer meta */}
          <div className="flex items-center gap-4 px-4 py-1.5 border-t border-[#e8eaed] bg-white text-[10px] text-[#80868b]">
            <span>Created {format(new Date(selectedNote.createdAt), "MMM d, yyyy")}</span>
            <span>Updated {formatDistanceToNow(new Date(selectedNote.updatedAt), { addSuffix: true })}</span>
            <span>{words} words</span>
          </div>
        </div>
      ) : (
        /* Grid view */
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8eaed]">
            <h2 className="text-sm font-semibold text-[#202124]">
              {folders.find(f => f.id === activeFolder)?.name ?? "All Notes"}
              <span className="ml-2 text-[#80868b] font-normal">{filteredNotes.length}</span>
            </h2>
            <button onClick={() => void createNote()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7]">
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#1a56db]" /></div>
            ) : filteredNotes.length === 0 ? (
              <div className="text-center py-16">
                <StickyNote className="h-12 w-12 text-[#bdc1c6] mx-auto mb-3" />
                <p className="text-sm font-semibold text-[#202124] mb-1">No notes yet</p>
                <p className="text-xs text-[#5f6368] mb-4">Create your first note to get started</p>
                <button onClick={() => void createNote()} className="px-4 py-2 text-sm font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7]">
                  <Plus className="h-3.5 w-3.5 inline mr-1" /> New note
                </button>
              </div>
            ) : (
              <>
                {pinnedNotes.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-[#5f6368] mb-2 flex items-center gap-1"><Pin className="h-3 w-3 text-[#f4b400]" /> Pinned</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {pinnedNotes.map(n => (
                        <NoteCard key={n.id} note={n} selected={n.id === selectedId}
                          onSelect={() => selectNote(n)}
                          onPin={e => void pinNote(n.id, n.pinned, e)}
                          onDelete={e => void deleteNote(n.id, e)}
                          onColor={(c, e) => void colorNote(n.id, c, e)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {unpinnedNotes.length > 0 && (
                  <div>
                    {pinnedNotes.length > 0 && <p className="text-xs font-semibold text-[#5f6368] mb-2">Notes</p>}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {unpinnedNotes.map(n => (
                        <NoteCard key={n.id} note={n} selected={n.id === selectedId}
                          onSelect={() => selectNote(n)}
                          onPin={e => void pinNote(n.id, n.pinned, e)}
                          onDelete={e => void deleteNote(n.id, e)}
                          onColor={(c, e) => void colorNote(n.id, c, e)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Note list item (sidebar) ─────────────────────────────────────────────────

function NoteListItem({ note, selected, onClick }: { note: Note; selected: boolean; onClick: () => void }) {
  const _colorInfo = getNoteColor(note.color);
  return (
    <div onClick={onClick}
      className={`flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors ${selected ? "bg-[#e8f0fe]" : "hover:bg-[#e8eaed]"}`}>
      <div className="h-3.5 w-3.5 rounded-full mt-0.5 flex-shrink-0 border-2" style={{ background: note.color || "#f8f9fa", borderColor: note.color ? note.color : "#e8eaed" }} />
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${selected ? "text-[#1a56db]" : "text-[#202124]"}`}>
          {note.title || "Untitled"}
          {note.pinned && <Pin className="inline h-2.5 w-2.5 text-[#f4b400] ml-1" />}
        </p>
        <p className="text-[10px] text-[#80868b] truncate">{notePreview(note.content)}</p>
        <p className="text-[10px] text-[#bdc1c6]">{formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}</p>
      </div>
    </div>
  );
}
