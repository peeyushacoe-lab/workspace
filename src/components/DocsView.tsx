"use client";

/**
 * Nexus Docs — Google Docs + Word competitor
 * Features: full Tiptap editor, AI panel, outline, comments, version history,
 * export PDF/HTML, security labels, share, real-time collaboration
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus, Search, FileText, Trash2, Pin, PinOff, Loader2, Share2,
  Bold, Italic, Underline, Strikethrough, Code, Quote, Link2,
  List, ListOrdered, ListChecks, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Minus, Table, Image as ImageIcon,
  Undo2, Redo2, ChevronDown, Sparkles, MessageSquare, History,
  Download, Shield, X, Check,
  IndentDecrease, IndentIncrease, Type,
  BookOpen, Clock, LayoutTemplate, WifiOff,
  Superscript as SuperscriptIcon, Subscript as SubscriptIcon, RemoveFormatting, Highlighter,
  FileCog, PanelTop, BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { TextStyle, FontFamily, FontSize, Color } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import * as Y from "yjs";
import Collaboration from "@tiptap/extension-collaboration";
import { DocShareModal } from "./DocShareModal";

// ─── Types ────────────────────────────────────────────────────────────────────

type Doc = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

type Comment = {
  id: string;
  text: string;
  author: string;
  createdAt: string;
  resolved: boolean;
};

type VersionSnapshot = {
  id: string;
  title: string;
  content: string;
  savedAt: string;
  wordCount: number;
};

type SecurityLabel = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";

const SECURITY_LABELS: { value: SecurityLabel; label: string; color: string; bg: string }[] = [
  { value: "PUBLIC",       label: "Public",       color: "text-[#0f9d58]", bg: "bg-emerald-50 border-emerald-200" },
  { value: "INTERNAL",     label: "Internal",     color: "text-[#1a56db]", bg: "bg-blue-50 border-blue-200"    },
  { value: "CONFIDENTIAL", label: "Confidential", color: "text-[#f4b400]", bg: "bg-amber-50 border-amber-200"  },
  { value: "RESTRICTED",   label: "Restricted",   color: "text-[#ea4335]", bg: "bg-red-50 border-red-200"      },
];

const REMOTE_ORIGIN = "sse-relay";

// ─── Document templates ─────────────────────────────────────────────────────────

const DOC_TEMPLATES: { id: string; label: string; html: string }[] = [
  {
    id: "resume",
    label: "Resume",
    html: [
      "<h1>Your Name</h1>",
      "<p>City, Country &middot; email@example.com &middot; +1 555 000 0000 &middot; linkedin.com/in/you</p>",
      "<h2>Summary</h2>",
      "<p>Concise professional summary highlighting your experience, strengths, and goals.</p>",
      "<h2>Experience</h2>",
      "<h3>Job Title — Company</h3>",
      "<p><em>Month Year – Present</em></p>",
      "<ul><li>Key achievement or responsibility with measurable impact.</li><li>Another accomplishment.</li><li>Another accomplishment.</li></ul>",
      "<h3>Job Title — Company</h3>",
      "<p><em>Month Year – Month Year</em></p>",
      "<ul><li>Key achievement or responsibility.</li><li>Another accomplishment.</li></ul>",
      "<h2>Education</h2>",
      "<p><strong>Degree</strong>, University — Year</p>",
      "<h2>Skills</h2>",
      "<ul><li>Skill one</li><li>Skill two</li><li>Skill three</li></ul>",
    ].join(""),
  },
  {
    id: "cover-letter",
    label: "Cover Letter",
    html: [
      "<h1>Cover Letter</h1>",
      "<p>Your Name<br>City, Country<br>email@example.com</p>",
      "<p>Date</p>",
      "<p>Hiring Manager<br>Company Name<br>Company Address</p>",
      "<p>Dear Hiring Manager,</p>",
      "<p>Opening paragraph: state the role you are applying for and a compelling hook about why you are a strong fit.</p>",
      "<p>Body paragraph: describe your relevant experience and accomplishments, tying them to the role&rsquo;s requirements.</p>",
      "<p>Closing paragraph: reiterate your enthusiasm, thank the reader, and invite next steps.</p>",
      "<p>Sincerely,<br>Your Name</p>",
    ].join(""),
  },
  {
    id: "meeting-notes",
    label: "Meeting Notes",
    html: [
      "<h1>Meeting Notes</h1>",
      "<p><strong>Date:</strong> &nbsp; &nbsp; <strong>Time:</strong> &nbsp; &nbsp; <strong>Location:</strong></p>",
      "<h2>Attendees</h2>",
      "<ul><li>Name</li><li>Name</li></ul>",
      "<h2>Agenda</h2>",
      "<ol><li>Topic one</li><li>Topic two</li><li>Topic three</li></ol>",
      "<h2>Discussion</h2>",
      "<p>Notes from the discussion go here.</p>",
      "<h2>Action Items</h2>",
      "<table><tbody><tr><th>Owner</th><th>Action</th><th>Due</th></tr><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr></tbody></table>",
      "<h2>Decisions</h2>",
      "<ul><li>Decision recorded here.</li></ul>",
    ].join(""),
  },
  {
    id: "report",
    label: "Report",
    html: [
      "<h1>Report Title</h1>",
      "<p><em>Prepared by Your Name &middot; Date</em></p>",
      "<h2>Executive Summary</h2>",
      "<p>High-level overview of the report&rsquo;s purpose, findings, and recommendations.</p>",
      "<h2>Introduction</h2>",
      "<p>Background and context for this report.</p>",
      "<h2>Findings</h2>",
      "<p>Detailed findings and analysis.</p>",
      "<table><tbody><tr><th>Metric</th><th>Value</th><th>Notes</th></tr><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr></tbody></table>",
      "<h2>Recommendations</h2>",
      "<ol><li>Recommendation one</li><li>Recommendation two</li></ol>",
      "<h2>Conclusion</h2>",
      "<p>Summary of the report and next steps.</p>",
    ].join(""),
  },
];

function docsDraftKey(id: string): string {
  return "nexus_docs_draft_" + id;
}

// ─── Page setup ─────────────────────────────────────────────────────────────────

type PageSize = "Letter" | "A4" | "Legal";
type Orientation = "Portrait" | "Landscape";
type MarginPreset = "Normal" | "Narrow" | "Wide";

type PageSetup = {
  size: PageSize;
  orientation: Orientation;
  margins: MarginPreset;
};

const DEFAULT_PAGE_SETUP: PageSetup = { size: "Letter", orientation: "Portrait", margins: "Normal" };

// Dimensions in px at ~96 dpi (portrait — width x height).
const PAGE_SIZES: Record<PageSize, { w: number; h: number }> = {
  Letter: { w: 816, h: 1056 },
  A4:     { w: 794, h: 1123 },
  Legal:  { w: 816, h: 1344 },
};

// Inner padding presets (vertical / horizontal) in px.
const MARGIN_PRESETS: Record<MarginPreset, { v: number; h: number }> = {
  Normal: { v: 96, h: 96 },
  Narrow: { v: 48, h: 48 },
  Wide:   { v: 144, h: 144 },
};

function pageSetupKey(id: string): string {
  return "nexus_docs_pagesetup_" + id;
}

function headerFooterKey(id: string): string {
  return "nexus_docs_headerfooter_" + id;
}

function loadPageSetup(id: string): PageSetup {
  try {
    const raw = localStorage.getItem(pageSetupKey(id));
    if (raw) {
      const p = JSON.parse(raw) as Partial<PageSetup>;
      return {
        size: p.size && PAGE_SIZES[p.size] ? p.size : DEFAULT_PAGE_SETUP.size,
        orientation: p.orientation === "Landscape" ? "Landscape" : "Portrait",
        margins: p.margins && MARGIN_PRESETS[p.margins] ? p.margins : DEFAULT_PAGE_SETUP.margins,
      };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_PAGE_SETUP };
}

type HeaderFooter = { enabled: boolean; header: string; footer: string };

const DEFAULT_HEADER_FOOTER: HeaderFooter = { enabled: false, header: "", footer: "" };

function loadHeaderFooter(id: string): HeaderFooter {
  try {
    const raw = localStorage.getItem(headerFooterKey(id));
    if (raw) {
      const h = JSON.parse(raw) as Partial<HeaderFooter>;
      return {
        enabled: h.enabled === true,
        header: typeof h.header === "string" ? h.header : "",
        footer: typeof h.footer === "string" ? h.footer : "",
      };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_HEADER_FOOTER };
}

// ─── Document stats ─────────────────────────────────────────────────────────────

type DocStats = {
  words: number;
  charsWithSpaces: number;
  charsNoSpaces: number;
  sentences: number;
  paragraphs: number;
  readingMinutes: number;
};

function computeStats(text: string): DocStats {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const charsWithSpaces = text.length;
  const charsNoSpaces = text.replace(/\s/g, "").length;
  const sentences = trimmed ? (trimmed.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? []).filter(s => s.trim().length > 0).length : 0;
  const paragraphs = trimmed ? trimmed.split(/\n+/).filter(p => p.trim().length > 0).length : 0;
  const readingMinutes = Math.max(words > 0 ? 1 : 0, Math.ceil(words / 200));
  return { words, charsWithSpaces, charsNoSpaces, sentences, paragraphs, readingMinutes };
}

// ─── Collab hook ──────────────────────────────────────────────────────────────

function useDocCollab(docId: string | null) {
  const ydocRef = useRef<Y.Doc | null>(null);
  const [collaborators, setCollaborators] = useState<{ userId: string; name: string }[]>([]);

  if (!ydocRef.current) ydocRef.current = new Y.Doc();

  useEffect(() => {
    if (!docId) return;
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    setCollaborators([]);

    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE_ORIGIN) return;
      const b64 = btoa(String.fromCharCode(...Array.from(update)));
      fetch(`/api/docs/${docId}/collab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "YJS_UPDATE", update: b64 }),
      }).catch(() => {});
    };
    ydoc.on("update", onUpdate);

    const es = new EventSource(`/api/docs/${docId}/collab`);
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { type: string; update?: string; userId?: string; name?: string };
        if (msg.type === "YJS_UPDATE" && msg.update) {
          const bin = Uint8Array.from(atob(msg.update), c => c.charCodeAt(0));
          Y.applyUpdate(ydoc, bin, REMOTE_ORIGIN);
        } else if (msg.type === "PRESENCE" && msg.userId) {
          setCollaborators(prev => {
            const filtered = prev.filter(c => c.userId !== msg.userId);
            return [...filtered, { userId: msg.userId!, name: msg.name ?? "Unknown" }];
          });
        }
      } catch { /* ignore */ }
    };

    const pingInterval = setInterval(() => {
      fetch(`/api/docs/${docId}/collab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "PRESENCE" }),
      }).catch(() => {});
    }, 30_000);

    return () => {
      ydoc.off("update", onUpdate);
      es.close();
      clearInterval(pingInterval);
    };
  }, [docId]);

  return { ydoc: ydocRef.current, collaborators };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countWords(html: string): number {
  return html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

function docPreview(content: string): string {
  return content.replace(/<[^>]+>/g, "").replace(/\n/g, " ").slice(0, 90) || "Empty document";
}

function TB({ icon, title, active, onClick }: {
  icon: React.ReactNode; title: string; active?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <button title={title} onClick={onClick}
      className={`flex items-center justify-center h-7 w-7 rounded text-sm transition-colors ${active ? "bg-[#e8f0fe] text-[#1a56db]" : "text-[#5f6368] hover:bg-[#f1f3f4]"}`}>
      {icon}
    </button>
  );
}

function TSep() { return <div className="w-px h-5 bg-[#e8eaed] mx-0.5" />; }

function PanelTab({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${active ? "border-[#1a56db] text-[#1a56db]" : "border-transparent text-[#5f6368] hover:text-[#202124]"}`}>
      {icon} {label}
    </button>
  );
}

