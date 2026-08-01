"use client";

/**
 * Nexus Docs — Google Docs + Word competitor
 * Features: full Tiptap editor, AI panel, outline, comments, version history,
 * export PDF/HTML, security labels, share, real-time collaboration
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus, Search, FileText, Trash2, Pin, PinOff, Loader2, Share2,
  Bold, Italic, Underline, Strikethrough, Code, Quote, Link2,
  List, ListOrdered, ListChecks, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Minus, Table, Image as ImageIcon,
  Undo2, Redo2, ChevronDown, Sparkles, MessageSquare, History,
  Download, Shield, X, Check, CheckCheck, XCircle,
  IndentDecrease, IndentIncrease, Type,
  BookOpen, LayoutTemplate, WifiOff,
  Superscript as SuperscriptIcon, Subscript as SubscriptIcon, RemoveFormatting, Highlighter,
  FileCog, PanelTop, BarChart3, AlignVerticalSpaceAround, Sigma, ListTree,
  BookmarkPlus, GitMerge, Accessibility, Mic,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useEditor, EditorContent } from "@tiptap/react";
import { Mark } from "@tiptap/core";
import { ReplaceStep } from "prosemirror-transform";
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
// CollaborationCursor imported lazily to avoid CRDT hydration issues
// import CollaborationCursor from "@tiptap/extension-collaboration-cursor";

import { DocShareModal } from "./DocShareModal";
import { DocVersionHistory, snapshotVersion } from "./DocVersionHistory";
import { DocComments } from "./DocComments";
import { useRecordOpen } from "@/lib/use-recent";
import { ConflictBanner, useSaveConflict } from "./ConflictBanner";
import { ShortcutHelp, DOCS_SHORTCUTS } from "./ShortcutHelp";
import { AccessibilityPanel } from "./AccessibilityPanel";
import { InsertRangeDialog } from "./InsertRangeDialog";
import { useVoiceTyping } from "@/lib/use-voice-typing";
import { docToSlides } from "@/lib/doc-to-slides";
import { appUrl } from "@/lib/subdomains";
import { downloadDocx, docxFileToHtml } from "@/lib/docx-export";

// ─── Track-changes marks ──────────────────────────────────────────────────────

const genSuggId = () => Math.random().toString(36).slice(2, 9);

const TrackInsert = Mark.create({
  name: "trackInsert",
  spanning: true,
  addAttributes() {
    return {
      id:     { default: null },
      author: { default: "You" },
    };
  },
  parseHTML() { return [{ tag: "ins[data-sugg]" }]; },
  renderHTML({ HTMLAttributes }) {
    return ["ins", { "data-sugg": "", "data-id": HTMLAttributes.id, "data-author": HTMLAttributes.author,
      style: "color:#0e7c5a;text-decoration:underline;background:color-mix(in srgb, var(--ok) 8%, transparent);border-radius:2px;" }, 0];
  },
});

const TrackDelete = Mark.create({
  name: "trackDelete",
  spanning: true,
  addAttributes() {
    return {
      id:     { default: null },
      author: { default: "You" },
    };
  },
  parseHTML() { return [{ tag: "del[data-sugg]" }]; },
  renderHTML({ HTMLAttributes }) {
    return ["del", { "data-sugg": "", "data-id": HTMLAttributes.id, "data-author": HTMLAttributes.author,
      style: "color:#c0362c;text-decoration:line-through;background:color-mix(in srgb, var(--crit) 7%, transparent);border-radius:2px;opacity:0.85;" }, 0];
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────

type Doc = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

type SecurityLabel = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";

const SECURITY_LABELS: { value: SecurityLabel; label: string; color: string; bg: string }[] = [
  { value: "PUBLIC",       label: "Public",       color: "text-ok", bg: "bg-ok/10 border-ok/20" },
  { value: "INTERNAL",     label: "Internal",     color: "text-accent", bg: "bg-accent/10 border-accent/20"    },
  { value: "CONFIDENTIAL", label: "Confidential", color: "text-warn", bg: "bg-warn/10 border-warn/20"  },
  { value: "RESTRICTED",   label: "Restricted",   color: "text-crit", bg: "bg-crit/10 border-crit/20"      },
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

// Version history now lives on the server (DocumentVersion table, rendered by
// <DocVersionHistory>). The previous localStorage implementation — 20 snapshots
// under `nexus_doc_versions_<id>` — was per-browser, invisible to collaborators
// and lost on a cache clear, so it was removed rather than kept in parallel.

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

// Assign each user a stable accent colour for their cursor
const COLLAB_COLORS = ["#4f46e5","#0e7c5a","#b45309","#c0362c","#a142f4","#b45309","#00bcd4","#e91e63"];
function userColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return COLLAB_COLORS[h % COLLAB_COLORS.length];
}

function useDocCollab(docId: string | null) {
  const ydocRef = useRef<Y.Doc | null>(null);
  const [collaborators, setCollaborators] = useState<{ userId: string; name: string; color: string }[]>([]);

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
          const color = userColor(msg.userId);
          // Update awareness state so CollaborationCursor can render remote carets
          // (awareness updates are local — real cursor sync needs WebSocket; this gives coloured avatars)
          setCollaborators(prev => {
            const filtered = prev.filter(c => c.userId !== msg.userId);
            return [...filtered, { userId: msg.userId!, name: msg.name ?? "Unknown", color }];
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
      className={`flex items-center justify-center h-7 w-7 rounded text-sm transition-colors ${active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-sunken"}`}>
      {icon}
    </button>
  );
}

function TSep() { return <div className="w-px h-5 bg-border mx-0.5" />; }

function PanelTab({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${active ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"}`}>
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
      className={`group flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors ${selected ? "bg-accent-soft" : "hover:bg-border"}`}
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <FileText className={`h-4 w-4 flex-shrink-0 mt-0.5 ${selected ? "text-accent" : "text-subtle"}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium truncate ${selected ? "text-accent" : "text-foreground"}`}>{doc.title}</p>
        <p className="text-[10px] text-subtle truncate">{docPreview(doc.content)}</p>
        <p className="text-[10px] text-subtle">{formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}</p>
      </div>
      {hover && (
        <div className="flex flex-col gap-0.5">
          <button onClick={e => onPin(doc.id, doc.pinned, e)} className="p-0.5 rounded text-subtle hover:text-foreground">
            {doc.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          </button>
          <button onClick={e => onDelete(doc.id, e)} className="p-0.5 rounded text-subtle hover:text-crit">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DocsView() {
  const searchParams = useSearchParams();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  // Mirrors `title` so the auto-save interval can read it without re-creating
  // the interval on every keystroke in the title field.
  const titleRef = useRef("");
  titleRef.current = title;
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
  const [docColumns, setDocColumns] = useState(1);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [frFind, setFrFind] = useState("");
  const [frReplace, setFrReplace] = useState("");
  const [frCase, setFrCase] = useState(false);
  const [showStats, setShowStats] = useState(false);
  // WCAG 2.1 AA checker — see src/lib/a11y-check.ts.
  const [showA11y, setShowA11y] = useState(false);
  // Cross-app: insert a live range from a spreadsheet.
  const [showInsertRange, setShowInsertRange] = useState(false);
  const [lineHeight, setLineHeight] = useState("1.5");
  const [showLineSpacing, setShowLineSpacing] = useState(false);
  const [showSymbols, setShowSymbols] = useState(false);

  // Page setup, header/footer (per-doc, persisted)
  const [pageSetup, setPageSetup] = useState<PageSetup>(DEFAULT_PAGE_SETUP);
  const [headerFooter, setHeaderFooter] = useState<HeaderFooter>(DEFAULT_HEADER_FOOTER);
  const [stats, setStats] = useState<DocStats>(() => computeStats(""));

  // Features
  const [securityLabel, setSecurityLabel] = useState<SecurityLabel>("INTERNAL");
  const [outline, setOutline] = useState<{ level: number; text: string }[]>([]);

  // AI
  const [aiMode, setAIMode] = useState<"summarize" | "rewrite" | "expand" | "shorten" | "grammar" | "generate">("summarize");
  const [aiPrompt, setAIPrompt] = useState("");
  const [aiLoading, setAILoading] = useState(false);
  const [aiResult, setAIResult] = useState("");

  // Track-changes / Suggest mode
  const [suggestMode, setSuggestMode] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestModeRef = useRef(false);
  suggestModeRef.current = suggestMode;

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { ydoc, collaborators } = useDocCollab(selectedId);

  // Feeds the Recent views across Drive and the Docs home screen.
  useRecordOpen("doc", selectedId);

  // Save-conflict detection — autoSave writes the whole document, so without
  // this a second editor's save silently destroys the first's work.
  const saveConflict = useSaveConflict();

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
      TrackInsert,
      TrackDelete,
      Collaboration.configure({ document: ydoc }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "docs-editor-content outline-none min-h-[600px]",
        // Native browser spell-checking — red squiggles, right-click
        // corrections, the user's own dictionary and language. It was never
        // switched on, so the editor had no spell check at all.
        spellcheck: "true",
        // Screen readers otherwise announce this as an unlabelled text box.
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Document body",
      },
    },
    onCreate({ editor: ed }) {
      // Override dispatchTransaction on the ProseMirror view for suggest-mode interception
      const origDispatch = ed.view.dispatch.bind(ed.view);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ed.view as any).dispatch = (transaction: any) => {
        if (!suggestModeRef.current || !transaction.docChanged) {
          origDispatch(transaction);
          return;
        }
        const state = ed.view.state;
        const schema = state.schema;
        const insertMark = schema.marks.trackInsert?.create({ id: genSuggId(), author: "You" });
        const deleteMark = schema.marks.trackDelete?.create({ id: genSuggId(), author: "You" });

        let tr = state.tr;
        let offset = 0;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const step of (transaction.steps as any[])) {
          if (!(step instanceof ReplaceStep)) {
            try { tr = tr.step(step); } catch { /* skip non-applicable steps */ }
            continue;
          }
          const rs = step as ReplaceStep;
          const from = rs.from + offset;
          const to   = rs.to   + offset;
          const sliceSize = rs.slice.content.size;

          if (to > from && deleteMark) {
            tr = tr.addMark(from, to, deleteMark);
          }
          if (sliceSize > 0 && insertMark) {
            const insertPos = to;
            tr = tr.insert(insertPos, rs.slice.content);
            tr = tr.addMark(insertPos, insertPos + sliceSize, insertMark);
            offset += sliceSize;
          }
        }

        origDispatch(tr);
      };
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
  const openIdFromUrl = searchParams?.get("open") ?? null;
  useEffect(() => {
    fetch("/api/docs")
      .then(r => r.json())
      .then((d: Doc[]) => {
        setDocs(d);
        setLoading(false);
        // Auto-open doc if navigated from Drive with ?open=[id]
        if (openIdFromUrl) {
          const target = d.find((doc: Doc) => doc.id === openIdFromUrl);
          if (target) { setSelectedId(target.id); setTitle(target.title); }
        }
      })
      .catch(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Version auto-save every 5 minutes ────────────────────────────────────
  // Snapshots go to the server; identical or too-recent auto-saves are
  // coalesced there, so this can fire freely without flooding the history.
  useEffect(() => {
    if (!selectedId) return;
    const interval = setInterval(() => {
      if (!editor || !selectedId) return;
      const c = editor.getJSON ? JSON.stringify(editor.getJSON()) : editor.getHTML();
      if (!c || c === "{}" || c === "null") return;
      snapshotVersion(selectedId, c, titleRef.current);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [selectedId, editor]);

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
    // Baseline for conflict detection — later saves are checked against the
    // version we opened here.
    saveConflict.setBase(doc.updatedAt);
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
  }, [editor, saveConflict]);

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
      const res = await fetch(`/api/docs/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, ...saveConflict.saveFields() }),
      });
      // 409 means someone else saved since we loaded — surface it rather than
      // letting this write clobber theirs.
      if (await saveConflict.handleResponse(res)) return;
      if (!res.ok) {
        // Most commonly a 403 — a viewer-only collaborator's edits can't be
        // persisted. Without this, the editor looks like it saved (spinner
        // clears) while the change silently never reaches the server.
        toast.error(res.status === 403 ? "You have view-only access — changes weren't saved" : "Failed to save document");
        return;
      }
      setDocs(prev => prev.map(d => d.id === selectedId ? { ...d, content, updatedAt: new Date().toISOString() } : d));
      // Real save succeeded — refresh the cached draft to mirror server state.
      try {
        localStorage.setItem(docsDraftKey(selectedId), JSON.stringify({ title, content }));
      } catch { /* ignore */ }
    } finally { setSaving(false); }
  }, [selectedId, title, saveConflict]);

  const saveTitle = async (t: string) => {
    if (!selectedId) return;
    const res = await fetch(`/api/docs/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t }),
    });
    if (!res.ok) {
      toast.error(res.status === 403 ? "You have view-only access — title wasn't saved" : "Failed to rename document");
      return;
    }
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

  // ── Version history (localStorage) ────────────────────────────────────────
  // Version snapshots are server-persisted (DocumentVersion table) and rendered
  // by <DocVersionHistory>. The old localStorage helpers were removed: they
  // were per-browser, invisible to collaborators and lost on a cache clear.

  // ── Comments ──────────────────────────────────────────────────────────────
  // Threads live in the DocComment table and are rendered by <DocComments>.
  // These helpers translate between that panel's opaque `anchor` and Tiptap's
  // character positions, so a comment can be pinned to a text range.

  /** Anchor for a NEW comment: the current selection, or null when collapsed. */
  const commentAnchor = (() => {
    if (!editor) return null;
    const { from, to } = editor.state.selection;
    return from === to ? null : { from, to };
  })();

  /** Selected text, truncated — shown above the composer. */
  const commentAnchorLabel = (() => {
    if (!editor || !commentAnchor) return undefined;
    const text = editor.state.doc.textBetween(commentAnchor.from, commentAnchor.to, " ").trim();
    if (!text) return undefined;
    return text.length > 40 ? `"${text.slice(0, 40)}…"` : `"${text}"`;
  })();

  /** Chip label for an existing thread's anchor. */
  const describeDocAnchor = useCallback((anchor: unknown): string | null => {
    if (!editor || !anchor || typeof anchor !== "object") return null;
    const range = anchor as { from?: number; to?: number };
    if (typeof range.from !== "number" || typeof range.to !== "number") return null;
    // The doc may have shrunk since the comment was written — an out-of-range
    // anchor would throw inside textBetween.
    const max = editor.state.doc.content.size;
    if (range.from >= max || range.to > max) return "(text removed)";
    const text = editor.state.doc.textBetween(range.from, range.to, " ").trim();
    if (!text) return "(text removed)";
    return text.length > 24 ? `${text.slice(0, 24)}…` : text;
  }, [editor]);

  /** Clicking a thread's chip scrolls to and selects the commented text. */
  const jumpToDocAnchor = useCallback((anchor: unknown) => {
    if (!editor || !anchor || typeof anchor !== "object") return;
    const range = anchor as { from?: number; to?: number };
    if (typeof range.from !== "number" || typeof range.to !== "number") return;
    const max = editor.state.doc.content.size;
    if (range.from >= max || range.to > max) {
      toast.info("That text has since been deleted");
      return;
    }
    editor.chain().focus().setTextSelection({ from: range.from, to: range.to }).scrollIntoView().run();
  }, [editor]);

  // ── Export ────────────────────────────────────────────────────────────────
  const exportHTML = () => {
    if (!editor) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,sans-serif;max-width:820px;margin:40px auto;padding:20px 40px;line-height:1.7;color:#1a1a18}
h1{font-size:2rem;margin-top:1.5em}h2{font-size:1.5rem}h3{font-size:1.2rem}
pre{background:#f4f4f4;padding:12px;border-radius:6px;overflow:auto}
blockquote{border-left:4px solid #4f46e5;margin:0;padding-left:1em;color:#6b6a65}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #e7e6e1;padding:8px}</style></head>
<body><h1>${title}</h1>${editor.getHTML()}</body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${title}.html`; a.click();
  };

  const exportText = () => {
    if (!editor) return;
    const blob = new Blob([editor.getText()], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${title}.txt`; a.click();
  };

  // ── Cross-app: refresh every linked spreadsheet table ─────────────────────
  // Re-reads each table tagged with `data-linked-range` and replaces its rows
  // with current values. Tables are matched by their marker attribute rather
  // than by position, so editing around them doesn't break the link.
  const refreshLinkedTables = async () => {
    if (!editor) return;
    const html = editor.getHTML();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const linked = Array.from(doc.querySelectorAll("table[data-linked-range]"));
    if (!linked.length) {
      toast.info("This document has no linked spreadsheet tables");
      return;
    }

    const toastId = toast.loading(`Refreshing ${linked.length} linked table${linked.length === 1 ? "" : "s"}…`);
    let updated = 0;
    let failed = 0;

    for (const table of linked) {
      const marker = table.getAttribute("data-linked-range") ?? "";
      const [sheetId, sheetTab, range] = marker.split("|");
      if (!sheetId || !range) { failed++; continue; }
      try {
        const params = new URLSearchParams({ sheet: sheetTab ?? "", range });
        const res = await fetch(`/api/documents/${sheetId}/range?${params}`);
        if (!res.ok) { failed++; continue; }
        const data = await res.json() as { rows: (string | number | boolean | null)[][] };
        const esc = (v: unknown) =>
          String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        table.innerHTML = data.rows
          .map((row, r) =>
            `<tr>${row.map(v => (r === 0 ? `<th>${esc(v)}</th>` : `<td>${esc(v)}</td>`)).join("")}</tr>`,
          )
          .join("");
        updated++;
      } catch {
        failed++;
      }
    }

    if (updated) {
      editor.commands.setContent(doc.body.innerHTML, { emitUpdate: true });
    }
    if (failed) {
      toast.warning(
        `Refreshed ${updated}; ${failed} could not be read — the spreadsheet may have been deleted or unshared.`,
        { id: toastId },
      );
    } else {
      toast.success(`Refreshed ${updated} linked table${updated === 1 ? "" : "s"}`, { id: toastId });
    }
  };

  // ── Cross-app: turn this document into a presentation ─────────────────────
  // Each top-level heading becomes a slide; prose too long for a slide is kept
  // as speaker notes rather than dropped. See src/lib/doc-to-slides.ts.
  const convertToSlides = async () => {
    if (!editor) return;
    const generated = docToSlides(editor.getHTML(), title || "Untitled");
    if (generated.length <= 1) {
      toast.error("Add some headings or content first");
      return;
    }
    const toastId = toast.loading("Building presentation…");
    try {
      const created = await fetch("/api/slides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title || "Untitled" }),
      });
      if (!created.ok) throw new Error();
      const { id } = await created.json() as { id: string };

      const slides = generated.map((slide, i) => ({
        id: `s_${Date.now()}_${i}`,
        background: "#ffffff",
        elements: slide.elements.map((el, j) => ({
          ...el,
          id: `el_${Date.now()}_${i}_${j}`,
          zIndex: j + 1,
        })),
        notes: slide.notes,
        transition: "fade" as const,
      }));

      const saved = await fetch(`/api/slides/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || "Untitled",
          content: JSON.stringify({ slides, themeId: "default" }),
        }),
      });
      if (!saved.ok) throw new Error();

      toast.success(`Created a ${generated.length}-slide deck`, { id: toastId });
      // Slides live on the docs subdomain; a plain push can't cross origins.
      window.location.href = appUrl(`/apps/slides/${id}`);
    } catch {
      toast.error("Could not create the presentation", { id: toastId });
    }
  };

  // ── Word (.docx) ──────────────────────────────────────────────────────────
  // A real OOXML package, not HTML with a .docx extension — see
  // src/lib/docx-export.ts. Word/Pages/Google Docs all reject the latter.
  const exportDocx = async () => {
    if (!editor) return;
    const toastId = toast.loading("Building .docx…");
    try {
      await downloadDocx(editor.getHTML(), title || "Document");
      toast.success("Exported as Word document", { id: toastId });
    } catch {
      toast.error("Could not build the .docx file", { id: toastId });
    }
  };

  const importDocx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    e.target.value = ""; // allow re-picking the same file after a failure

    const toastId = toast.loading(`Importing ${file.name}…`);
    try {
      const html = await docxFileToHtml(file);
      if (!html.trim()) {
        toast.error("That document appears to be empty", { id: toastId });
        return;
      }
      // Appended rather than replacing — importing should never silently
      // destroy whatever the user already had open.
      editor.chain().focus("end").insertContent(html).run();

      // Untitled docs adopt the filename, the way Word and Docs both behave.
      if (!title.trim() || title === "Untitled Document") {
        const name = file.name.replace(/\.docx$/i, "");
        setTitle(name);
        void saveTitle(name);
      }
      toast.success("Word document imported", { id: toastId });
    } catch {
      toast.error("Could not read that .docx file", { id: toastId });
    }
  };

  const printDoc = () => {
    if (!editor) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,sans-serif;max-width:820px;margin:40px auto;padding:20px 40px;line-height:1.7}
h1{font-size:2rem}h2{font-size:1.5rem}h3{font-size:1.2rem}
pre{background:#f4f4f4;padding:12px;border-radius:6px}
blockquote{border-left:4px solid #4f46e5;margin:0;padding-left:1em;color:#6b6a65}
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

  // ── Track-changes helpers ─────────────────────────────────────────────────

  type Suggestion = { id: string; type: "insert" | "delete"; text: string; author: string; from: number; to: number };

  const getSuggestions = useCallback((): Suggestion[] => {
    if (!editor) return [];
    const list: Suggestion[] = [];
    const seen = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor.state.doc.descendants((node: any, pos: number) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      node.marks.forEach((mark: any) => {
        if ((mark.type.name === "trackInsert" || mark.type.name === "trackDelete") && mark.attrs.id && !seen.has(mark.attrs.id)) {
          seen.add(mark.attrs.id as string);
          list.push({
            id: mark.attrs.id as string,
            type: mark.type.name === "trackInsert" ? "insert" : "delete",
            text: node.textContent as string,
            author: mark.attrs.author as string,
            from: pos,
            to: pos + (node.nodeSize as number),
          });
        }
      });
    });
    return list;
  }, [editor]);

  const acceptSuggestion = useCallback((sugg: Suggestion) => {
    if (!editor) return;
    if (sugg.type === "insert") {
      // Keep text, remove mark
      editor.chain().focus()
        .setTextSelection({ from: sugg.from, to: sugg.to })
        .unsetMark("trackInsert")
        .run();
    } else {
      // Delete the marked text
      editor.chain().focus()
        .setTextSelection({ from: sugg.from, to: sugg.to })
        .deleteSelection()
        .run();
    }
  }, [editor]);

  const rejectSuggestion = useCallback((sugg: Suggestion) => {
    if (!editor) return;
    if (sugg.type === "insert") {
      // Delete the inserted text
      editor.chain().focus()
        .setTextSelection({ from: sugg.from, to: sugg.to })
        .deleteSelection()
        .run();
    } else {
      // Keep text, remove delete mark
      editor.chain().focus()
        .setTextSelection({ from: sugg.from, to: sugg.to })
        .unsetMark("trackDelete")
        .run();
    }
  }, [editor]);

  const acceptAllSuggestions = useCallback(() => {
    if (!editor) return;
    // Process in reverse order so positions don't shift
    const all = getSuggestions().reverse();
    for (const s of all) acceptSuggestion(s);
    toast.success("All suggestions accepted");
  }, [editor, getSuggestions, acceptSuggestion]);

  const rejectAllSuggestions = useCallback(() => {
    if (!editor) return;
    const all = getSuggestions().reverse();
    for (const s of all) rejectSuggestion(s);
    toast.success("All suggestions rejected");
  }, [editor, getSuggestions, rejectSuggestion]);

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

  const rightPanelOpen = showAI || showComments || showHistory || showSuggestions || showA11y;

  // ── Voice typing ──────────────────────────────────────────────────────────
  // Inserts dictated text at the cursor. Primarily an accessibility feature:
  // it is how users with motor impairments or RSI author documents at all.
  const voice = useVoiceTyping({
    onText: (text) => {
      if (!editor) return;
      editor.chain().focus().insertContent(text).run();
    },
  });

  // Count matches in the document's visible text (for the Find dialog).
  const frCount = (() => {
    if (!editor || !frFind) return 0;
    const text = editor.getText();
    const esc = frFind.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return (text.match(new RegExp(esc, frCase ? "g" : "gi")) ?? []).length;
  })();

  const insertFootnote = () => {
    if (!editor) return;
    const text = prompt("Footnote text:");
    if (!text || !text.trim()) return;
    const html = editor.getHTML();
    // Each footnote contributes two "[n]" markers (the inline ref + the list item),
    // so existing count = matches / 2. Class attributes get stripped by Tiptap, so
    // we count by the bracketed-number text which survives.
    const refs = (html.match(/\[\d+\]/g) ?? []).length;
    const n = Math.floor(refs / 2) + 1;
    const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    editor.chain().focus().insertContent("<sup>[" + n + "]</sup>").run();
    const hasSection = html.includes("Footnotes</strong>");
    let foot = "";
    if (!hasSection) foot += "<hr><p><strong>Footnotes</strong></p>";
    foot += "<p><sup>[" + n + "]</sup> " + esc + "</p>";
    editor.chain().focus("end").insertContent(foot).run();
  };

  const docReplaceAll = () => {
    if (!editor || !frFind) return;
    const parts = editor.getHTML().split(/(<[^>]+>)/);
    const esc = frFind.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(esc, frCase ? "g" : "gi");
    let count = 0;
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) continue; // skip HTML tags
      parts[i] = parts[i].replace(re, () => { count++; return frReplace; });
    }
    if (count > 0) {
      editor.commands.setContent(parts.join(""), { emitUpdate: true });
      toast.success("Replaced " + count + (count === 1 ? " match" : " matches"));
    } else {
      toast("No matches found");
    }
  };

  // Close menus on outside click
  const closeMenus = () => { setHeadingMenu(false); setShowExportMenu(false); setShowSecurityMenu(false); setShowTemplateMenu(false); setShowPageSetupMenu(false); setShowStats(false); setShowLineSpacing(false); setShowSymbols(false); };

  // ── Symbols ───────────────────────────────────────────────────────────────
  const insertSymbol = (sym: string) => {
    editor?.chain().focus().insertContent(sym).run();
  };

  // ── Table of contents (static snapshot of headings) ───────────────────────
  const insertTOC = () => {
    if (!editor) return;
    const heads: { level: number; text: string }[] = [];
    editor.state.doc.descendants(node => {
      if (node.type.name === "heading") {
        const t = node.textContent.trim();
        if (t) heads.push({ level: node.attrs.level as number, text: t });
      }
    });
    if (heads.length === 0) { toast("No headings found to build a table of contents"); return; }
    const items = heads.map(h => {
      const indent = (h.level - 1) * 24;
      return '<li style="margin-left:' + indent + 'px">' + h.text + "</li>";
    }).join("");
    const html = "<p><strong>Table of Contents</strong></p><ul>" + items + "</ul><p></p>";
    editor.chain().focus().insertContent(html).run();
    toast.success("Table of contents inserted");
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex h-[calc(100vh-7.25rem)] lg:h-full bg-surface overflow-hidden text-foreground" onClick={closeMenus}>

      <ShortcutHelp groups={DOCS_SHORTCUTS} />

      {/* Live dictation indicator — voice typing gives no feedback otherwise,
          so users can't tell whether it heard them. */}
      {voice.listening && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5
                     px-4 py-2 rounded-full bg-surface border border-border shadow-pop max-w-[80vw]"
          role="status"
          aria-live="polite"
        >
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-crit opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-crit" />
          </span>
          <span className="text-xs text-foreground truncate">
            {voice.interim || "Listening… say \u201cnew paragraph\u201d or \u201cfull stop\u201d"}
          </span>
          <button
            onClick={() => voice.stop()}
            className="text-[11px] font-semibold text-muted hover:text-foreground transition-colors flex-shrink-0"
          >
            Stop
          </button>
        </div>
      )}
      {voice.error && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full
                     bg-crit-soft border border-crit/30 text-xs text-crit"
          role="alert"
        >
          {voice.error}
        </div>
      )}

      {showInsertRange && (
        <InsertRangeDialog
          onInsert={result => {
            editor?.chain().focus().insertContent(result.html).run();
            toast.success("Spreadsheet range inserted");
          }}
          onClose={() => setShowInsertRange(false)}
        />
      )}

      {/* Save conflict — someone else saved while this tab had the doc open */}
      <ConflictBanner
        conflict={saveConflict.conflict}
        onReload={() => {
          const server = saveConflict.conflict;
          if (!server?.serverContent || !editor) { window.location.reload(); return; }
          try {
            editor.commands.setContent(JSON.parse(server.serverContent) as object, { emitUpdate: false });
          } catch {
            editor.commands.setContent(server.serverContent, { emitUpdate: false });
          }
          if (server.serverTitle) setTitle(server.serverTitle);
          saveConflict.setBase(server.serverUpdatedAt);
          saveConflict.dismiss();
          toast.success("Loaded their version");
        }}
        onOverwrite={() => {
          saveConflict.overwrite();
          // Re-run the save immediately with force set.
          if (editor) void autoSave(editor.getHTML());
          toast.success("Your version will be saved");
        }}
      />

      {/* ── Doc list sidebar ── */}
      <aside className="w-64 flex flex-col border-r border-border bg-surface overflow-hidden flex-shrink-0">
        <div className="px-3 pt-3">
          <a href="/apps" title="Back to Apps"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground hover:bg-surface-sunken rounded-md px-2 py-1 -ml-1 transition-colors">
            <ChevronDown className="h-3.5 w-3.5 rotate-90" /> Apps
          </a>
        </div>
        <div className="p-3 border-b border-border">
          <button onClick={() => void createDoc()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold bg-accent text-accent-foreground rounded-lg hover:bg-accent-hover transition-colors">
            <Plus className="h-4 w-4" /> New document
          </button>
        </div>
        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-subtle" />
            <input className="w-full pl-8 pr-2 py-1.5 text-xs bg-surface border border-border rounded-lg placeholder:text-subtle focus:outline-none focus:border-accent/60"
              placeholder="Search documents…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div>
          ) : (
            <>
              {pinnedDocs.length > 0 && (
                <div className="mb-1">
                  <p className="px-3 py-1 text-[10px] font-semibold text-subtle">Pinned</p>
                  {pinnedDocs.map(doc => <DocItem key={doc.id} doc={doc} selected={doc.id === selectedId} onSelect={() => selectDoc(doc)} onPin={pinDoc} onDelete={deleteDoc} />)}
                  <div className="h-px bg-border mx-3 my-1" />
                </div>
              )}
              {unpinnedDocs.map(doc => <DocItem key={doc.id} doc={doc} selected={doc.id === selectedId} onSelect={() => selectDoc(doc)} onPin={pinDoc} onDelete={deleteDoc} />)}
              {filteredDocs.length === 0 && (
                <div className="text-center py-8 px-4">
                  <FileText className="h-8 w-8 text-subtle mx-auto mb-2" />
                  <p className="text-xs text-subtle">{search ? "No matching documents" : "No documents yet"}</p>
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
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface z-10 flex-wrap">
            <input
              className="flex-1 min-w-32 text-base font-semibold text-foreground bg-transparent border-none outline-none focus:bg-surface-sunken rounded px-1"
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
                <div className="absolute right-0 top-full mt-1 w-40 bg-surface border border-border rounded-lg shadow-lg z-50 py-1">
                  {SECURITY_LABELS.map(sl => (
                    <button key={sl.value} onClick={() => { setSecurityLabel(sl.value); setShowSecurityMenu(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-sunken ${securityLabel === sl.value ? `${sl.color} font-semibold` : "text-muted"}`}>
                      <Shield className="h-3 w-3" /> {sl.label}
                      {securityLabel === sl.value && <Check className="h-3 w-3 ml-auto" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Collab avatars */}
            {collaborators.length > 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-surface-sunken rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
                <span className="text-[11px] text-muted">{collaborators.length} live</span>
              </div>
            )}
            {collaborators.slice(0, 4).map(c => (
              <div key={c.userId} title={`${c.name} — editing`}
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold border-2 border-border -ml-2 first:ml-0 ring-2 shadow-sm"
                style={{ backgroundColor: c.color, borderColor: "white", outline: `2px solid ${c.color}`, outlineOffset: "1px" }}>
                {c.name[0]?.toUpperCase()}
              </div>
            ))}
            {collaborators.length > 4 && (
              <div className="w-7 h-7 rounded-full flex items-center justify-center bg-border text-muted text-[10px] font-bold border-2 border-border -ml-2">
                +{collaborators.length - 4}
              </div>
            )}

            {isOffline && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-warn">
                <WifiOff className="h-3.5 w-3.5" /> Offline — editing locally
              </span>
            )}

            <span className="text-[11px] text-subtle">
              {saving ? <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Saving…</span> : <span className="text-ok">Saved</span>}
            </span>

            <div className="flex items-center gap-0.5">
              {/* Find & replace */}
              <IconBtn icon={<Search className="h-4 w-4" />} title="Find & replace (⌘H)" onClick={() => setShowFindReplace(true)} />
              {/* Columns */}
              <select value={docColumns} onChange={e => setDocColumns(Number(e.target.value))} title="Text columns"
                className="text-xs border border-border rounded px-1 h-7 bg-surface text-muted cursor-pointer">
                <option value={1}>1 col</option>
                <option value={2}>2 cols</option>
                <option value={3}>3 cols</option>
              </select>
              {/* Page setup */}
              <div className="relative" onClick={e => e.stopPropagation()}>
                <IconBtn icon={<FileCog className="h-4 w-4" />} title="Page setup" active={showPageSetupMenu} onClick={() => { setShowPageSetupMenu(v => !v); setShowStats(false); }} />
                {showPageSetupMenu && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-surface border border-border rounded-lg shadow-lg z-50 p-3 space-y-3">
                    <p className="text-xs font-semibold text-foreground">Page setup</p>
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-muted">Page size</p>
                      <div className="grid grid-cols-3 gap-1">
                        {(["Letter", "A4", "Legal"] as const).map(s => (
                          <button key={s} onClick={() => updatePageSetup({ size: s })}
                            className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors ${pageSetup.size === s ? "bg-accent-soft text-accent border-accent/40" : "border-border text-muted hover:bg-surface-sunken"}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-muted">Orientation</p>
                      <div className="grid grid-cols-2 gap-1">
                        {(["Portrait", "Landscape"] as const).map(o => (
                          <button key={o} onClick={() => updatePageSetup({ orientation: o })}
                            className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors ${pageSetup.orientation === o ? "bg-accent-soft text-accent border-accent/40" : "border-border text-muted hover:bg-surface-sunken"}`}>
                            {o}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-muted">Margins</p>
                      <div className="grid grid-cols-3 gap-1">
                        {(["Normal", "Narrow", "Wide"] as const).map(m => (
                          <button key={m} onClick={() => updatePageSetup({ margins: m })}
                            className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors ${pageSetup.margins === m ? "bg-accent-soft text-accent border-accent/40" : "border-border text-muted hover:bg-surface-sunken"}`}>
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
                {/* Voice typing — hidden entirely when the browser has no
                    SpeechRecognition (Firefox), rather than offering a button
                    that silently does nothing. */}
                {voice.supported && (
                  <IconBtn
                    icon={<Mic className="h-4 w-4" />}
                    title={voice.listening ? "Stop voice typing" : "Voice typing"}
                    active={voice.listening}
                    activeClass="text-crit bg-crit-soft"
                    onClick={() => voice.toggle()}
                  />
                )}
                <IconBtn
                  icon={<Accessibility className="h-4 w-4" />}
                  title="Accessibility checker"
                  active={showA11y}
                  onClick={() => {
                    setShowA11y(v => !v);
                    setShowAI(false); setShowComments(false);
                    setShowHistory(false); setShowSuggestions(false);
                  }}
                />
                {showStats && (
                  <div className="absolute right-0 top-full mt-1 w-60 bg-surface border border-border rounded-lg shadow-lg z-50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 className="h-4 w-4 text-accent" />
                      <p className="text-xs font-semibold text-foreground">Document stats</p>
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
                          <span className="text-muted">{label}</span>
                          <span className="font-semibold text-foreground">{value}</span>
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
                  <div className="absolute right-0 top-full mt-1 w-44 bg-surface border border-border rounded-lg shadow-lg z-50 py-1">
                    <p className="px-3 py-1 text-[10px] font-medium text-subtle">Start from template</p>
                    {DOC_TEMPLATES.map(tpl => (
                      <MenuItm key={tpl.id} onClick={() => applyTemplate(tpl)}>
                        <FileText className="h-3.5 w-3.5 text-muted" /> {tpl.label}
                      </MenuItm>
                    ))}
                  </div>
                )}
              </div>
              <IconBtn icon={<BookOpen className="h-4 w-4" />} title="Document outline" active={showOutline} onClick={() => setShowOutline(v => !v)} />
              <IconBtn icon={<MessageSquare className="h-4 w-4" />} title="Comments" active={showComments} onClick={() => { setShowComments(v => !v); setShowAI(false); setShowHistory(false); setShowSuggestions(false); }} />
              {/* Saving a version now lives inside the history panel, which owns
                  the server round-trip and refreshes its own list afterwards. */}
              <IconBtn icon={<BookmarkPlus className="h-4 w-4" />} title="Save a version" onClick={() => { setShowHistory(true); setShowAI(false); setShowComments(false); setShowSuggestions(false); }} />
              <IconBtn icon={<History className="h-4 w-4" />} title="Version history" active={showHistory} onClick={() => { setShowHistory(v => !v); setShowAI(false); setShowComments(false); setShowSuggestions(false); }} />
              {/* Suggest mode toggle */}
              <button
                title={suggestMode ? "Exit suggesting mode" : "Suggesting mode — track changes"}
                onClick={() => {
                  const next = !suggestMode;
                  setSuggestMode(next);
                  if (next) { setShowSuggestions(true); setShowAI(false); setShowComments(false); setShowHistory(false); }
                  toast(next ? "Suggesting mode on — changes are tracked" : "Suggesting mode off");
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  suggestMode
                    ? "bg-ok-soft text-ok border-ok/30"
                    : "border-border text-muted hover:bg-surface-sunken"
                }`}
              >
                <GitMerge className="h-3.5 w-3.5" />
                {suggestMode ? "Suggesting" : "Suggest"}
              </button>
              <IconBtn icon={<Sparkles className="h-4 w-4" />} title="AI assistant" active={showAI} activeClass="text-violet bg-violet/10" onClick={() => { setShowAI(v => !v); setShowComments(false); setShowHistory(false); setShowSuggestions(false); }} />
              <div className="relative" onClick={e => e.stopPropagation()}>
                <IconBtn icon={<Download className="h-4 w-4" />} title="Export" onClick={() => setShowExportMenu(v => !v)} />
                {showExportMenu && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-surface border border-border rounded-lg shadow-lg z-50 py-1">
                    <MenuItm onClick={() => { void exportDocx(); setShowExportMenu(false); }}>Microsoft Word (.docx)</MenuItm>
                    <MenuItm onClick={() => { printDoc(); setShowExportMenu(false); }}>Print / Save as PDF</MenuItm>
                    <MenuItm onClick={() => { exportHTML(); setShowExportMenu(false); }}>Web page (.html)</MenuItm>
                    <MenuItm onClick={() => { exportText(); setShowExportMenu(false); }}>Plain text (.txt)</MenuItm>
                    <div className="my-1 h-px bg-border-soft" />
                    <MenuItm onClick={() => { setShowInsertRange(true); setShowExportMenu(false); }}>Insert spreadsheet range…</MenuItm>
                    <MenuItm onClick={() => { void refreshLinkedTables(); setShowExportMenu(false); }}>Refresh linked tables</MenuItm>
                    <MenuItm onClick={() => { void convertToSlides(); setShowExportMenu(false); }}>Convert to presentation</MenuItm>
                    <div className="my-1 h-px bg-border-soft" />
                    <label className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-foreground hover:bg-hover cursor-pointer transition-colors">
                      Import Word (.docx)…
                      <input
                        type="file"
                        accept=".docx"
                        className="hidden"
                        onChange={e => { void importDocx(e); setShowExportMenu(false); }}
                      />
                    </label>
                  </div>
                )}
              </div>
              <button onClick={() => setShowShare(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-accent text-accent-foreground rounded-lg hover:bg-accent-hover transition-colors ml-1">
                <Share2 className="h-3.5 w-3.5" /> Share
              </button>
            </div>
          </div>

          {/* Formatting toolbar */}
          <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-border bg-surface z-10 overflow-x-auto" onClick={e => e.stopPropagation()}>
            <TB icon={<Undo2 className="h-3.5 w-3.5" />} title="Undo (⌘Z)" onClick={() => editor?.commands.undo()} />
            <TB icon={<Redo2 className="h-3.5 w-3.5" />} title="Redo (⌘⇧Z)" onClick={() => editor?.commands.redo()} />
            <TSep />

            {/* Heading picker */}
            <div className="relative">
              <button onClick={() => setHeadingMenu(v => !v)}
                className="flex items-center gap-1 px-2 py-1 text-xs border border-border rounded h-7 text-muted hover:bg-surface-sunken min-w-[96px]">
                {[1,2,3,4,5,6].find(l => editor?.isActive("heading", { level: l }))
                  ? `Heading ${[1,2,3,4,5,6].find(l => editor?.isActive("heading", { level: l }))}`
                  : "Normal text"}
                <ChevronDown className="h-3 w-3 ml-auto" />
              </button>
              {headingMenu && (
                <div className="absolute top-full left-0 mt-1 w-44 bg-surface border border-border rounded-lg shadow-lg z-50 py-1">
                  <button className="w-full px-3 py-2 text-sm text-foreground hover:bg-surface-sunken text-left" onClick={() => { editor?.chain().focus().setParagraph().run(); setHeadingMenu(false); }}>Normal text</button>
                  {([1,2,3,4,5,6] as const).map(l => (
                    <button key={l}
                      className={`w-full px-3 py-1.5 hover:bg-surface-sunken text-left font-semibold text-foreground ${l === 1 ? "text-xl" : l === 2 ? "text-lg" : l === 3 ? "text-base" : "text-sm"}`}
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
              className="h-7 px-1.5 text-xs border border-border rounded text-muted bg-surface hover:bg-surface-sunken focus:outline-none focus:border-accent/60 cursor-pointer"
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
              className="h-7 px-1.5 text-xs border border-border rounded text-muted bg-surface hover:bg-surface-sunken focus:outline-none focus:border-accent/60 cursor-pointer"
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
            <label title="Text color" className="flex items-center justify-center h-7 w-7 rounded text-muted hover:bg-surface-sunken cursor-pointer relative">
              <Type className="h-3.5 w-3.5" />
              <input type="color" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                value={(editor?.getAttributes("textStyle").color as string) ?? "#1a1a18"}
                onChange={e => (editor?.chain().focus() as unknown as { setColor: (v: string) => { run: () => void } } | undefined)?.setColor(e.target.value).run()} />
            </label>

            {/* Highlight color */}
            <label title="Highlight color"
              className={`flex items-center justify-center h-7 w-7 rounded cursor-pointer relative ${editor?.isActive("highlight") ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-sunken"}`}>
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
            <label title="Insert image (upload)" className="flex items-center justify-center h-7 w-7 rounded text-sm text-muted hover:bg-surface-sunken cursor-pointer transition-colors">
              <ImageIcon className="h-3.5 w-3.5" />
              <input type="file" accept="image/*" className="hidden" onChange={e => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 5 * 1024 * 1024) { toast.error("Image too large (max 5MB)"); return; }
                const reader = new FileReader();
                reader.onload = () => {
                  // Alt text is prompted at insert time, not left to be added
                  // later — WCAG 1.1.1, and the accessibility checker flags
                  // every image that lacks it. Empty means "decorative", which
                  // is a valid answer the checker accepts.
                  const alt = window.prompt(
                    "Describe this image for screen readers (leave blank if purely decorative):",
                    "",
                  );
                  (editor?.chain().focus() as unknown as {
                    setImage?: (o: { src: string; alt?: string }) => { run: () => boolean };
                  })?.setImage?.({ src: String(reader.result), alt: alt ?? "" })?.run?.();
                };
                reader.readAsDataURL(f);
                e.currentTarget.value = "";
              }} />
            </label>
            <TB icon={<Link2 className="h-3.5 w-3.5" />} title="Insert link" active={editor?.isActive("link")} onClick={() => { const u = prompt("URL:"); if (u) editor?.chain().focus().setLink?.({ href: u }).run(); else editor?.chain().focus().unsetLink?.().run(); }} />
            <TSep />

            <TB icon={<SuperscriptIcon className="h-3.5 w-3.5" />} title="Superscript" active={editor?.isActive("superscript")} onClick={() => (editor?.chain().focus() as unknown as { toggleSuperscript: () => { run: () => void } } | undefined)?.toggleSuperscript().run()} />
            <TB icon={<span className="text-[10px] font-bold leading-none">[1]</span>} title="Insert footnote" onClick={insertFootnote} />
            <TB icon={<SubscriptIcon className="h-3.5 w-3.5" />} title="Subscript" active={editor?.isActive("subscript")} onClick={() => (editor?.chain().focus() as unknown as { toggleSubscript: () => { run: () => void } } | undefined)?.toggleSubscript().run()} />
            <TB icon={<RemoveFormatting className="h-3.5 w-3.5" />} title="Clear formatting" onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()} />
            <TSep />

            {/* Line spacing */}
            <div className="relative" onClick={e => e.stopPropagation()}>
              <TB icon={<AlignVerticalSpaceAround className="h-3.5 w-3.5" />} title="Line spacing" active={showLineSpacing} onClick={() => { setShowLineSpacing(v => !v); setShowSymbols(false); }} />
              {showLineSpacing && (
                <div className="absolute top-full left-0 mt-1 w-28 bg-surface border border-border rounded-lg shadow-lg z-50 py-1">
                  <p className="px-3 py-1 text-[10px] font-medium text-subtle">Line spacing</p>
                  {["1.0", "1.15", "1.5", "2.0"].map(ls => (
                    <button key={ls} onClick={() => { setLineHeight(ls); setShowLineSpacing(false); }}
                      className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-sunken ${lineHeight === ls ? "text-accent font-semibold" : "text-foreground"}`}>
                      {ls}
                      {lineHeight === ls && <Check className="h-3 w-3 ml-auto" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Symbols */}
            <div className="relative" onClick={e => e.stopPropagation()}>
              <TB icon={<Sigma className="h-3.5 w-3.5" />} title="Insert symbol" active={showSymbols} onClick={() => { setShowSymbols(v => !v); setShowLineSpacing(false); }} />
              {showSymbols && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-surface border border-border rounded-lg shadow-lg z-50 p-2">
                  <p className="px-1 pb-1.5 text-[10px] font-medium text-subtle">Insert symbol</p>
                  <div className="grid grid-cols-8 gap-0.5">
                    {["©","®","™","…","—","–","•","§","¶","†","‡","→","←","↑","↓","°","±","×","÷","≤","≥","≠","∞","€","£","¥","✓","✗","★","♥"].map(sym => (
                      <button key={sym} onClick={() => insertSymbol(sym)}
                        className="flex items-center justify-center h-6 w-6 rounded text-sm text-foreground hover:bg-accent-soft hover:text-accent">
                        {sym}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Table of contents */}
            <TB icon={<ListTree className="h-3.5 w-3.5" />} title="Insert table of contents" onClick={insertTOC} />
            <TSep />

            <span className="text-[11px] text-subtle px-1 whitespace-nowrap">{wordCount} words</span>
          </div>

          {/* Content row */}
          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* Document outline */}
            {showOutline && outline.length > 0 && (
              <div className="w-44 border-r border-border overflow-y-auto overflow-x-hidden py-4 px-3 flex-shrink-0 bg-surface">
                <p className="text-[10px] font-semibold text-subtle mb-2">Outline</p>
                <nav className="space-y-1">
                  {outline.map((h, i) => (
                    <button key={i} className="w-full text-left text-xs text-muted hover:text-accent hover:bg-surface-sunken rounded px-1 py-0.5 truncate"
                      style={{ paddingLeft: (h.level - 1) * 8 + 4 }}>
                      {h.text}
                    </button>
                  ))}
                </nav>
              </div>
            )}

            {/* Paper editor */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden bg-surface-sunken">
              <div
                className="mx-auto my-8 bg-surface shadow border border-border rounded-lg flex flex-col"
                style={{ width: paperW, maxWidth: "100%", minHeight: paperH }}
              >
                {headerFooter.enabled && (
                  <div
                    className="border-b border-dashed border-border"
                    style={{ paddingLeft: marginPx.h, paddingRight: marginPx.h, paddingTop: Math.min(marginPx.v, 40), paddingBottom: 12 }}
                  >
                    <input
                      className="w-full bg-transparent text-xs text-muted placeholder:text-subtle outline-none focus:bg-surface rounded px-1 py-0.5"
                      placeholder="Header (e.g. document title, author)…"
                      value={headerFooter.header}
                      onChange={e => updateHeaderFooter({ header: e.target.value })}
                    />
                  </div>
                )}
                <div className="flex-1" style={{ paddingLeft: marginPx.h, paddingRight: marginPx.h, paddingTop: marginPx.v, paddingBottom: marginPx.v, columnCount: docColumns > 1 ? docColumns : undefined, columnGap: docColumns > 1 ? "32px" : undefined, lineHeight: lineHeight }}>
                  <EditorContent editor={editor} />
                </div>
                {headerFooter.enabled && (
                  <div
                    className="border-t border-dashed border-border flex items-center gap-2"
                    style={{ paddingLeft: marginPx.h, paddingRight: marginPx.h, paddingTop: 12, paddingBottom: Math.min(marginPx.v, 40) }}
                  >
                    <input
                      className="flex-1 bg-transparent text-xs text-muted placeholder:text-subtle outline-none focus:bg-surface rounded px-1 py-0.5"
                      placeholder="Footer…"
                      value={headerFooter.footer}
                      onChange={e => updateHeaderFooter({ footer: e.target.value })}
                    />
                    <span className="text-[11px] text-subtle whitespace-nowrap flex-shrink-0">
                      {"Page 1 of " + estimatedPages}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Right panel */}
            {rightPanelOpen && (
              <div className="w-80 border-l border-border bg-surface flex flex-col overflow-hidden flex-shrink-0">
                <div className="flex items-center border-b border-border">
                  {showAI          && <PanelTab active icon={<Sparkles className="h-3.5 w-3.5" />} label="AI" onClick={() => {}} />}
                  {showComments    && <PanelTab active icon={<MessageSquare className="h-3.5 w-3.5" />} label="Comments" onClick={() => {}} />}
                  {showHistory     && <PanelTab active icon={<History className="h-3.5 w-3.5" />} label="History" onClick={() => {}} />}
                  {showSuggestions && <PanelTab active icon={<GitMerge className="h-3.5 w-3.5" />} label="Suggestions" onClick={() => {}} />}
                  <button className="ml-auto p-2 text-subtle hover:text-foreground" onClick={() => { setShowAI(false); setShowComments(false); setShowHistory(false); setShowSuggestions(false); setSuggestMode(false); }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* AI Panel */}
                {showAI && (
                  <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-1.5">
                      {(["summarize","rewrite","expand","shorten","grammar","generate"] as const).map(m => (
                        <button key={m} onClick={() => setAIMode(m)}
                          className={`px-2 py-1.5 text-[11px] font-medium rounded-lg border capitalize transition-colors ${aiMode === m ? "bg-violet/10 text-violet border-violet/20" : "border-border text-muted hover:bg-surface-sunken"}`}>
                          {m}
                        </button>
                      ))}
                    </div>
                    {aiMode === "generate" && (
                      <textarea className="w-full px-3 py-2 text-xs bg-surface-sunken border border-border-strong rounded-lg resize-none focus:outline-none focus:border-accent/60"
                        rows={3} placeholder="Describe the document you want to generate…"
                        value={aiPrompt} onChange={e => setAIPrompt(e.target.value)} />
                    )}
                    <button onClick={() => void runAI()} disabled={aiLoading}
                      className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold bg-violet text-white rounded-lg hover:bg-violet disabled:opacity-50 transition-colors">
                      {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {aiLoading ? "Thinking…" : `Run AI: ${aiMode}`}
                    </button>
                    {aiResult && (
                      <>
                        <div className="bg-surface rounded-lg p-3 text-xs text-foreground whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto border border-border">{aiResult}</div>
                        <button onClick={insertAIResult} className="w-full py-2 text-xs font-semibold text-accent border border-accent/30 rounded-lg hover:bg-accent-soft transition-colors">
                          Insert into document
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Comments Panel */}
                {/* Comments — server-persisted threads (DocComment table),
                    shared with Sheets and Slides. Replaces the old local
                    useState list, which was lost on refresh and always
                    attributed to "You". */}
                {/* Accessibility checker (WCAG 2.1 AA) */}
                {showA11y && editor && (
                  <AccessibilityPanel
                    html={editor.getHTML()}
                    onClose={() => setShowA11y(false)}
                  />
                )}

                {showComments && selectedId && (
                  <DocComments
                    docId={selectedId}
                    onClose={() => setShowComments(false)}
                    currentAnchor={commentAnchor}
                    anchorLabel={commentAnchorLabel}
                    describeAnchor={describeDocAnchor}
                    onJumpToAnchor={jumpToDocAnchor}
                  />
                )}

                {/* Suggestions Panel */}
                {showSuggestions && (() => {
                  const suggestions = getSuggestions();
                  return (
                    <div className="flex flex-col h-full overflow-hidden">
                      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-border flex-shrink-0">
                        <div>
                          <p className="text-xs font-semibold text-foreground">Tracked changes</p>
                          <p className="text-[10px] text-subtle">{suggestions.length} pending suggestion{suggestions.length !== 1 ? "s" : ""}</p>
                        </div>
                        {suggestions.length > 0 && (
                          <div className="flex gap-1">
                            <button onClick={acceptAllSuggestions} title="Accept all" className="p-1.5 rounded-lg text-ok hover:bg-ok-soft transition-colors">
                              <CheckCheck className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={rejectAllSuggestions} title="Reject all" className="p-1.5 rounded-lg text-crit hover:bg-crit/10 transition-colors">
                              <XCircle className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2">
                        {/* Suggest-mode banner */}
                        <div className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] font-medium border ${suggestMode ? "bg-ok-soft border-ok/30 text-ok" : "bg-surface border-border text-muted"}`}>
                          <GitMerge className="h-3.5 w-3.5 flex-shrink-0" />
                          {suggestMode ? "Suggesting mode is ON — edits are tracked" : "Suggesting mode is OFF — edits apply directly"}
                        </div>
                        {suggestions.length === 0 ? (
                          <div className="text-center py-10">
                            <GitMerge className="h-8 w-8 mx-auto mb-2 text-subtle" />
                            <p className="text-xs text-subtle">No pending suggestions</p>
                            <p className="text-[11px] text-subtle mt-1">Enable suggesting mode and start editing</p>
                          </div>
                        ) : suggestions.map(s => (
                          <div key={s.id} className={`rounded-lg border p-3 space-y-1.5 ${s.type === "insert" ? "bg-ok-soft border-ok/20" : "bg-crit-soft border-crit/20"}`}>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${s.type === "insert" ? "bg-ok-soft text-ok" : "bg-crit/10 text-crit"}`}>
                                {s.type === "insert" ? "+ Insertion" : "− Deletion"}
                              </span>
                              <span className="text-[10px] text-subtle ml-auto">{s.author}</span>
                            </div>
                            <p className="text-xs text-foreground font-mono bg-surface border border-border rounded px-2 py-1 truncate">&ldquo;{s.text}&rdquo;</p>
                            <div className="flex gap-2 pt-0.5">
                              <button onClick={() => acceptSuggestion(s)} className="flex items-center gap-1 text-[11px] font-medium text-ok hover:underline">
                                <Check className="h-3 w-3" /> Accept
                              </button>
                              <button onClick={() => rejectSuggestion(s)} className="flex items-center gap-1 text-[11px] font-medium text-crit hover:underline">
                                <X className="h-3 w-3" /> Reject
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* History Panel */}
                {/* Version history — server-persisted (DocumentVersion table),
                    shared with Sheets and Slides. Replaces the old
                    localStorage list, which was per-browser and invisible to
                    collaborators. */}
                {showHistory && selectedId && (
                  <DocVersionHistory
                    docId={selectedId}
                    onClose={() => setShowHistory(false)}
                    getContent={() => ({
                      content: editor
                        ? (editor.getJSON ? JSON.stringify(editor.getJSON()) : editor.getHTML())
                        : "",
                      title,
                    })}
                    onRestored={(content, restoredTitle) => {
                      if (!editor) return;
                      try {
                        editor.commands.setContent(JSON.parse(content) as object, { emitUpdate: false });
                      } catch {
                        editor.commands.setContent(content, { emitUpdate: false });
                      }
                      if (restoredTitle) setTitle(restoredTitle);
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Empty / welcome state */
        <div className="flex-1 flex flex-col items-center justify-center bg-surface-sunken gap-4">
          <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center">
            <FileText className="h-8 w-8 text-accent" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold text-foreground mb-1">Nexus Docs</h2>
            <p className="text-sm text-muted mb-4">Rich text documents with AI, collaboration & version history</p>
            <button onClick={() => void createDoc()}
              className="flex items-center gap-2 px-5 py-2.5 bg-accent text-accent-foreground text-sm font-semibold rounded-lg hover:bg-accent-hover transition-colors mx-auto">
              <Plus className="h-4 w-4" /> New document
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-2 max-w-md">
            {["Blank document","Meeting notes","Project SOP","Policy document","Technical spec","Team handbook"].map(t => (
              <button key={t} onClick={() => void createDoc()}
                className="px-3 py-3 bg-surface border border-border rounded-xl text-xs font-medium text-muted hover:border-accent/30 hover:text-accent transition-colors text-center shadow-sm">
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {showShare && selectedDoc && (
        <DocShareModal docId={selectedDoc.id} docType="doc" onClose={() => setShowShare(false)} />
      )}

      {showFindReplace && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-24" onClick={() => setShowFindReplace(false)}>
          <div className="bg-surface rounded-xl border border-border shadow-xl w-full max-w-sm p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Find & replace</h3>
              <button onClick={() => setShowFindReplace(false)} className="p-1 rounded hover:bg-surface-sunken text-muted"><X className="h-4 w-4" /></button>
            </div>
            <input autoFocus value={frFind} onChange={e => setFrFind(e.target.value)} placeholder="Find"
              className="w-full px-3 py-2 mb-2 text-sm bg-surface-sunken border border-border-strong rounded-lg focus:outline-none focus:border-accent/60" />
            <input value={frReplace} onChange={e => setFrReplace(e.target.value)} placeholder="Replace with"
              className="w-full px-3 py-2 mb-2 text-sm bg-surface-sunken border border-border-strong rounded-lg focus:outline-none focus:border-accent/60" />
            <div className="flex items-center justify-between mb-3">
              <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                <input type="checkbox" checked={frCase} onChange={e => setFrCase(e.target.checked)} /> Match case
              </label>
              <span className="text-xs text-subtle">{frFind ? frCount + (frCount === 1 ? " match" : " matches") : ""}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowFindReplace(false)} className="flex-1 px-4 py-2 text-sm border border-border rounded-lg text-muted hover:bg-surface-sunken">Close</button>
              <button onClick={docReplaceAll} disabled={!frFind} className="flex-1 px-4 py-2 text-sm font-semibold bg-accent text-accent-foreground rounded-lg hover:bg-accent-hover disabled:opacity-50">Replace all</button>
            </div>
          </div>
        </div>
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
      className={`p-1.5 rounded transition-colors ${active ? (activeClass ?? "bg-accent-soft text-accent") : "text-muted hover:bg-surface-sunken"}`}>
      {icon}
    </button>
  );
}

function MenuItm({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-surface-sunken">
      {children}
    </button>
  );
}
