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
  LayoutTemplate, WifiOff, Mic, Paperclip, Archive, ArchiveRestore, Bell, BellOff, Tag,
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
  { label: "Default", value: "",           bg: "bg-[#12151D]",          border: "border-[#262A35]", dot: "#262A35" },
  { label: "Blue",    value: "#0E2532",    bg: "bg-blue-500/10",        border: "border-blue-500/20",  dot: "#93c5fd" },
  { label: "Green",   value: "#dcfce7",    bg: "bg-emerald-500/10",     border: "border-emerald-500/20", dot: "#6ee7b7" },
  { label: "Yellow",  value: "#fef9c3",    bg: "bg-yellow-500/10",      border: "border-yellow-500/20", dot: "#fde047" },
  { label: "Red",     value: "#fee2e2",    bg: "bg-red-500/10",         border: "border-red-500/20",   dot: "#fca5a5" },
  { label: "Purple",  value: "#f3e8ff",    bg: "bg-purple-500/10",      border: "border-purple-500/20", dot: "#d8b4fe" },
  { label: "Orange",  value: "#ffedd5",    bg: "bg-orange-500/10",      border: "border-orange-500/20", dot: "#fdba74" },
  { label: "Grey",    value: "#1B1F2A",    bg: "bg-[#1B1F2A]",      border: "border-[#2E333F]", dot: "#bdc1c6" },
];

function getNoteColor(color: string | null) {
  return NOTE_COLORS.find(c => c.value === (color ?? "")) ?? NOTE_COLORS[0];
}

function notePreview(content: string): string {
  return getBody(content).replace(/<[^>]+>/g, "").replace(/\n/g, " ").slice(0, 100) || "Empty note";
}

function countWords(content: string): number {
  return getBody(content).replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

function getNoteTags(_title: string, content: string): string[] {
  try { const p = JSON.parse(content); return Array.isArray(p?.tags) ? p.tags : []; } catch { return []; }
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

// ─── Content JSON helpers (tags stored inside content JSON) ──────────────────

type ContentJSON = { body: string; tags?: string[] };

/** Parse the content string: if it's JSON with a body field, use that; else treat whole string as body. */
function parseContent(raw: string): ContentJSON {
  if (!raw) return { body: "", tags: [] };
  try {
    const obj = JSON.parse(raw) as unknown;
    if (obj && typeof obj === "object" && "body" in (obj as object)) {
      const o = obj as { body: unknown; tags?: unknown };
      return {
        body: typeof o.body === "string" ? o.body : "",
        tags: Array.isArray(o.tags) ? (o.tags as string[]).filter(t => typeof t === "string") : [],
      };
    }
  } catch { /* not JSON */ }
  return { body: raw, tags: [] };
}

/** Encode body + tags back into a JSON string for storage. */
function encodeContent(body: string, tags: string[]): string {
  return JSON.stringify({ body, tags });
}

/** Extract just the HTML body from a raw content string. */
function getBody(raw: string): string {
  return parseContent(raw).body;
}

/** Extract tags from a raw content string. */
function getTags(raw: string): string[] {
  return parseContent(raw).tags ?? [];
}

// ─── Archive + reminders (client-side localStorage) ──────────────────────────

const ARCHIVE_KEY = "nexus_notes_archived";
const REMINDERS_KEY = "nexus_notes_reminders";

function loadArchived(): Set<string> {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch { /* ignore */ }
  return new Set();
}

function saveArchived(set: Set<string>) {
  try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify([...set])); } catch { /* ignore */ }
}

