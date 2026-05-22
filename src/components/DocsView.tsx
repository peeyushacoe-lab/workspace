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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type Doc = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

function docPreview(content: string): string {
  return content.replace(/\n/g, " ").slice(0, 80) || "Empty document";
}

function execFmt(cmd: string, value?: string) {
  document.execCommand(cmd, false, value);
}

export function DocsView() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const activeDoc = docs.find((d) => d.id === selectedId) ?? null;

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
    setSelectedId(doc.id);
    setTitle(doc.title);
    if (editorRef.current) editorRef.current.innerHTML = doc.content;
    setSaveStatus("saved");
  };

  const scheduleSave = useCallback((id: string, newTitle: string, newContent: string) => {
    setSaveStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        await fetch(`/api/docs/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle, content: newContent }),
        });
        setSaveStatus("saved");
        setDocs((prev) =>
          prev.map((d) => (d.id === id ? { ...d, title: newTitle, content: newContent, updatedAt: new Date().toISOString() } : d))
        );
      } catch {
        setSaveStatus("unsaved");
      }
    }, 800);
  }, []);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTitle(val);
    if (selectedId && editorRef.current) {
      scheduleSave(selectedId, val, editorRef.current.innerHTML);
    }
  };

  const handleContentInput = () => {
    if (selectedId && editorRef.current) {
      scheduleSave(selectedId, title, editorRef.current.innerHTML);
    }
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
        setTitle("");
        if (editorRef.current) editorRef.current.innerHTML = "";
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

  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen bg-[#0f1321] overflow-hidden">
      {/* Document list sidebar */}
      <div className="bg-[#1b1f2e] border-r border-[rgba(0,255,255,0.1)] w-64 flex-shrink-0 flex flex-col">
        <div className="p-4 border-b border-[rgba(0,255,255,0.1)] flex items-center gap-2">
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

        <div className="px-3 py-2 border-b border-[rgba(0,255,255,0.1)]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#bbc9cf]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="bg-[#262939] border-transparent text-[#dfe1f6] placeholder-[#bbc9cf] rounded-lg pl-9 py-2 text-sm focus:ring-2 focus:ring-[#00d2ff] focus:bg-[#262939] w-full outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-[#bbc9cf]" />
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#bbc9cf]">
              <FileText className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs text-[#bbc9cf]">{search ? "No documents found" : "No documents yet"}</p>
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
                    ? "bg-[#00d2ff]/10 text-[#a5e7ff] rounded-lg px-3 py-2 font-medium text-sm"
                    : "text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded-lg px-3 py-2 text-sm transition-colors"
                }`}
              >
                <div className="flex items-start gap-2">
                  {doc.pinned && <Pin className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-[#dfe1f6] truncate">{doc.title || "Untitled"}</p>
                    <p className="text-xs text-[#bbc9cf] truncate mt-0.5">{docPreview(doc.content)}</p>
                    <p className="text-[10px] text-[#bbc9cf] mt-1">
                      {formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}
                    </p>
                  </div>
                  {/* Row actions on hover */}
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); void handlePin(doc); }}
                      className="p-1 rounded text-[#bbc9cf] hover:text-amber-400 hover:bg-amber-400/10"
                      title={doc.pinned ? "Unpin" : "Pin"}
                    >
                      {doc.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleDelete(doc.id); }}
                      className="p-1 rounded text-[#bbc9cf] hover:text-red-400 hover:bg-red-400/10"
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
        <div className="flex-1 flex flex-col items-center justify-center text-[#bbc9cf] bg-[#0f1321]">
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
          <div className="border-b border-[rgba(0,255,255,0.1)] px-8 py-4 flex items-center justify-between flex-shrink-0 bg-[#1b1f2e]">
            <input
              value={title}
              onChange={handleTitleChange}
              placeholder="Untitled Document"
              className="text-2xl font-bold text-[#dfe1f6] border-none bg-transparent focus:ring-0 outline-none w-full px-6 py-4 placeholder-[#3c494e]"
            />
            <div className="flex items-center gap-2 ml-4 flex-shrink-0">
              {saveStatus === "saving" && (
                <span className="flex items-center gap-1.5 text-xs text-[#bbc9cf]">
                  <Loader2 className="w-3 h-3 animate-spin" /> Saving…
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="flex items-center gap-1.5 text-xs text-[#bbc9cf]">
                  <Save className="w-3 h-3" /> Saved
                </span>
              )}
              {saveStatus === "unsaved" && (
                <span className="text-xs text-[#bbc9cf]">Unsaved changes</span>
              )}
            </div>
          </div>

          {/* Rich text toolbar */}
          <div className="border-b border-[rgba(0,255,255,0.1)] px-4 py-2 bg-[#1b1f2e] flex items-center gap-1 flex-wrap sticky top-0">
            {[
              { icon: Bold,         cmd: "bold",           title: "Bold (Ctrl+B)" },
              { icon: Italic,       cmd: "italic",         title: "Italic (Ctrl+I)" },
              { icon: Underline,    cmd: "underline",      title: "Underline (Ctrl+U)" },
            ].map(({ icon: Icon, cmd, title: t }) => (
              <button
                key={cmd}
                onMouseDown={(e) => { e.preventDefault(); execFmt(cmd); }}
                title={t}
                className="p-1.5 text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded transition-colors text-sm"
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}

            <div className="w-px h-5 bg-[#3c494e] mx-1" />

            <button
              onMouseDown={(e) => { e.preventDefault(); execFmt("insertOrderedList"); }}
              title="Ordered list"
              className="p-1.5 text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded transition-colors text-sm"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); execFmt("insertUnorderedList"); }}
              title="Bullet list"
              className="p-1.5 text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded transition-colors text-sm"
            >
              <List className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-5 bg-[#3c494e] mx-1" />

            <button
              onMouseDown={(e) => {
                e.preventDefault();
                const url = prompt("Link URL:");
                if (url) execFmt("createLink", url);
              }}
              title="Insert link"
              className="p-1.5 text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded transition-colors text-sm"
            >
              <Link className="w-3.5 h-3.5" />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); execFmt("formatBlock", "pre"); }}
              title="Code block"
              className="p-1.5 text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded transition-colors text-sm"
            >
              <Code className="w-3.5 h-3.5" />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); execFmt("formatBlock", "blockquote"); }}
              title="Blockquote"
              className="p-1.5 text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded transition-colors text-sm"
            >
              <Quote className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-5 bg-[#3c494e] mx-1" />

            {/* Heading dropdown */}
            <select
              onChange={(e) => { execFmt("formatBlock", e.target.value); e.target.value = ""; }}
              defaultValue=""
              className="text-xs text-[#bbc9cf] bg-transparent border-none outline-none cursor-pointer hover:text-[#dfe1f6] py-1"
            >
              <option value="" disabled>Heading</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
              <option value="p">Paragraph</option>
            </select>
          </div>

          {/* Editor body */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleContentInput}
              className="min-h-full outline-none text-sm text-[#dfe1f6] leading-relaxed
                prose prose-sm max-w-none prose-invert
                prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-h3:text-base
                prose-blockquote:border-l-4 prose-blockquote:border-[#00d2ff]/30 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-[#bbc9cf]
                prose-pre:bg-[#0f1321] prose-pre:text-[#dfe1f6] prose-pre:rounded-lg prose-pre:p-4 prose-pre:text-xs prose-pre:font-mono
                prose-a:text-[#00d2ff] prose-a:underline"
            />
          </div>
        </div>
      )}
    </div>
  );
}
