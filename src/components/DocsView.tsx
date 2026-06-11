"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus,
  Search,
  FileText,
  Trash2,
  Pin,
  PinOff,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link,
  Code,
  Quote,
  Loader2,
  Save,
  Users,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import * as Y from "yjs";

type Doc = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

function docPreview(content: string): string {
  return content.replace(/<[^>]+>/g, "").replace(/\n/g, " ").slice(0, 80) || "Empty document";
}

// ── Yjs SSE collaboration hook ───────────────────────────────────────────────
// Syncs a Y.Doc over the existing SSE + POST relay infrastructure.
// No dedicated WebSocket server needed — works on Vercel.

const REMOTE_ORIGIN = "sse-relay";

function useDocCollab(docId: string | null) {
  const ydocRef = useRef<Y.Doc | null>(null);
  const [collaborators, setCollaborators] = useState<{ userId: string; name: string }[]>([]);

  // Create a fresh Y.Doc whenever the selected doc changes
  if (!ydocRef.current) {
    ydocRef.current = new Y.Doc();
  }

  useEffect(() => {
    if (!docId) return;

    // New Yjs document for this collaboration session
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    setCollaborators([]);

    // Broadcast local updates to the SSE relay
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE_ORIGIN) return; // Don't echo updates we received from the relay
      const b64 = btoa(String.fromCharCode(...Array.from(update)));
      fetch(`/api/docs/${docId}/collab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "YJS_UPDATE", update: b64 }),
      }).catch(() => {});
    };

    ydoc.on("update", onUpdate);

    // Subscribe to SSE for incoming updates + presence
    const es = new EventSource(`/api/docs/${docId}/collab`);

    es.onmessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data as string) as {
          type: string;
          update?: string;
          userId?: string;
          name?: string;
          sessions?: { userId: string; cursorName: string }[];
          action?: string;
        };

        if (msg.type === "YJS_UPDATE" && msg.update) {
          const bytes = Uint8Array.from(atob(msg.update), (c) => c.charCodeAt(0));
          Y.applyUpdate(ydoc, bytes, REMOTE_ORIGIN);
        }

        if (msg.type === "INIT" && msg.sessions) {
          setCollaborators(msg.sessions.map((s) => ({ userId: s.userId, name: s.cursorName })));
        }

        if (msg.type === "PRESENCE") {
          const { userId, name, action } = msg;
          if (!userId) return;
          setCollaborators((prev) => {
            if (action === "LEAVE") return prev.filter((c) => c.userId !== userId);
            if (prev.some((c) => c.userId === userId)) return prev;
            return [...prev, { userId, name: name ?? "" }];
          });
        }
      } catch { /* ignore malformed messages */ }
    };

    return () => {
      es.close();
      ydoc.off("update", onUpdate);
      ydoc.destroy();
      ydocRef.current = null;
    };
  }, [docId]);

  return { ydoc: ydocRef.current, collaborators };
}

// ── Main component ────────────────────────────────────────────────────────────

export function DocsView() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeDoc = docs.find((d) => d.id === selectedId) ?? null;
  const initializedDocId = useRef<string | null>(null);

  const { ydoc, collaborators } = useDocCollab(selectedId);

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Collaboration.configure({ document: ydoc }),
      ],
      editorProps: {
        attributes: {
          class:
            "min-h-full outline-none text-sm text-[#dfe1f6] leading-relaxed prose prose-sm max-w-none prose-invert prose-headings:font-semibold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-base prose-blockquote:border-l-4 prose-blockquote:border-[#00d2ff]/30 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-[#9aa3b8] prose-pre:bg-[#0f1321] prose-pre:text-[#dfe1f6] prose-pre:rounded-lg prose-pre:p-4 prose-pre:text-xs prose-pre:font-mono prose-a:text-[#00d2ff] prose-a:underline",
        },
      },
      onUpdate: ({ editor: e }) => {
        if (!selectedId) return;
        setSaveStatus("unsaved");
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
          setSaveStatus("saving");
          try {
            const html = e.getHTML();
            await fetch(`/api/docs/${selectedId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title, content: html }),
            });
            setSaveStatus("saved");
            setDocs((prev) =>
              prev.map((d) => (d.id === selectedId ? { ...d, content: html, updatedAt: new Date().toISOString() } : d))
            );
          } catch {
            setSaveStatus("unsaved");
          }
        }, 800);
      },
    },
    [ydoc], // recreate editor when Yjs doc changes (i.e. on doc selection change)
  );

  // Load initial HTML content into Yjs when a doc is first opened
  useEffect(() => {
    if (!editor || !activeDoc || initializedDocId.current === activeDoc.id) return;
    initializedDocId.current = activeDoc.id;

    // Short delay so TipTap's Yjs binding is ready before we inject HTML
    const t = setTimeout(() => {
      if (activeDoc.content) {
        editor.commands.setContent(activeDoc.content);
      } else {
        editor.commands.clearContent();
      }
      setSaveStatus("saved");
    }, 50);
    return () => clearTimeout(t);
  }, [editor, activeDoc]);

  const loadDocs = useCallback(async (q = "") => {
    setLoading(true);
    try {
      const r = await fetch(`/api/docs${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      if (r.ok) setDocs((await r.json()) as Doc[]);
    } catch {
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadDocs(); }, [loadDocs]);

  useEffect(() => {
    const t = setTimeout(() => void loadDocs(search), 300);
    return () => clearTimeout(t);
  }, [search, loadDocs]);

  const selectDoc = (doc: Doc) => {
    initializedDocId.current = null; // Allow re-init for new selection
    setSelectedId(doc.id);
    setTitle(doc.title);
    setSaveStatus("saved");
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTitle(val);
    if (!selectedId || !editor) return;
    setSaveStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await fetch(`/api/docs/${selectedId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: val, content: editor.getHTML() }),
        });
        setSaveStatus("saved");
        setDocs((prev) => prev.map((d) => (d.id === selectedId ? { ...d, title: val } : d)));
      } catch {
        setSaveStatus("unsaved");
      }
    }, 800);
  };

  const handleNew = async () => {
    try {
      const r = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled Document" }),
      });
      if (!r.ok) throw new Error();
      const doc = (await r.json()) as Doc;
      setDocs((prev) => [doc, ...prev]);
      selectDoc(doc);
    } catch {
      toast.error("Could not create document");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    try {
      await fetch(`/api/docs/${id}`, { method: "DELETE" });
      setDocs((prev) => prev.filter((d) => d.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        initializedDocId.current = null;
        setTitle("");
        editor?.commands.clearContent();
      }
    } catch {
      toast.error("Could not delete document");
    }
  };

  const handlePin = async (doc: Doc) => {
    try {
      await fetch(`/api/docs/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !doc.pinned }),
      });
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, pinned: !d.pinned } : d)));
    } catch {
      toast.error("Could not update document");
    }
  };

  const toolbar = editor ? [
    { label: "Bold",      action: () => editor.chain().focus().toggleBold().run(),         active: editor.isActive("bold"),        icon: Bold },
    { label: "Italic",    action: () => editor.chain().focus().toggleItalic().run(),       active: editor.isActive("italic"),      icon: Italic },
    { label: "Underline", action: () => editor.chain().focus().toggleUnderline?.().run?.(), active: editor.isActive("underline"), icon: Underline },
  ] : [];

  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen bg-[#0f1321] overflow-hidden">
      {/* Document list sidebar */}
      <div className="bg-[#1b1f2e] border-r border-[rgba(255,255,255,0.08)] w-64 flex-shrink-0 flex flex-col">
        <div className="p-4 border-b border-[rgba(255,255,255,0.08)] flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#00d2ff]" />
          <span className="font-medium text-sm text-[#dfe1f6] truncate flex-1">Documents</span>
          <button
            onClick={handleNew}
            className="bg-[#00d2ff] text-[#003543] hover:opacity-90 rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-2 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
        </div>

        <div className="px-3 py-2 border-b border-[rgba(255,255,255,0.08)]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9aa3b8]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="bg-[#262939] border-transparent text-[#dfe1f6] placeholder-[#9aa3b8] rounded-lg pl-9 py-2 text-sm focus:ring-2 focus:ring-[#00d2ff] focus:bg-[#262939] w-full outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-[#9aa3b8]" />
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#9aa3b8]">
              <FileText className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs text-[#9aa3b8]">{search ? "No documents found" : "No documents yet"}</p>
              {!search && (
                <button onClick={handleNew} className="mt-3 text-xs text-[#00d2ff] hover:opacity-80 font-medium">
                  Create your first document
                </button>
              )}
            </div>
          ) : (
            docs.map((doc) => (
              <div
                key={doc.id}
                onClick={() => selectDoc(doc)}
                className={`group mx-2 my-0.5 cursor-pointer ${
                  selectedId === doc.id
                    ? "bg-[#00d2ff]/10 text-[#7dd8f5] rounded-lg px-3 py-2 font-medium text-sm"
                    : "text-[#9aa3b8] hover:bg-[#262939] hover:text-[#dfe1f6] rounded-lg px-3 py-2 text-sm transition-colors"
                }`}
              >
                <div className="flex items-start gap-2">
                  {doc.pinned && <Pin className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-[#dfe1f6] truncate">{doc.title || "Untitled"}</p>
                    <p className="text-xs text-[#9aa3b8] truncate mt-0.5">{docPreview(doc.content)}</p>
                    <p className="text-[10px] text-[#9aa3b8] mt-1">
                      {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); void handlePin(doc); }}
                      className="p-1 rounded text-[#9aa3b8] hover:text-amber-400 hover:bg-amber-400/10"
                      title={doc.pinned ? "Unpin" : "Pin"}
                    >
                      {doc.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleDelete(doc.id); }}
                      className="p-1 rounded text-[#9aa3b8] hover:text-red-400 hover:bg-red-400/10"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Editor area */}
      {!activeDoc ? (
        <div className="flex-1 flex flex-col items-center justify-center text-[#9aa3b8] bg-[#0f1321]">
          <FileText className="w-16 h-16 mb-4 opacity-20" />
          <p className="text-lg font-medium">No document selected</p>
          <p className="text-sm mt-1">Select a document or create a new one</p>
          <button
            onClick={handleNew}
            className="mt-5 bg-[#00d2ff] text-[#003543] hover:opacity-90 rounded-lg px-4 py-2 text-sm font-medium w-full flex items-center gap-2 justify-center transition-opacity"
          >
            <Plus className="w-4 h-4" />
            New Document
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col bg-[#1b1f2e] overflow-hidden">
          {/* Doc header */}
          <div className="border-b border-[rgba(255,255,255,0.08)] px-8 py-4 flex items-center justify-between flex-shrink-0 bg-[#1b1f2e]">
            <input
              value={title}
              onChange={handleTitleChange}
              placeholder="Untitled Document"
              className="text-2xl font-semibold text-[#dfe1f6] border-none bg-transparent focus:ring-0 outline-none flex-1 px-6 py-4 placeholder-[#262b3a]"
            />
            <div className="flex items-center gap-3 ml-4 flex-shrink-0">
              {collaborators.length > 0 && (
                <div className="flex items-center gap-1 text-xs text-[#9aa3b8]">
                  <Users className="w-3 h-3 text-[#00d2ff]" />
                  <span>{collaborators.length} editing</span>
                </div>
              )}
              {saveStatus === "saving" && (
                <span className="flex items-center gap-1.5 text-xs text-[#9aa3b8]">
                  <Loader2 className="w-3 h-3 animate-spin" /> Saving…
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="flex items-center gap-1.5 text-xs text-[#9aa3b8]">
                  <Save className="w-3 h-3" /> Saved
                </span>
              )}
              {saveStatus === "unsaved" && (
                <span className="text-xs text-[#9aa3b8]">Unsaved changes</span>
              )}
            </div>
          </div>

          {/* Rich text toolbar */}
          <div className="border-b border-[rgba(255,255,255,0.08)] px-4 py-2 bg-[#1b1f2e] flex items-center gap-1 flex-wrap sticky top-0">
            {toolbar.map(({ label, action, active, icon: Icon }) => (
              <button
                key={label}
                onMouseDown={(e) => { e.preventDefault(); action(); }}
                title={label}
                className={`p-1.5 rounded transition-colors text-sm ${active ? "bg-[#00d2ff]/10 text-[#00d2ff]" : "text-[#9aa3b8] hover:bg-[#262939] hover:text-[#dfe1f6]"}`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}

            <div className="w-px h-5 bg-[#262b3a] mx-1" />

            <button
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleOrderedList().run(); }}
              title="Ordered list"
              className="p-1.5 text-[#9aa3b8] hover:bg-[#262939] hover:text-[#dfe1f6] rounded transition-colors"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBulletList().run(); }}
              title="Bullet list"
              className="p-1.5 text-[#9aa3b8] hover:bg-[#262939] hover:text-[#dfe1f6] rounded transition-colors"
            >
              <List className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-5 bg-[#262b3a] mx-1" />

            <button
              onMouseDown={(e) => {
                e.preventDefault();
                const url = prompt("Link URL:");
                if (url) editor?.chain().focus().setLink({ href: url }).run();
              }}
              title="Insert link"
              className="p-1.5 text-[#9aa3b8] hover:bg-[#262939] hover:text-[#dfe1f6] rounded transition-colors"
            >
              <Link className="w-3.5 h-3.5" />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleCode().run(); }}
              title="Inline code"
              className="p-1.5 text-[#9aa3b8] hover:bg-[#262939] hover:text-[#dfe1f6] rounded transition-colors"
            >
              <Code className="w-3.5 h-3.5" />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().toggleBlockquote().run(); }}
              title="Blockquote"
              className="p-1.5 text-[#9aa3b8] hover:bg-[#262939] hover:text-[#dfe1f6] rounded transition-colors"
            >
              <Quote className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-5 bg-[#262b3a] mx-1" />

            <select
              onChange={(e) => {
                const v = e.target.value;
                if (v === "h1") editor?.chain().focus().toggleHeading({ level: 1 }).run();
                else if (v === "h2") editor?.chain().focus().toggleHeading({ level: 2 }).run();
                else if (v === "h3") editor?.chain().focus().toggleHeading({ level: 3 }).run();
                else editor?.chain().focus().setParagraph().run();
                e.target.value = "";
              }}
              defaultValue=""
              className="text-xs text-[#9aa3b8] bg-transparent border-none outline-none cursor-pointer hover:text-[#dfe1f6] py-1"
            >
              <option value="" disabled>Heading</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
              <option value="p">Paragraph</option>
            </select>
          </div>

          {/* TipTap editor body */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <EditorContent editor={editor} className="min-h-full" />
          </div>
        </div>
      )}
    </div>
  );
}