function loadReminders(): Record<string, string> {
  try {
    const raw = localStorage.getItem(REMINDERS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as unknown;
    if (obj && typeof obj === "object") return obj as Record<string, string>;
  } catch { /* ignore */ }
  return {};
}

function saveReminders(map: Record<string, string>) {
  try { localStorage.setItem(REMINDERS_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

// ─── Toolbar button ───────────────────────────────────────────────────────────

function TB({ icon, title, active, onClick }: {
  icon: React.ReactNode; title: string; active?: boolean; onClick?: () => void;
}) {
  return (
    <button title={title} onClick={onClick}
      className={`flex items-center justify-center h-6 w-6 rounded text-xs transition-colors ${active ? "bg-[#0E2532] text-[#00C2FF]" : "text-[#8A92A6] hover:bg-[#1B1F2A]"}`}>
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
        const chip = '<a href="' + dataUrl + '" download="' + safeName + '" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;margin:2px 0;background:#1B1F2A;border:1px solid #262A35;border-radius:8px;color:#00C2FF;text-decoration:none;font-size:13px">📎 ' + safeName + '</a>';
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
      <div className="flex items-center gap-0.5 px-3 py-1.5 w-full max-w-[680px] mx-auto flex-wrap">
        <TB icon={<Bold className="h-3 w-3" />} title="Bold" onClick={() => exec("bold")} />
        <TB icon={<Italic className="h-3 w-3" />} title="Italic" onClick={() => exec("italic")} />
        <TB icon={<Strikethrough className="h-3 w-3" />} title="Strikethrough" onClick={() => exec("strikeThrough")} />
        <TB icon={<Code className="h-3 w-3" />} title="Code" onClick={() => insertBlock("<code>code</code>")} />
        <div className="w-px h-4 bg-[#262A35] mx-0.5" />
        <TB icon={<List className="h-3 w-3" />} title="Bullet list" onClick={() => exec("insertUnorderedList")} />
        <TB icon={<ListOrdered className="h-3 w-3" />} title="Numbered list" onClick={() => exec("insertOrderedList")} />
        <TB icon={<ListChecks className="h-3 w-3" />} title="Checklist" onClick={() => insertBlock('<p><input type="checkbox"> </p>')} />
        <div className="w-px h-4 bg-[#262A35] mx-0.5" />
        <TB icon={<Quote className="h-3 w-3" />} title="Quote" onClick={() => insertBlock("<blockquote></blockquote>")} />
        <TB icon={<Type className="h-3 w-3" />} title="Code block" onClick={() => insertBlock("<pre><code></code></pre>")} />
        <TB icon={<Minus className="h-3 w-3" />} title="Divider" onClick={() => insertBlock("<hr>")} />
        <TB icon={<Link2 className="h-3 w-3" />} title="Link" onClick={() => { const u = prompt("URL:"); if (u) exec("createLink", u); }} />
        <TB icon={<ImageIcon className="h-3 w-3" />} title="Image" onClick={() => { const u = prompt("Image URL:"); if (u) insertBlock(`<img src="${u}" style="max-width:100%;border-radius:8px;margin:8px 0">`); }} />
        <TB icon={<Hash className="h-3 w-3" />} title="H2 Heading" onClick={() => exec("formatBlock", "h2")} />
        <div className="w-px h-4 bg-[#262A35] mx-0.5" />
        <TB icon={<Paperclip className="h-3 w-3" />} title="Attach file" onClick={() => fileInputRef.current?.click()} />
        <button
          title={recording ? "Stop recording" : "Record voice note"}
          onClick={toggleRecording}
          className={`flex items-center justify-center h-6 rounded text-xs transition-colors ${recording ? "px-1.5 gap-1 bg-red-500/10 text-[#ea4335]" : "w-6 text-[#8A92A6] hover:bg-[#1B1F2A]"}`}>
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
        className="flex-1 overflow-y-auto w-full max-w-[680px] mx-auto px-6 py-4 pb-16 text-[15px] text-[#C2C8D6] focus:outline-none notes-editor"
        style={{ lineHeight: 1.8 }}
        onInput={() => { if (ref.current) { onChange(ref.current.innerHTML); lastValue.current = ref.current.innerHTML; } }}
      />
    </div>
  );
}

// ─── Note card (grid view) ────────────────────────────────────────────────────

function NoteCard({ note, selected, onSelect, onPin, onDelete, onColor, onArchive, isArchived, reminderIso }: {
  note: Note; selected: boolean;
  onSelect: () => void;
  onPin: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onColor: (color: string, e: React.MouseEvent) => void;
  onArchive: (e: React.MouseEvent) => void;
  isArchived: boolean;
  reminderIso?: string;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const _colorInfo = getNoteColor(note.color);

  return (
    <div
      onClick={onSelect}
      className={`relative group rounded-xl border-2 p-3 cursor-pointer transition-all hover:shadow-md ${_colorInfo.bg} ${selected ? "border-[#00C2FF]" : _colorInfo.border} hover:border-[#00C2FF]/40`}
      style={{ minHeight: 120 }}
    >
      {note.pinned && <Pin className="absolute top-2 right-2 h-3.5 w-3.5 text-[#f4b400]" />}
      <p className="text-xs font-semibold text-[#E6E9F0] mb-1 pr-5 line-clamp-2">{note.title || "Untitled"}</p>
      <p className="text-[11px] text-[#8A92A6] line-clamp-4 leading-relaxed">{notePreview(note.content)}</p>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <p className="text-[10px] text-[#bdc1c6]">{formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}</p>
        {reminderIso && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-[#00C2FF]">
            <Bell className="h-2.5 w-2.5" /> {format(new Date(reminderIso), "MMM d, h:mm a")}
          </span>
        )}
      </div>

      {/* Hover actions */}
      <div className="absolute bottom-2 right-2 hidden group-hover:flex items-center gap-1">
        <button onClick={e => { e.stopPropagation(); setShowMenu(v => !v); }}
          className="p-1 rounded bg-[#12151D]/80 text-[#8A92A6] hover:text-[#E6E9F0] shadow-sm"><MoreVertical className="h-3 w-3" /></button>
        {showMenu && (
          <div className="absolute bottom-full right-0 mb-1 w-36 bg-[#12151D] border border-[#262A35] rounded-lg shadow-lg z-50 py-1" onClick={e => e.stopPropagation()}>
            <button onClick={e => { onPin(e); setShowMenu(false); }} className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs text-[#E6E9F0] hover:bg-[#1B1F2A]">
              {note.pinned ? <><PinOff className="h-3 w-3" /> Unpin</> : <><Pin className="h-3 w-3" /> Pin</>}
            </button>
            <div className="px-3 py-1.5 text-[10px] text-[#5A6275] uppercase tracking-wider">Color</div>
            <div className="grid grid-cols-4 gap-1 px-3 pb-2">
              {NOTE_COLORS.map(c => (
                <button key={c.value} title={c.label} onClick={e => { onColor(c.value, e); setShowMenu(false); }}
                  className="h-5 w-5 rounded-full border border-[#262A35] hover:scale-110 transition-transform"
                  style={{ background: c.value || "#ffffff" }} />
              ))}
            </div>
            <button onClick={e => { onArchive(e); setShowMenu(false); }} className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs text-[#E6E9F0] hover:bg-[#1B1F2A] border-t border-[#262A35]">
              {isArchived ? <><ArchiveRestore className="h-3 w-3" /> Unarchive</> : <><Archive className="h-3 w-3" /> Archive</>}
            </button>
            <button onClick={e => { onDelete(e); setShowMenu(false); }} className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs text-[#ea4335] hover:bg-red-500/10 border-t border-[#262A35]">
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
  const [content, setContent] = useState(""); // HTML body only (no JSON)
  const [selectedNoteTags, setSelectedNoteTags] = useState<string[]>([]); // tags for the selected note
  const [tagInput, setTagInput] = useState("");
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
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Archive + reminders (client-side)
  const [archived, setArchived] = useState<Set<string>>(new Set());
  const [reminders, setReminders] = useState<Record<string, string>>({});
  const [showReminder, setShowReminder] = useState(false);
  const firedRemindersRef = useRef<Set<string>>(new Set());

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

  // ── Load archive + reminders from localStorage ────────────────────────────
  useEffect(() => {
    setArchived(loadArchived());
    setReminders(loadReminders());
  }, []);

  // ── Reminder checker (on mount + every minute) ────────────────────────────
  useEffect(() => {
    const check = () => {
      const map = reminders;
      const now = Date.now();
      for (const id of Object.keys(map)) {
        const iso = map[id];
        const due = new Date(iso).getTime();
        if (Number.isNaN(due) || due > now) continue;
        if (firedRemindersRef.current.has(id)) continue;
        firedRemindersRef.current.add(id);
        const note = notes.find(n => n.id === id);
        const noteTitle = note?.title?.trim() || "Untitled";
        toast("Reminder: " + noteTitle, { icon: undefined });
      }
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [reminders, notes]);

  // ── Archive toggle ────────────────────────────────────────────────────────
  const toggleArchive = useCallback((id: string) => {
    setArchived(prev => {
      const next = new Set(prev);
      const wasArchived = next.has(id);
      if (wasArchived) next.delete(id);
      else next.add(id);
      saveArchived(next);
      toast.success(wasArchived ? "Note unarchived" : "Note archived");
      return next;
    });
  }, []);

  // ── Reminder set / clear ──────────────────────────────────────────────────
  const setReminder = useCallback((id: string, iso: string | null) => {
    setReminders(prev => {
      const next = { ...prev };
      if (iso) { next[id] = iso; firedRemindersRef.current.delete(id); }
      else delete next[id];
      saveReminders(next);
      return next;
    });
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
    let nextRawContent = note.content;
    // Restore from offline draft if we have no network.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      try {
        const raw = localStorage.getItem(notesDraftKey(note.id));
        if (raw) {
          const draft = JSON.parse(raw) as { title?: string; content?: string };
          if (typeof draft.title === "string") nextTitle = draft.title;
          if (typeof draft.content === "string") nextRawContent = draft.content;
        }
      } catch { /* ignore corrupt draft */ }
    }

    const parsed = parseContent(nextRawContent);
    setTitle(nextTitle);
    setContent(parsed.body);
    setSelectedNoteTags(parsed.tags ?? []);
    setTagInput("");
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
  const allTags = [...new Set(notes.flatMap(n => getNoteTags(n.title, n.content)))].sort();
  const filteredNotes = notes.filter(n => {
    const q = search.toLowerCase();
    const matchesSearch = !q || n.title.toLowerCase().includes(q) || notePreview(n.content).toLowerCase().includes(q);
    const isArchived = archived.has(n.id);
    let matchesFolder: boolean;
    if (activeFolder === "archive") matchesFolder = isArchived;
    else if (isArchived) matchesFolder = false; // hide archived from normal views
    else matchesFolder = activeFolder === "all" || n.folder === activeFolder;
    const matchesTag = !activeTag || getNoteTags(n.title, n.content).includes(activeTag);
    return matchesSearch && matchesFolder && matchesTag;
  });
  const pinnedNotes = filteredNotes.filter(n => n.pinned);
  const unpinnedNotes = filteredNotes.filter(n => !n.pinned);
  const selectedNote = notes.find(n => n.id === selectedId);
  const _colorInfo = getNoteColor(selectedNote?.color ?? null);
  const words = countWords(content);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-3.25rem)] lg:h-[calc(100vh-3.5rem)] bg-[#12151D] overflow-hidden text-[#E6E9F0]" onClick={() => { setShowColorPicker(false); setShowTemplateMenu(false); setShowReminder(false); }}>

      {/* ── Left sidebar (folders + list) ── */}
      <aside className="flex flex-col border-r border-[#1C1F28] bg-[#12151D] overflow-hidden flex-shrink-0" style={{ width: 320 }}>

        {/* "All Notes" header + new note */}
        <div className="flex items-center justify-between px-4 h-[52px] flex-shrink-0 border-b border-[#1C1F28]">
          <h2 className="text-[15px] font-bold tracking-tight text-[#E6E9F0]">
            {activeFolder === "archive" ? "Archive" : (folders.find(f => f.id === activeFolder)?.name ?? "All Notes")}
          </h2>
          <button onClick={() => void createNote()} title="New note"
            className="flex items-center justify-center h-8 w-8 rounded-lg bg-[#00C2FF] text-[#06121A] hover:bg-[#0098E6] transition-colors">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2.5 border-b border-[#1C1F28]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#5A6275]" />
            <input className="w-full pl-8 pr-2 py-2 text-xs bg-[#0B0D12] border border-[#262A35] rounded-lg text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60"
              placeholder="Search notes…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {/* Folder list */}
        <div className="px-2 py-2 border-b border-[#1C1F28]">
          <p className="px-2 text-[10px] font-semibold text-[#5A6275] uppercase tracking-wider mb-1">Folders</p>
          {folders.map(f => (
            <button key={f.id} onClick={() => setActiveFolder(f.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg transition-colors ${activeFolder === f.id ? "bg-[#0E2532] text-[#00C2FF] font-semibold" : "text-[#8A92A6] hover:bg-[#1B1F2A]"}`}>
              <Folder className="h-3.5 w-3.5" /> {f.name}
              <span className="ml-auto text-[10px] text-[#5A6275] font-mono">
                {f.id === "all" ? notes.filter(n => !archived.has(n.id)).length : 0}
              </span>
            </button>
          ))}
          <button onClick={() => setActiveFolder("archive")}
            className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg transition-colors ${activeFolder === "archive" ? "bg-[#0E2532] text-[#00C2FF] font-semibold" : "text-[#8A92A6] hover:bg-[#1B1F2A]"}`}>
            <Archive className="h-3.5 w-3.5" /> Archive
            <span className="ml-auto text-[10px] text-[#5A6275] font-mono">{archived.size}</span>
          </button>
        </div>

        {/* Tags (from #hashtags in notes) */}
        {allTags.length > 0 && (
          <div className="px-2 py-2 border-b border-[#1C1F28]">
            <p className="px-2 text-[10px] font-semibold text-[#5A6275] uppercase tracking-wider mb-1.5">Tags</p>
            <div className="flex flex-wrap gap-1 px-1">
              {activeTag && (
                <button onClick={() => setActiveTag(null)}
                  className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#1B1F2A] text-[#8A92A6] hover:bg-[#262A35]">
                  Clear ✕
                </button>
              )}
              {allTags.map(t => (
                <button key={t} onClick={() => setActiveTag(activeTag === t ? null : t)}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${activeTag === t ? "bg-[#00C2FF] text-[#06121A]" : "bg-[#0E2532] text-[#00C2FF] hover:bg-[#1B1F2A]"}`}>
                  #{t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Note list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#00C2FF]" /></div>
          ) : (
            <>
              {pinnedNotes.length > 0 && (
                <div className="space-y-1">
                  <p className="px-2 py-1 text-[10px] font-semibold text-[#5A6275] uppercase tracking-wider">Pinned</p>
                  {pinnedNotes.map(n => <NoteListItem key={n.id} note={n} selected={n.id === selectedId} onClick={() => selectNote(n)} reminderIso={reminders[n.id]} />)}
                </div>
              )}
              {unpinnedNotes.length > 0 && (
                <div className="space-y-1 pt-1">
                  {pinnedNotes.length > 0 && <p className="px-2 py-1 text-[10px] font-semibold text-[#5A6275] uppercase tracking-wider">Notes</p>}
                  {unpinnedNotes.map(n => <NoteListItem key={n.id} note={n} selected={n.id === selectedId} onClick={() => selectNote(n)} reminderIso={reminders[n.id]} />)}
                </div>
              )}
              {filteredNotes.length === 0 && (
                <div className="text-center py-10 px-4">
                  <StickyNote className="h-10 w-10 text-[#bdc1c6] mx-auto mb-2" />
                  <p className="text-xs text-[#5A6275]">{search ? "No matching notes" : "No notes yet"}</p>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* ── Editor ── */}
      {selectedId && selectedNote ? (
        <div className={`flex flex-col flex-1 min-w-0 overflow-hidden ${_colorInfo.bg}`}>

          {/* Note toolbar — ~52px top bar */}
          <div className="flex items-center gap-2 px-4 h-[52px] flex-shrink-0 border-b border-[#1C1F28] bg-[#12151D] z-10">
            <div className="flex items-center gap-2 text-[12px] font-mono text-[#5A6275] min-w-0">
              {saving
                ? <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>
                : <span>Edited {formatDistanceToNow(new Date(selectedNote.updatedAt), { addSuffix: true })}</span>}
            </div>

            {isOffline && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-[#f4b400]">
                <WifiOff className="h-3.5 w-3.5" /> Offline
              </span>
            )}

            <span className="text-[11px] font-mono text-[#5A6275] ml-auto">{words} words</span>

            {/* Templates */}
            <div className="relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowTemplateMenu(v => !v)} title="Templates"
                className={`p-1.5 rounded transition-colors ${showTemplateMenu ? "bg-[#0E2532] text-[#00C2FF]" : "text-[#8A92A6] hover:bg-[#1B1F2A]"}`}>
                <LayoutTemplate className="h-4 w-4" />
              </button>
              {showTemplateMenu && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-[#12151D] border border-[#262A35] rounded-lg shadow-lg z-50 py-1">
                  <p className="px-3 py-1 text-[10px] font-medium text-[#5A6275]">Quick templates</p>
                  {NOTE_TEMPLATES.map(tpl => (
                    <button key={tpl.id} onClick={() => applyTemplate(tpl)}
                      className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs text-[#E6E9F0] hover:bg-[#1B1F2A]">
                      <StickyNote className="h-3.5 w-3.5 text-[#8A92A6]" /> {tpl.label}
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
              className="text-xs border border-[#262A35] rounded-lg px-2 py-1 bg-[#12151D] text-[#8A92A6] focus:outline-none focus:border-[#00C2FF]/60 cursor-pointer"
            >
              <option value="">No folder</option>
              {folders.filter(f => f.id !== "all").map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>

            {/* Color picker */}
            <div className="relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowColorPicker(v => !v)} title="Note color" className="p-1.5 rounded text-[#8A92A6] hover:bg-[#1B1F2A]">
                <Palette className="h-4 w-4" />
              </button>
              {showColorPicker && (
                <div className="absolute right-0 top-full mt-1 bg-[#12151D] border border-[#262A35] rounded-lg shadow-lg z-50 p-2">
                  <div className="grid grid-cols-4 gap-1.5">
                    {NOTE_COLORS.map(c => (
                      <button key={c.value} title={c.label} onClick={() => void colorNote(selectedId, c.value)}
                        className={`h-7 w-7 rounded-lg border-2 transition-transform hover:scale-110 ${selectedNote.color === c.value ? "border-[#00C2FF]" : "border-transparent"}`}
                        style={{ background: c.value || "#ffffff", border: c.value ? undefined : "2px dashed #262A35" }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button onClick={() => { void pinNote(selectedId, selectedNote.pinned, new MouseEvent("click") as unknown as React.MouseEvent); }} title={selectedNote.pinned ? "Unpin" : "Pin"}
              className={`p-1.5 rounded transition-colors ${selectedNote.pinned ? "text-[#f4b400] bg-amber-500/10" : "text-[#8A92A6] hover:bg-[#1B1F2A]"}`}>
              {selectedNote.pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
            </button>

            <button onClick={() => setShowAI(v => !v)} title="AI assistant"
              className={`p-1.5 rounded transition-colors ${showAI ? "text-purple-400 bg-purple-500/10" : "text-[#8A92A6] hover:bg-[#1B1F2A]"}`}>
              <Sparkles className="h-4 w-4" />
            </button>

            {/* Reminder */}
            <div className="relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowReminder(v => !v)} title="Remind me"
                className={`p-1.5 rounded transition-colors ${reminders[selectedId] ? "text-[#00C2FF] bg-[#0E2532]" : showReminder ? "bg-[#0E2532] text-[#00C2FF]" : "text-[#8A92A6] hover:bg-[#1B1F2A]"}`}>
                <Bell className="h-4 w-4" />
              </button>
              {showReminder && (
                <div className="absolute right-0 top-full mt-1 w-60 bg-[#12151D] border border-[#262A35] rounded-lg shadow-lg z-50 p-3 space-y-2">
                  <p className="text-[11px] font-medium text-[#8A92A6]">Set a reminder</p>
                  <input
                    type="datetime-local"
                    value={reminders[selectedId] ? new Date(reminders[selectedId]).toISOString().slice(0, 16) : ""}
                    onChange={e => {
                      const v = e.target.value;
                      if (v) setReminder(selectedId, new Date(v).toISOString());
                    }}
                    className="w-full px-2 py-1.5 bg-[#1B1F2A] border border-[#2E333F] rounded-lg text-xs text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/60"
                  />
                  {reminders[selectedId] && (
                    <div className="flex items-center justify-between text-[11px] text-[#8A92A6]">
                      <span>{format(new Date(reminders[selectedId]), "MMM d, h:mm a")}</span>
                      <button onClick={() => { setReminder(selectedId, null); setShowReminder(false); }}
                        className="flex items-center gap-1 text-[#ea4335] hover:underline">
                        <BellOff className="h-3 w-3" /> Clear
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Archive */}
            <button onClick={() => toggleArchive(selectedId)} title={archived.has(selectedId) ? "Unarchive" : "Archive"}
              className={`p-1.5 rounded transition-colors ${archived.has(selectedId) ? "text-[#00C2FF] bg-[#0E2532]" : "text-[#8A92A6] hover:bg-[#1B1F2A]"}`}>
              {archived.has(selectedId) ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            </button>

            <button onClick={duplicateNote} title="Duplicate" className="p-1.5 rounded text-[#8A92A6] hover:bg-[#1B1F2A]"><Copy className="h-4 w-4" /></button>
            <button onClick={exportNote} title="Export" className="p-1.5 rounded text-[#8A92A6] hover:bg-[#1B1F2A]"><Download className="h-4 w-4" /></button>
            <button onClick={e => void deleteNote(selectedId, e)} title="Delete" className="p-1.5 rounded text-[#8A92A6] hover:text-[#ea4335] hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
          </div>

          {/* Editor + AI panel */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto flex flex-col">
              <div className="w-full max-w-[680px] mx-auto px-6 pt-8 flex-shrink-0">
                <input
                  className="w-full bg-transparent border-none outline-none text-[#E6E9F0] placeholder:text-[#5A6275] tracking-tight"
                  style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.2 }}
                  value={title}
                  placeholder="Untitled"
                  onChange={e => updateTitle(e.target.value)}
                />
                {selectedNoteTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {selectedNoteTags.map(t => (
                      <span key={t} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#0E2532] text-[#00C2FF]">#{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                <RichEditor
                  value={content}
                  onChange={updateContent}
                  placeholder="Start writing your note…"
                />
              </div>
            </div>

            {/* AI sidebar */}
            {showAI && (
              <div className="w-72 border-l border-[#262A35] bg-[#12151D] flex flex-col flex-shrink-0">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#262A35]">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#E6E9F0]">
                    <Sparkles className="h-4 w-4 text-purple-400" /> AI Notes
                  </div>
                  <button onClick={() => setShowAI(false)} className="text-[#5A6275] hover:text-[#E6E9F0]"><X className="h-4 w-4" /></button>
                </div>
                <div className="flex border-b border-[#262A35]">
                  {(["summarize","title","actions","convert"] as const).map(m => (
                    <button key={m} onClick={() => setAIMode(m)}
                      className={`flex-1 py-1.5 text-[10px] font-medium capitalize transition-colors ${aiMode === m ? "text-purple-400 border-b-2 border-purple-600" : "text-[#8A92A6] hover:text-[#E6E9F0]"}`}>
                      {m === "actions" ? "Tasks" : m}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <p className="text-xs text-[#8A92A6]">
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
                      <div className="bg-[#12151D] rounded-lg p-3 text-xs text-[#E6E9F0] whitespace-pre-wrap leading-relaxed border border-[#262A35] max-h-52 overflow-y-auto">{aiResult}</div>
                      <button onClick={applyAIResult}
                        className="w-full py-2 text-xs font-semibold text-[#00C2FF] border border-[#00C2FF]/30 rounded-lg hover:bg-[#0E2532]">
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
          <div className="flex items-center gap-4 px-4 py-1.5 border-t border-[#1C1F28] bg-[#12151D] text-[10px] font-mono text-[#5A6275] flex-shrink-0">
            <span>Created {format(new Date(selectedNote.createdAt), "MMM d, yyyy")}</span>
            <span>Updated {formatDistanceToNow(new Date(selectedNote.updatedAt), { addSuffix: true })}</span>
            <span>{words} words</span>
          </div>
        </div>
      ) : (
        /* Grid view */
        <div className="flex-1 flex flex-col overflow-hidden bg-[#12151D]">
          <div className="flex items-center justify-between px-4 h-[52px] flex-shrink-0 border-b border-[#1C1F28]">
            <h2 className="text-sm font-semibold text-[#E6E9F0]">
              {activeFolder === "archive" ? "Archive" : (folders.find(f => f.id === activeFolder)?.name ?? "All Notes")}
              <span className="ml-2 text-[#5A6275] font-normal">{filteredNotes.length}</span>
            </h2>
            <button onClick={() => void createNote()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#00C2FF] text-[#06121A] rounded-lg hover:bg-[#0098E6]">
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#00C2FF]" /></div>
            ) : filteredNotes.length === 0 ? (
              <div className="text-center py-16">
                <StickyNote className="h-12 w-12 text-[#bdc1c6] mx-auto mb-3" />
                <p className="text-sm font-semibold text-[#E6E9F0] mb-1">No notes yet</p>
                <p className="text-xs text-[#8A92A6] mb-4">Create your first note to get started</p>
                <button onClick={() => void createNote()} className="px-4 py-2 text-sm font-semibold bg-[#00C2FF] text-[#06121A] rounded-lg hover:bg-[#0098E6]">
                  <Plus className="h-3.5 w-3.5 inline mr-1" /> New note
                </button>
              </div>
            ) : (
              <>
                {pinnedNotes.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-[#8A92A6] mb-2 flex items-center gap-1"><Pin className="h-3 w-3 text-[#f4b400]" /> Pinned</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {pinnedNotes.map(n => (
                        <NoteCard key={n.id} note={n} selected={n.id === selectedId}
                          onSelect={() => selectNote(n)}
                          onPin={e => void pinNote(n.id, n.pinned, e)}
                          onDelete={e => void deleteNote(n.id, e)}
                          onColor={(c, e) => void colorNote(n.id, c, e)}
                          onArchive={e => { e.stopPropagation(); toggleArchive(n.id); }}
                          isArchived={archived.has(n.id)}
                          reminderIso={reminders[n.id]}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {unpinnedNotes.length > 0 && (
                  <div>
                    {pinnedNotes.length > 0 && <p className="text-xs font-semibold text-[#8A92A6] mb-2">Notes</p>}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {unpinnedNotes.map(n => (
                        <NoteCard key={n.id} note={n} selected={n.id === selectedId}
                          onSelect={() => selectNote(n)}
                          onPin={e => void pinNote(n.id, n.pinned, e)}
                          onDelete={e => void deleteNote(n.id, e)}
                          onColor={(c, e) => void colorNote(n.id, c, e)}
                          onArchive={e => { e.stopPropagation(); toggleArchive(n.id); }}
                          isArchived={archived.has(n.id)}
                          reminderIso={reminders[n.id]}
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

function NoteListItem({ note, selected, onClick, reminderIso }: { note: Note; selected: boolean; onClick: () => void; reminderIso?: string }) {
  const _colorInfo = getNoteColor(note.color);
  return (
    <div onClick={onClick}
      className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors border ${selected ? "bg-[#0E2532] border-[#00C2FF]/40" : "border-transparent hover:bg-[#1B1F2A]"}`}>
      <div className="h-2.5 w-2.5 rounded-[3px] mt-1 flex-shrink-0" style={{ background: note.color || "#5A6275" }} />
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-semibold truncate ${selected ? "text-[#00C2FF]" : "text-[#E6E9F0]"}`}>
          {note.title || "Untitled"}
          {note.pinned && <Pin className="inline h-2.5 w-2.5 text-[#f4b400] ml-1" />}
        </p>
        <p className="text-[11px] text-[#8A92A6] line-clamp-2 leading-relaxed mt-0.5">{notePreview(note.content)}</p>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-[10px] font-mono text-[#5A6275]">{formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}</p>
          {reminderIso && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-[#00C2FF]">
              <Bell className="h-2.5 w-2.5" /> {format(new Date(reminderIso), "MMM d, h:mm a")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