// ─── Doc list item ────────────────────────────────────────────────────────────

function DocItem({ doc, selected, onSelect, onPin, onDelete }: {
  doc: Doc; selected: boolean;
  onSelect: () => void;
  onPin: (id: string, pinned: boolean, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className={`group flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors ${selected ? "bg-[#e8f0fe]" : "hover:bg-[#e8eaed]"}`}
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <FileText className={`h-4 w-4 flex-shrink-0 mt-0.5 ${selected ? "text-[#1a56db]" : "text-[#80868b]"}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${selected ? "text-[#1a56db]" : "text-[#202124]"}`}>{doc.title}</p>
        <p className="text-[10px] text-[#80868b] truncate">{docPreview(doc.content)}</p>
        <p className="text-[10px] text-[#bdc1c6]">{formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}</p>
      </div>
      {hover && (
        <div className="flex flex-col gap-0.5">
          <button onClick={e => onPin(doc.id, doc.pinned, e)} className="p-0.5 rounded text-[#80868b] hover:text-[#202124]">
            {doc.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          </button>
          <button onClick={e => onDelete(doc.id, e)} className="p-0.5 rounded text-[#80868b] hover:text-[#ea4335]">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DocsView() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");

  // Panels
  const [showAI, setShowAI] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showOutline, setShowOutline] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showSecurityMenu, setShowSecurityMenu] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [headingMenu, setHeadingMenu] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [showPageSetupMenu, setShowPageSetupMenu] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // Page setup, header/footer (per-doc, persisted)
  const [pageSetup, setPageSetup] = useState<PageSetup>(DEFAULT_PAGE_SETUP);
  const [headerFooter, setHeaderFooter] = useState<HeaderFooter>(DEFAULT_HEADER_FOOTER);
  const [stats, setStats] = useState<DocStats>(() => computeStats(""));

  // Features
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [versions, setVersions] = useState<VersionSnapshot[]>([]);
  const [securityLabel, setSecurityLabel] = useState<SecurityLabel>("INTERNAL");
  const [outline, setOutline] = useState<{ level: number; text: string }[]>([]);

  // AI
  const [aiMode, setAIMode] = useState<"summarize" | "rewrite" | "expand" | "shorten" | "grammar" | "generate">("summarize");
  const [aiPrompt, setAIPrompt] = useState("");
  const [aiLoading, setAILoading] = useState(false);
  const [aiResult, setAIResult] = useState("");

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { ydoc, collaborators } = useDocCollab(selectedId);

  // ── Editor ──────────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ inline: false, allowBase64: true }),
      TableKit.configure({ table: { resizable: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      Collaboration.configure({ document: ydoc }),
    ],
    content: "",
    editorProps: {
      attributes: { class: "docs-editor-content outline-none min-h-[600px]" },
    },
    onUpdate: ({ editor: ed }) => {
      const heads: { level: number; text: string }[] = [];
      ed.state.doc.descendants(node => {
        if (node.type.name === "heading") {
          heads.push({ level: node.attrs.level as number, text: node.textContent });
        }
      });
      setOutline(heads);
      setStats(computeStats(ed.getText()));
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { void autoSave(ed.getHTML()); }, 2000);
    },
  }, [ydoc]);

  // ── Load docs ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/docs")
      .then(r => r.json())
      .then((d: Doc[]) => { setDocs(d); setLoading(false); })
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

  // ── Page setup persistence ────────────────────────────────────────────────
  const updatePageSetup = useCallback((patch: Partial<PageSetup>) => {
    setPageSetup(prev => {
      const next = { ...prev, ...patch };
      if (selectedId) {
        try { localStorage.setItem(pageSetupKey(selectedId), JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
  }, [selectedId]);

  // ── Header / footer persistence ───────────────────────────────────────────
  const updateHeaderFooter = useCallback((patch: Partial<HeaderFooter>) => {
    setHeaderFooter(prev => {
      const next = { ...prev, ...patch };
      if (selectedId) {
        try { localStorage.setItem(headerFooterKey(selectedId), JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
  }, [selectedId]);

  // ── Live document stats ───────────────────────────────────────────────────
  const refreshStats = useCallback(() => {
    if (editor) setStats(computeStats(editor.getText()));
  }, [editor]);

  // ── Select doc ────────────────────────────────────────────────────────────
  const selectDoc = useCallback((doc: Doc) => {
    setSelectedId(doc.id);
    setComments([]);
    setPageSetup(loadPageSetup(doc.id));
    setHeaderFooter(loadHeaderFooter(doc.id));

    // Restore from offline draft if we have no network / fetch unavailable
    let nextTitle = doc.title;
    let nextContent = doc.content;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      try {
        const raw = localStorage.getItem(docsDraftKey(doc.id));
        if (raw) {
          const draft = JSON.parse(raw) as { title?: string; content?: string };
          if (typeof draft.title === "string") nextTitle = draft.title;
          if (typeof draft.content === "string") nextContent = draft.content;
        }
      } catch { /* ignore corrupt draft */ }
    }

    setTitle(nextTitle);
    if (editor) {
      if (nextContent) editor.commands.setContent(nextContent, { emitUpdate: false });
      else editor.commands.clearContent();
    }
  }, [editor]);

  // ── Create doc ────────────────────────────────────────────────────────────
  const createDoc = async () => {
    const res = await fetch("/api/docs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled Document", content: "" }),
    });
    if (!res.ok) return toast.error("Failed to create document");
    const doc = await res.json() as Doc;
    setDocs(prev => [doc, ...prev]);
    selectDoc(doc);
    editor?.commands.clearContent();
    editor?.commands.focus();
  };

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const autoSave = useCallback(async (content: string) => {
    if (!selectedId) return;

    // Always cache the latest draft locally for offline recovery.
    try {
      localStorage.setItem(docsDraftKey(selectedId), JSON.stringify({ title, content }));
    } catch { /* storage may be full / unavailable */ }

    setSaving(true);
    try {
      await fetch(`/api/docs/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      setDocs(prev => prev.map(d => d.id === selectedId ? { ...d, content, updatedAt: new Date().toISOString() } : d));
      // Real save succeeded — refresh the cached draft to mirror server state.
      try {
        localStorage.setItem(docsDraftKey(selectedId), JSON.stringify({ title, content }));
      } catch { /* ignore */ }
    } finally { setSaving(false); }
  }, [selectedId, title]);

  const saveTitle = async (t: string) => {
    if (!selectedId) return;
    await fetch(`/api/docs/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t }),
    });
    setDocs(prev => prev.map(d => d.id === selectedId ? { ...d, title: t } : d));
  };

  // ── Templates ─────────────────────────────────────────────────────────────
  const applyTemplate = (tpl: { id: string; label: string; html: string }) => {
    if (!editor || !selectedId) return;
    editor.commands.setContent(tpl.html, { emitUpdate: false });
    editor.commands.focus();
    setShowTemplateMenu(false);
    // Persist through the existing save path.
    void autoSave(tpl.html);
    toast.success(tpl.label + " template applied");
  };

  const deleteDoc = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/docs/${id}`, { method: "DELETE" });
    setDocs(prev => prev.filter(d => d.id !== id));
    if (selectedId === id) { setSelectedId(null); editor?.commands.clearContent(); }
    toast.success("Document deleted");
  };

  const pinDoc = async (id: string, pinned: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/docs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned: !pinned }) });
    setDocs(prev => prev.map(d => d.id === id ? { ...d, pinned: !pinned } : d));
  };

  // ── Version history ───────────────────────────────────────────────────────
  const saveVersion = useCallback(() => {
    if (!editor || !selectedId) return;
    const snap: VersionSnapshot = {
      id: `v_${Date.now()}`,
      title,
      content: editor.getHTML(),
      savedAt: new Date().toISOString(),
      wordCount: countWords(editor.getHTML()),
    };
    setVersions(prev => [snap, ...prev.slice(0, 19)]);
    toast.success("Version saved");
  }, [editor, selectedId, title]);

  const restoreVersion = (v: VersionSnapshot) => {
    editor?.commands.setContent(v.content, { emitUpdate: false });
    setTitle(v.title);
    toast.success("Version restored");
    setShowHistory(false);
  };

  // ── Comments ──────────────────────────────────────────────────────────────
  const addComment = () => {
    if (!newComment.trim()) return;
    const c: Comment = {
      id: `c_${Date.now()}`,
      text: newComment,
      author: "You",
      createdAt: new Date().toISOString(),
      resolved: false,
    };
    setComments(prev => [...prev, c]);
    setNewComment("");
  };

  // ── Export ────────────────────────────────────────────────────────────────
  const exportHTML = () => {
    if (!editor) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,sans-serif;max-width:820px;margin:40px auto;padding:20px 40px;line-height:1.7;color:#202124}
h1{font-size:2rem;margin-top:1.5em}h2{font-size:1.5rem}h3{font-size:1.2rem}
pre{background:#f4f4f4;padding:12px;border-radius:6px;overflow:auto}
blockquote{border-left:4px solid #1a56db;margin:0;padding-left:1em;color:#5f6368}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #e8eaed;padding:8px}</style></head>
<body><h1>${title}</h1>${editor.getHTML()}</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${title}.html`; a.click();
  };

  const exportText = () => {
    if (!editor) return;
    const blob = new Blob([editor.getText()], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${title}.txt`; a.click();
  };

  const printDoc = () => {
    if (!editor) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,sans-serif;max-width:820px;margin:40px auto;padding:20px 40px;line-height:1.7}
h1{font-size:2rem}h2{font-size:1.5rem}h3{font-size:1.2rem}
pre{background:#f4f4f4;padding:12px;border-radius:6px}
blockquote{border-left:4px solid #1a56db;margin:0;padding-left:1em;color:#5f6368}
@media print{body{margin:0}}</style></head>
<body><h1>${title}</h1>${editor.getHTML()}</body></html>`);
    w.document.close(); w.print();
  };

  // ── AI ────────────────────────────────────────────────────────────────────
  const runAI = async () => {
    if (!editor) return;
    setAILoading(true); setAIResult("");
    const content = editor.getText().slice(0, 3000);
    const prompts: Record<string, string> = {
      summarize: `Summarize this document concisely in 3-5 sentences:\n\n${content}`,
      rewrite:   `Rewrite this document more clearly and professionally:\n\n${content}`,
      expand:    `Expand this content with more depth and examples:\n\n${content}`,
      shorten:   `Shorten this to key points only:\n\n${content}`,
      grammar:   `Fix all grammar, spelling, and punctuation errors. Return only the corrected text:\n\n${content}`,
      generate:  `Write a complete, well-structured document about: ${aiPrompt}. Include an introduction, main sections with headings, and a conclusion.`,
    };
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompts[aiMode] }),
      });
      const d = await res.json() as { reply?: string; message?: string };
      setAIResult(d.reply ?? d.message ?? "No response");
    } catch { setAIResult("Failed to get AI response"); }
    finally { setAILoading(false); }
  };

  const insertAIResult = () => {
    if (!editor || !aiResult) return;
    if (aiMode === "summarize") {
      editor.commands.insertContent(`<blockquote><p><strong>AI Summary:</strong> ${aiResult}</p></blockquote><p></p>`);
    } else {
      editor.commands.setContent(`<p>${aiResult.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>")}</p>`);
    }
    toast.success("Content inserted");
    setShowAI(false);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredDocs = docs.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    docPreview(d.content).toLowerCase().includes(search.toLowerCase())
  );
  const pinnedDocs = filteredDocs.filter(d => d.pinned);
  const unpinnedDocs = filteredDocs.filter(d => !d.pinned);
  const selectedDoc = docs.find(d => d.id === selectedId);
  const wordCount = editor ? countWords(editor.getHTML()) : 0;
  const secInfo = SECURITY_LABELS.find(s => s.value === securityLabel)!;

  // Page setup → paper dimensions / padding
  const baseSize = PAGE_SIZES[pageSetup.size];
  const paperW = pageSetup.orientation === "Landscape" ? baseSize.h : baseSize.w;
  const paperH = pageSetup.orientation === "Landscape" ? baseSize.w : baseSize.h;
  const marginPx = MARGIN_PRESETS[pageSetup.margins];
  // Estimated page count from content height vs page height (best-effort).
  const estimatedPages = Math.max(1, Math.ceil((wordCount * 6.2) / Math.max(1, (paperH - marginPx.v * 2))) || 1);

  const rightPanelOpen = showAI || showComments || showHistory;

  // Close menus on outside click
  const closeMenus = () => { setHeadingMenu(false); setShowExportMenu(false); setShowSecurityMenu(false); setShowTemplateMenu(false); setShowPageSetupMenu(false); setShowStats(false); };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-white overflow-hidden text-[#202124]" onClick={closeMenus}>

      {/* ── Doc list sidebar ── */}
      <aside className="w-64 flex flex-col border-r border-[#e8eaed] bg-[#f8f9fa] overflow-hidden flex-shrink-0">
        <div className="px-3 pt-3">
          <a href="/apps" title="Back to Apps"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4] rounded-md px-2 py-1 -ml-1 transition-colors">
            <ChevronDown className="h-3.5 w-3.5 rotate-90" /> Apps
          </a>
        </div>
        <div className="p-3 border-b border-[#e8eaed]">
          <button onClick={() => void createDoc()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7] transition-colors">
            <Plus className="h-4 w-4" /> New document
          </button>
        </div>
        <div className="px-3 py-2 border-b border-[#e8eaed]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#80868b]" />
            <input className="w-full pl-8 pr-2 py-1.5 text-xs bg-white border border-[#e8eaed] rounded-lg placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60"
              placeholder="Search documents…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#1a56db]" /></div>
          ) : (
            <>
              {pinnedDocs.length > 0 && (
                <div className="mb-1">
                  <p className="px-3 py-1 text-[10px] font-semibold text-[#80868b] uppercase tracking-wider">Pinned</p>
                  {pinnedDocs.map(doc => <DocItem key={doc.id} doc={doc} selected={doc.id === selectedId} onSelect={() => selectDoc(doc)} onPin={pinDoc} onDelete={deleteDoc} />)}
                  <div className="h-px bg-[#e8eaed] mx-3 my-1" />
                </div>
              )}
              {unpinnedDocs.map(doc => <DocItem key={doc.id} doc={doc} selected={doc.id === selectedId} onSelect={() => selectDoc(doc)} onPin={pinDoc} onDelete={deleteDoc} />)}
              {filteredDocs.length === 0 && (
                <div className="text-center py-8 px-4">
                  <FileText className="h-8 w-8 text-[#bdc1c6] mx-auto mb-2" />
                  <p className="text-xs text-[#80868b]">{search ? "No matching documents" : "No documents yet"}</p>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* ── Main editor ── */}
      {selectedId ? (
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* Title & action bar */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e8eaed] bg-white z-10 flex-wrap">
            <input
              className="flex-1 min-w-32 text-base font-semibold text-[#202124] bg-transparent border-none outline-none focus:bg-[#f1f3f4] rounded px-1"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={e => void saveTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
              placeholder="Untitled Document"
            />

            {/* Security label */}
            <div className="relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowSecurityMenu(v => !v)}
                className={`flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold rounded border ${secInfo.bg} ${secInfo.color}`}>
                <Shield className="h-3 w-3" /> {secInfo.label} <ChevronDown className="h-2.5 w-2.5" />
              </button>
              {showSecurityMenu && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-[#e8eaed] rounded-lg shadow-lg z-50 py-1">
                  {SECURITY_LABELS.map(sl => (
                    <button key={sl.value} onClick={() => { setSecurityLabel(sl.value); setShowSecurityMenu(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[#f1f3f4] ${securityLabel === sl.value ? `${sl.color} font-semibold` : "text-[#5f6368]"}`}>
                      <Shield className="h-3 w-3" /> {sl.label}
                      {securityLabel === sl.value && <Check className="h-3 w-3 ml-auto" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Collab avatars */}
            {collaborators.slice(0, 3).map(c => (
              <div key={c.userId} title={c.name} className="w-6 h-6 rounded-full bg-[#1a56db] flex items-center justify-center text-white text-[9px] font-bold border-2 border-white -ml-2 first:ml-0">
                {c.name[0]?.toUpperCase()}
              </div>
            ))}

            {isOffline && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-[#f4b400]">
                <WifiOff className="h-3.5 w-3.5" /> Offline — editing locally
              </span>
            )}

            <span className="text-[11px] text-[#80868b]">
              {saving ? <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Saving…</span> : <span className="text-[#0f9d58]">Saved</span>}
            </span>

            <div className="flex items-center gap-0.5">
              {/* Page setup */}
              <div className="relative" onClick={e => e.stopPropagation()}>
                <IconBtn icon={<FileCog className="h-4 w-4" />} title="Page setup" active={showPageSetupMenu} onClick={() => { setShowPageSetupMenu(v => !v); setShowStats(false); }} />
                {showPageSetupMenu && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-[#e8eaed] rounded-lg shadow-lg z-50 p-3 space-y-3">
                    <p className="text-xs font-semibold text-[#202124]">Page setup</p>
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-[#5f6368]">Page size</p>
                      <div className="grid grid-cols-3 gap-1">
                        {(["Letter", "A4", "Legal"] as const).map(s => (
                          <button key={s} onClick={() => updatePageSetup({ size: s })}
                            className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors ${pageSetup.size === s ? "bg-[#e8f0fe] text-[#1a56db] border-[#1a56db]/40" : "border-[#e8eaed] text-[#5f6368] hover:bg-[#f1f3f4]"}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-[#5f6368]">Orientation</p>
                      <div className="grid grid-cols-2 gap-1">
                        {(["Portrait", "Landscape"] as const).map(o => (
                          <button key={o} onClick={() => updatePageSetup({ orientation: o })}
                            className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors ${pageSetup.orientation === o ? "bg-[#e8f0fe] text-[#1a56db] border-[#1a56db]/40" : "border-[#e8eaed] text-[#5f6368] hover:bg-[#f1f3f4]"}`}>
                            {o}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-[#5f6368]">Margins</p>
                      <div className="grid grid-cols-3 gap-1">
                        {(["Normal", "Narrow", "Wide"] as const).map(m => (
                          <button key={m} onClick={() => updatePageSetup({ margins: m })}
                            className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors ${pageSetup.margins === m ? "bg-[#e8f0fe] text-[#1a56db] border-[#1a56db]/40" : "border-[#e8eaed] text-[#5f6368] hover:bg-[#f1f3f4]"}`}>
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Header / footer toggle */}
              <IconBtn icon={<PanelTop className="h-4 w-4" />} title="Header & footer" active={headerFooter.enabled} onClick={() => updateHeaderFooter({ enabled: !headerFooter.enabled })} />

              {/* Document stats */}
              <div className="relative" onClick={e => e.stopPropagation()}>
                <IconBtn icon={<BarChart3 className="h-4 w-4" />} title="Word count & stats" active={showStats} onClick={() => { const open = !showStats; setShowStats(open); setShowPageSetupMenu(false); if (open) refreshStats(); }} />
                {showStats && (
                  <div className="absolute right-0 top-full mt-1 w-60 bg-white border border-[#e8eaed] rounded-lg shadow-lg z-50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 className="h-4 w-4 text-[#1a56db]" />
                      <p className="text-xs font-semibold text-[#202124]">Document stats</p>
                    </div>
                    <div className="space-y-1.5">
                      {([
                        ["Words", stats.words.toLocaleString()],
                        ["Characters", stats.charsWithSpaces.toLocaleString()],
                        ["Characters (no spaces)", stats.charsNoSpaces.toLocaleString()],
                        ["Sentences", stats.sentences.toLocaleString()],
                        ["Paragraphs", stats.paragraphs.toLocaleString()],
                        ["Reading time", stats.readingMinutes + " min"],
                      ] as const).map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between text-xs">
                          <span className="text-[#5f6368]">{label}</span>
                          <span className="font-semibold text-[#202124]">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Templates */}
              <div className="relative" onClick={e => e.stopPropagation()}>
                <IconBtn icon={<LayoutTemplate className="h-4 w-4" />} title="Templates" active={showTemplateMenu} onClick={() => setShowTemplateMenu(v => !v)} />
                {showTemplateMenu && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-[#e8eaed] rounded-lg shadow-lg z-50 py-1">
                    <p className="px-3 py-1 text-[10px] font-medium text-[#80868b]">Start from template</p>
                    {DOC_TEMPLATES.map(tpl => (
                      <MenuItm key={tpl.id} onClick={() => applyTemplate(tpl)}>
                        <FileText className="h-3.5 w-3.5 text-[#5f6368]" /> {tpl.label}
                      </MenuItm>
                    ))}
                  </div>
                )}
              </div>
              <IconBtn icon={<BookOpen className="h-4 w-4" />} title="Document outline" active={showOutline} onClick={() => setShowOutline(v => !v)} />
              <IconBtn icon={<MessageSquare className="h-4 w-4" />} title="Comments" active={showComments} onClick={() => { setShowComments(v => !v); setShowAI(false); setShowHistory(false); }} />
              <IconBtn icon={<History className="h-4 w-4" />} title="Version history" active={showHistory} onClick={() => { setShowHistory(v => !v); setShowAI(false); setShowComments(false); }} />
              <IconBtn icon={<Sparkles className="h-4 w-4" />} title="AI assistant" active={showAI} activeClass="text-purple-600 bg-purple-50" onClick={() => { setShowAI(v => !v); setShowComments(false); setShowHistory(false); }} />
              <div className="relative" onClick={e => e.stopPropagation()}>
                <IconBtn icon={<Download className="h-4 w-4" />} title="Export" onClick={() => setShowExportMenu(v => !v)} />
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-[#e8eaed] rounded-lg shadow-lg z-50 py-1">
                    <MenuItm onClick={() => { printDoc(); setShowExportMenu(false); }}>🖨 Print / Save as PDF</MenuItm>
                    <MenuItm onClick={() => { exportHTML(); setShowExportMenu(false); }}>🌐 Export as HTML</MenuItm>
                    <MenuItm onClick={() => { exportText(); setShowExportMenu(false); }}>📄 Export as Plain Text</MenuItm>
                  </div>
                )}
              </div>
              <button onClick={() => setShowShare(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7] transition-colors ml-1">
                <Share2 className="h-3.5 w-3.5" /> Share
              </button>
            </div>
          </div>

          {/* Formatting toolbar */}
          <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-[#e8eaed] bg-white z-10 overflow-x-auto" onClick={e => e.stopPropagation()}>
            <TB icon={<Undo2 className="h-3.5 w-3.5" />} title="Undo (⌘Z)" onClick={() => editor?.commands.undo()} />
            <TB icon={<Redo2 className="h-3.5 w-3.5" />} title="Redo (⌘⇧Z)" onClick={() => editor?.commands.redo()} />
            <TSep />

            {/* Heading picker */}
            <div className="relative">
              <button onClick={() => setHeadingMenu(v => !v)}
                className="flex items-center gap-1 px-2 py-1 text-xs border border-[#e8eaed] rounded h-7 text-[#5f6368] hover:bg-[#f1f3f4] min-w-[96px]">
                {[1,2,3,4,5,6].find(l => editor?.isActive("heading", { level: l }))
                  ? `Heading ${[1,2,3,4,5,6].find(l => editor?.isActive("heading", { level: l }))}`
                  : "Normal text"}
                <ChevronDown className="h-3 w-3 ml-auto" />
              </button>
              {headingMenu && (
                <div className="absolute top-full left-0 mt-1 w-44 bg-white border border-[#e8eaed] rounded-lg shadow-lg z-50 py-1">
                  <button className="w-full px-3 py-2 text-sm text-[#202124] hover:bg-[#f1f3f4] text-left" onClick={() => { editor?.chain().focus().setParagraph().run(); setHeadingMenu(false); }}>Normal text</button>
                  {([1,2,3,4,5,6] as const).map(l => (
                    <button key={l}
                      className={`w-full px-3 py-1.5 hover:bg-[#f1f3f4] text-left font-semibold text-[#202124] ${l === 1 ? "text-xl" : l === 2 ? "text-lg" : l === 3 ? "text-base" : "text-sm"}`}
                      onClick={() => { editor?.chain().focus().toggleHeading({ level: l }).run(); setHeadingMenu(false); }}>
                      H{l} — Heading {l}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <TSep />

            {/* Font family */}
            <select
              title="Font"
              className="h-7 px-1.5 text-xs border border-[#e8eaed] rounded text-[#5f6368] bg-white hover:bg-[#f1f3f4] focus:outline-none focus:border-[#1a56db]/60 cursor-pointer"
              value={(editor?.getAttributes("textStyle").fontFamily as string) ?? ""}
              onChange={e => {
                const v = e.target.value;
                const c = editor?.chain().focus() as unknown as { setFontFamily: (v: string) => { run: () => void }; unsetFontFamily: () => { run: () => void } } | undefined;
                if (v) c?.setFontFamily(v).run();
                else c?.unsetFontFamily().run();
              }}>
              <option value="">Font</option>
              {["Arial", "Georgia", "Times New Roman", "Courier New", "Verdana", "Roboto"].map(f => (
                <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
              ))}
            </select>

            {/* Font size */}
            <select
              title="Font size"
              className="h-7 px-1.5 text-xs border border-[#e8eaed] rounded text-[#5f6368] bg-white hover:bg-[#f1f3f4] focus:outline-none focus:border-[#1a56db]/60 cursor-pointer"
              value={((editor?.getAttributes("textStyle").fontSize as string) ?? "").replace("px", "")}
              onChange={e => {
                const v = e.target.value;
                const c = editor?.chain().focus() as unknown as { setFontSize: (v: string) => { run: () => void }; unsetFontSize: () => { run: () => void } } | undefined;
                if (v) c?.setFontSize(v + "px").run();
                else c?.unsetFontSize().run();
              }}>
              <option value="">Size</option>
              {[10, 12, 14, 16, 18, 24, 30, 36].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            {/* Text color */}
            <label title="Text color" className="flex items-center justify-center h-7 w-7 rounded text-[#5f6368] hover:bg-[#f1f3f4] cursor-pointer relative">
              <Type className="h-3.5 w-3.5" />
              <input type="color" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                value={(editor?.getAttributes("textStyle").color as string) ?? "#202124"}
                onChange={e => (editor?.chain().focus() as unknown as { setColor: (v: string) => { run: () => void } } | undefined)?.setColor(e.target.value).run()} />
            </label>

            {/* Highlight color */}
            <label title="Highlight color"
              className={`flex items-center justify-center h-7 w-7 rounded cursor-pointer relative ${editor?.isActive("highlight") ? "bg-[#e8f0fe] text-[#1a56db]" : "text-[#5f6368] hover:bg-[#f1f3f4]"}`}>
              <Highlighter className="h-3.5 w-3.5" />
              <input type="color" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                value={(editor?.getAttributes("highlight").color as string) ?? "#fff176"}
                onChange={e => (editor?.chain().focus() as unknown as { toggleHighlight: (o: { color: string }) => { run: () => void } } | undefined)?.toggleHighlight({ color: e.target.value }).run()} />
            </label>
            <TB icon={<X className="h-3.5 w-3.5" />} title="Clear highlight" active={false} onClick={() => (editor?.chain().focus() as unknown as { unsetHighlight: () => { run: () => void } } | undefined)?.unsetHighlight().run()} />
            <TSep />

            <TB icon={<Bold className="h-3.5 w-3.5" />} title="Bold (⌘B)" active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()} />
            <TB icon={<Italic className="h-3.5 w-3.5" />} title="Italic (⌘I)" active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()} />
            <TB icon={<Underline className="h-3.5 w-3.5" />} title="Underline" onClick={() => editor?.chain().focus().toggleMark?.("underline").run()} />
            <TB icon={<Strikethrough className="h-3.5 w-3.5" />} title="Strikethrough" active={editor?.isActive("strike")} onClick={() => editor?.chain().focus().toggleStrike().run()} />
            <TB icon={<Code className="h-3.5 w-3.5" />} title="Code" active={editor?.isActive("code")} onClick={() => editor?.chain().focus().toggleCode().run()} />
            <TSep />

            <TB icon={<AlignLeft className="h-3.5 w-3.5" />} title="Align left" active={editor?.isActive({ textAlign: "left" })} onClick={() => (editor?.chain().focus() as ReturnType<typeof editor.chain> & { setTextAlign?: (v: string) => { run: () => void } })?.setTextAlign?.("left").run()} />
            <TB icon={<AlignCenter className="h-3.5 w-3.5" />} title="Align center" active={editor?.isActive({ textAlign: "center" })} onClick={() => (editor?.chain().focus() as ReturnType<typeof editor.chain> & { setTextAlign?: (v: string) => { run: () => void } })?.setTextAlign?.("center").run()} />
            <TB icon={<AlignRight className="h-3.5 w-3.5" />} title="Align right" active={editor?.isActive({ textAlign: "right" })} onClick={() => (editor?.chain().focus() as ReturnType<typeof editor.chain> & { setTextAlign?: (v: string) => { run: () => void } })?.setTextAlign?.("right").run()} />
            <TB icon={<AlignJustify className="h-3.5 w-3.5" />} title="Justify" active={editor?.isActive({ textAlign: "justify" })} onClick={() => (editor?.chain().focus() as ReturnType<typeof editor.chain> & { setTextAlign?: (v: string) => { run: () => void } })?.setTextAlign?.("justify").run()} />
            <TSep />

            <TB icon={<List className="h-3.5 w-3.5" />} title="Bullet list" active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()} />
            <TB icon={<ListOrdered className="h-3.5 w-3.5" />} title="Numbered list" active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
            <TB icon={<ListChecks className="h-3.5 w-3.5" />} title="Checklist" active={editor?.isActive("taskList")} onClick={() => (editor?.chain().focus() as unknown as { toggleTaskList?: () => { run: () => boolean } })?.toggleTaskList?.()?.run?.()} />
            <TB icon={<IndentDecrease className="h-3.5 w-3.5" />} title="Decrease indent" onClick={() => editor?.chain().focus().liftListItem("listItem").run()} />
            <TB icon={<IndentIncrease className="h-3.5 w-3.5" />} title="Increase indent" onClick={() => editor?.chain().focus().sinkListItem("listItem").run()} />
            <TSep />

            <TB icon={<Quote className="h-3.5 w-3.5" />} title="Blockquote" active={editor?.isActive("blockquote")} onClick={() => editor?.chain().focus().toggleBlockquote().run()} />
            <TB icon={<Type className="h-3.5 w-3.5" />} title="Code block" active={editor?.isActive("codeBlock")} onClick={() => editor?.chain().focus().toggleCodeBlock().run()} />
            <TB icon={<Minus className="h-3.5 w-3.5" />} title="Horizontal rule" onClick={() => editor?.chain().focus().setHorizontalRule().run()} />
            <TB icon={<Table className="h-3.5 w-3.5" />} title="Insert table (3×3)" onClick={() => { (editor?.chain().focus() as unknown as { insertTable?: (o: { rows: number; cols: number; withHeaderRow: boolean }) => { run: () => boolean } })?.insertTable?.({ rows: 3, cols: 3, withHeaderRow: true })?.run?.(); }} />
            <label title="Insert image (upload)" className="flex items-center justify-center h-7 w-7 rounded text-sm text-[#5f6368] hover:bg-[#f1f3f4] cursor-pointer transition-colors">
              <ImageIcon className="h-3.5 w-3.5" />
              <input type="file" accept="image/*" className="hidden" onChange={e => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 5 * 1024 * 1024) { toast.error("Image too large (max 5MB)"); return; }
                const reader = new FileReader();
                reader.onload = () => (editor?.chain().focus() as unknown as { setImage?: (o: { src: string }) => { run: () => boolean } })?.setImage?.({ src: String(reader.result) })?.run?.();
                reader.readAsDataURL(f);
                e.currentTarget.value = "";
              }} />
            </label>
            <TB icon={<Link2 className="h-3.5 w-3.5" />} title="Insert link" active={editor?.isActive("link")} onClick={() => { const u = prompt("URL:"); if (u) editor?.chain().focus().setLink?.({ href: u }).run(); else editor?.chain().focus().unsetLink?.().run(); }} />
            <TSep />

            <TB icon={<SuperscriptIcon className="h-3.5 w-3.5" />} title="Superscript" active={editor?.isActive("superscript")} onClick={() => (editor?.chain().focus() as unknown as { toggleSuperscript: () => { run: () => void } } | undefined)?.toggleSuperscript().run()} />
            <TB icon={<SubscriptIcon className="h-3.5 w-3.5" />} title="Subscript" active={editor?.isActive("subscript")} onClick={() => (editor?.chain().focus() as unknown as { toggleSubscript: () => { run: () => void } } | undefined)?.toggleSubscript().run()} />
            <TB icon={<RemoveFormatting className="h-3.5 w-3.5" />} title="Clear formatting" onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()} />
            <TSep />

            <span className="text-[11px] text-[#80868b] px-1 whitespace-nowrap">{wordCount} words</span>
          </div>

          {/* Content row */}
          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* Document outline */}
            {showOutline && outline.length > 0 && (
              <div className="w-44 border-r border-[#e8eaed] overflow-y-auto py-4 px-3 flex-shrink-0 bg-white">
                <p className="text-[10px] font-semibold text-[#80868b] uppercase tracking-wider mb-2">Outline</p>
                <nav className="space-y-1">
                  {outline.map((h, i) => (
                    <button key={i} className="w-full text-left text-xs text-[#5f6368] hover:text-[#1a56db] hover:bg-[#f1f3f4] rounded px-1 py-0.5 truncate"
                      style={{ paddingLeft: (h.level - 1) * 8 + 4 }}>
                      {h.text}
                    </button>
                  ))}
                </nav>
              </div>
            )}

            {/* Paper editor */}
            <div className="flex-1 overflow-y-auto bg-[#f4f6f8]">
              <div
                className="mx-auto my-8 bg-white shadow border border-[#e8eaed] rounded-lg flex flex-col"
                style={{ width: paperW, maxWidth: "100%", minHeight: paperH }}
              >
                {headerFooter.enabled && (
                  <div
                    className="border-b border-dashed border-[#e8eaed]"
                    style={{ paddingLeft: marginPx.h, paddingRight: marginPx.h, paddingTop: Math.min(marginPx.v, 40), paddingBottom: 12 }}
                  >
                    <input
                      className="w-full bg-transparent text-xs text-[#5f6368] placeholder:text-[#80868b] outline-none focus:bg-[#f8f9fa] rounded px-1 py-0.5"
                      placeholder="Header (e.g. document title, author)…"
                      value={headerFooter.header}
                      onChange={e => updateHeaderFooter({ header: e.target.value })}
                    />
                  </div>
                )}
                <div className="flex-1" style={{ paddingLeft: marginPx.h, paddingRight: marginPx.h, paddingTop: marginPx.v, paddingBottom: marginPx.v }}>
                  <EditorContent editor={editor} />
                </div>
                {headerFooter.enabled && (
                  <div
                    className="border-t border-dashed border-[#e8eaed] flex items-center gap-2"
                    style={{ paddingLeft: marginPx.h, paddingRight: marginPx.h, paddingTop: 12, paddingBottom: Math.min(marginPx.v, 40) }}
                  >
                    <input
                      className="flex-1 bg-transparent text-xs text-[#5f6368] placeholder:text-[#80868b] outline-none focus:bg-[#f8f9fa] rounded px-1 py-0.5"
                      placeholder="Footer…"
                      value={headerFooter.footer}
                      onChange={e => updateHeaderFooter({ footer: e.target.value })}
                    />
                    <span className="text-[11px] text-[#80868b] whitespace-nowrap flex-shrink-0">
                      {"Page 1 of " + estimatedPages}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Right panel */}
            {rightPanelOpen && (
              <div className="w-80 border-l border-[#e8eaed] bg-white flex flex-col overflow-hidden flex-shrink-0">
                <div className="flex items-center border-b border-[#e8eaed]">
                  {showAI      && <PanelTab active icon={<Sparkles className="h-3.5 w-3.5" />} label="AI" onClick={() => {}} />}
                  {showComments && <PanelTab active icon={<MessageSquare className="h-3.5 w-3.5" />} label="Comments" onClick={() => {}} />}
                  {showHistory  && <PanelTab active icon={<History className="h-3.5 w-3.5" />} label="History" onClick={() => {}} />}
                  <button className="ml-auto p-2 text-[#80868b] hover:text-[#202124]" onClick={() => { setShowAI(false); setShowComments(false); setShowHistory(false); }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* AI Panel */}
                {showAI && (
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-1.5">
                      {(["summarize","rewrite","expand","shorten","grammar","generate"] as const).map(m => (
                        <button key={m} onClick={() => setAIMode(m)}
                          className={`px-2 py-1.5 text-[11px] font-medium rounded-lg border capitalize transition-colors ${aiMode === m ? "bg-purple-50 text-purple-700 border-purple-200" : "border-[#e8eaed] text-[#5f6368] hover:bg-[#f1f3f4]"}`}>
                          {m}
                        </button>
                      ))}
                    </div>
                    {aiMode === "generate" && (
                      <textarea className="w-full px-3 py-2 text-xs bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg resize-none focus:outline-none focus:border-[#1a56db]/60"
                        rows={3} placeholder="Describe the document you want to generate…"
                        value={aiPrompt} onChange={e => setAIPrompt(e.target.value)} />
                    )}
                    <button onClick={() => void runAI()} disabled={aiLoading}
                      className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors">
                      {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {aiLoading ? "Thinking…" : `Run AI: ${aiMode}`}
                    </button>
                    {aiResult && (
                      <>
                        <div className="bg-[#f8f9fa] rounded-lg p-3 text-xs text-[#202124] whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto border border-[#e8eaed]">{aiResult}</div>
                        <button onClick={insertAIResult} className="w-full py-2 text-xs font-semibold text-[#1a56db] border border-[#1a56db]/30 rounded-lg hover:bg-[#e8f0fe] transition-colors">
                          Insert into document
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Comments Panel */}
                {showComments && (
                  <div className="flex-1 overflow-y-auto flex flex-col">
                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                      {comments.length === 0 ? (
                        <div className="text-center py-8">
                          <MessageSquare className="h-8 w-8 mx-auto mb-2 text-[#bdc1c6]" />
                          <p className="text-xs text-[#80868b]">No comments yet</p>
                        </div>
                      ) : comments.map(c => (
                        <div key={c.id} className={`rounded-lg border p-3 space-y-2 ${c.resolved ? "opacity-50" : "bg-[#f8f9fa]"} border-[#e8eaed]`}>
                          <div className="flex items-center gap-2">
                            <div className="h-5 w-5 rounded-full bg-[#1a56db] text-white text-[9px] flex items-center justify-center font-bold">{c.author[0]}</div>
                            <span className="text-xs font-medium text-[#202124]">{c.author}</span>
                            <span className="text-[10px] text-[#80868b] ml-auto">{formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}</span>
                          </div>
                          <p className="text-xs text-[#5f6368]">{c.text}</p>
                          {!c.resolved && (
                            <button onClick={() => setComments(prev => prev.map(x => x.id === c.id ? { ...x, resolved: true } : x))}
                              className="text-[11px] text-[#0f9d58] font-medium hover:underline">
                              ✓ Resolve
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-[#e8eaed] p-3 space-y-2">
                      <textarea className="w-full px-3 py-2 text-xs bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg resize-none focus:outline-none focus:border-[#1a56db]/60"
                        rows={2} placeholder="Add comment (Enter to post)…" value={newComment}
                        onChange={e => setNewComment(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); } }} />
                      <button onClick={addComment} className="w-full py-1.5 text-xs font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7]">Post comment</button>
                    </div>
                  </div>
                )}

                {/* History Panel */}
                {showHistory && (
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-[#5f6368]">Saved versions</p>
                      <button onClick={saveVersion} className="text-xs text-[#1a56db] hover:underline">Save now</button>
                    </div>
                    {versions.length === 0 ? (
                      <div className="text-center py-8">
                        <Clock className="h-8 w-8 mx-auto mb-2 text-[#bdc1c6]" />
                        <p className="text-xs text-[#80868b] mb-3">No saved versions</p>
                        <button onClick={saveVersion} className="px-3 py-1.5 text-xs font-semibold bg-[#1a56db] text-white rounded-lg hover:bg-[#1648c7]">
                          Save current version
                        </button>
                      </div>
                    ) : versions.map(v => (
                      <div key={v.id} className="border border-[#e8eaed] rounded-lg p-3 bg-[#f8f9fa]">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium text-[#202124] truncate">{v.title}</span>
                          <span className="text-[10px] text-[#80868b]">{v.wordCount}w</span>
                        </div>
                        <p className="text-[10px] text-[#80868b] mb-1.5">{format(new Date(v.savedAt), "MMM d, h:mm a")}</p>
                        <button onClick={() => restoreVersion(v)} className="text-xs text-[#1a56db] font-medium hover:underline">Restore</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Empty / welcome state */
        <div className="flex-1 flex flex-col items-center justify-center bg-[#f4f6f8] gap-4">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center">
            <FileText className="h-8 w-8 text-[#1a56db]" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold text-[#202124] mb-1">Nexus Docs</h2>
            <p className="text-sm text-[#5f6368] mb-4">Rich text documents with AI, collaboration & version history</p>
            <button onClick={() => void createDoc()}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#1a56db] text-white text-sm font-semibold rounded-lg hover:bg-[#1648c7] transition-colors mx-auto">
              <Plus className="h-4 w-4" /> New document
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-2 max-w-md">
            {["Blank document","Meeting notes","Project SOP","Policy document","Technical spec","Team handbook"].map(t => (
              <button key={t} onClick={() => void createDoc()}
                className="px-3 py-3 bg-white border border-[#e8eaed] rounded-xl text-xs font-medium text-[#5f6368] hover:border-[#1a56db]/30 hover:text-[#1a56db] transition-colors text-center shadow-sm">
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {showShare && selectedDoc && (
        <DocShareModal docId={selectedDoc.id} docType="sheet" onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

function IconBtn({ icon, title, active, activeClass, onClick }: {
  icon: React.ReactNode; title: string; active?: boolean; activeClass?: string; onClick: () => void;
}) {
  return (
    <button title={title} onClick={onClick}
      className={`p-1.5 rounded transition-colors ${active ? (activeClass ?? "bg-[#e8f0fe] text-[#1a56db]") : "text-[#5f6368] hover:bg-[#f1f3f4]"}`}>
      {icon}
    </button>
  );
}

function MenuItm({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs text-[#202124] hover:bg-[#f1f3f4]">
      {children}
    </button>
  );
}
