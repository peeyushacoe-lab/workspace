import { useState, useEffect, useRef, useCallback } from "react";
import {
  getDriveFiles, getDriveFolders, createDriveFolder,
  uploadDriveFile, updateDriveFile, deleteDriveFile,
  type DriveFile, type DriveFolder,
} from "@/api/client";

function fileIcon(mime: string | null) {
  if (!mime) return "📄";
  if (mime.startsWith("image/")) return "🖼️";
  if (mime.startsWith("video/")) return "🎬";
  if (mime.startsWith("audio/")) return "🎵";
  if (mime.includes("pdf")) return "📕";
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "📊";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "📊";
  if (mime.includes("word") || mime.includes("document")) return "📝";
  if (mime.includes("zip") || mime.includes("archive")) return "📦";
  if (mime.startsWith("text/")) return "📄";
  return "📄";
}

function formatSize(bytes: string | number | null) {
  const b = Number(bytes);
  if (!b) return "–";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

type ViewMode = "grid" | "list";
type Filter = "all" | "starred" | "shared";

export function Drive() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("list");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, fo] = await Promise.all([
        getDriveFiles(folderId, debouncedQuery),
        folderId || debouncedQuery ? Promise.resolve([]) : getDriveFolders(folderId),
      ]);
      setFiles(f);
      setFolders(fo);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [folderId, debouncedQuery]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  function openFolder(f: DriveFolder) {
    setFolderStack(s => [...s, { id: f.id, name: f.name }]);
    setFolderId(f.id);
    setQuery("");
  }

  function goBack() {
    const stack = [...folderStack];
    stack.pop();
    setFolderStack(stack);
    setFolderId(stack.length ? stack[stack.length - 1].id : null);
  }

  async function handleUpload(files: FileList | File[]) {
    const fileList = Array.from(files);
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]!;
      setUploadProgress(0);
      try {
        await uploadDriveFile(file, folderId, pct => setUploadProgress(pct));
      } catch (e) {
        alert(`Upload failed for ${file.name}: ${e instanceof Error ? e.message : "Unknown"}`);
      }
    }
    setUploadProgress(null);
    load();
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await createDriveFolder(name, folderId);
      setNewFolderName("");
      setNewFolderOpen(false);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  async function handleStar(f: DriveFile) {
    try {
      await updateDriveFile(f.id, { isStarred: !f.isStarred });
      setFiles(fs => fs.map(x => x.id === f.id ? { ...x, isStarred: !f.isStarred } : x));
    } catch { /* silent */ }
  }

  async function handleDelete(f: DriveFile) {
    if (!confirm(`Move "${f.name}" to trash?`)) return;
    try {
      await deleteDriveFile(f.id);
      setFiles(fs => fs.filter(x => x.id !== f.id));
      setSelectedFile(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  // Drag-and-drop upload
  useEffect(() => {
    const node = dropRef.current;
    if (!node) return;
    const onDragOver = (e: DragEvent) => { e.preventDefault(); setIsDraggingOver(true); };
    const onDragLeave = (e: DragEvent) => {
      if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
      setIsDraggingOver(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      if (e.dataTransfer?.files?.length) handleUpload(e.dataTransfer.files);
    };
    node.addEventListener("dragover", onDragOver);
    node.addEventListener("dragleave", onDragLeave);
    node.addEventListener("drop", onDrop);
    return () => {
      node.removeEventListener("dragover", onDragOver);
      node.removeEventListener("dragleave", onDragLeave);
      node.removeEventListener("drop", onDrop);
    };
  }, [folderId]);

  const visibleFiles = filter === "starred"
    ? files.filter(f => f.isStarred)
    : files;
  const isEmpty = !loading && visibleFiles.length === 0 && folders.length === 0;

  return (
    <div ref={dropRef} className="flex h-full overflow-hidden relative">
      {/* Sidebar */}
      <aside className="w-[200px] flex-shrink-0 border-r border-brand-border bg-bg-sidebar/30 flex flex-col no-select">
        <div className="h-[52px] flex-shrink-0 flex items-center px-4 border-b border-brand-border">
          <span className="text-sm font-semibold text-text-primary">Drive</span>
        </div>
        <div className="p-3 space-y-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploadProgress !== null}
            className="flex w-full items-center justify-center gap-2 rounded-md py-2 text-xs font-semibold text-bg-deep transition-smooth disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #00d2ff 0%, #0098c7 100%)", boxShadow: "0 0 12px rgba(0,210,255,0.2)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
            {uploadProgress !== null ? `Uploading ${uploadProgress}%` : "Upload"}
          </button>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files) handleUpload(e.target.files); e.target.value = ""; }} />

          <button
            onClick={() => setNewFolderOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-brand-border py-2 text-xs font-medium text-text-secondary hover:bg-bg-hover transition-fast"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2zM12 11v6M9 14h6" />
            </svg>
            New folder
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {(["all", "starred", "shared"] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex h-8 w-full items-center gap-2.5 rounded-md px-3 text-xs transition-fast ${
                filter === f
                  ? "bg-brand-dim text-brand"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              }`}
            >
              <span>{f === "all" ? "📁" : f === "starred" ? "⭐" : "🔗"}</span>
              <span className="flex-1 text-left capitalize font-medium">
                {f === "all" ? "All files" : f === "starred" ? "Starred" : "Shared with me"}
              </span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-3 h-[52px] px-5 border-b border-brand-border no-select">
          {folderStack.length > 0 && (
            <button onClick={goBack} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-fast">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
              Back
            </button>
          )}

          <div className="flex items-center gap-1.5 text-sm">
            <button onClick={() => { setFolderStack([]); setFolderId(null); setQuery(""); }} className="text-text-muted hover:text-text-primary transition-fast font-medium">My Drive</button>
            {folderStack.map((f, i) => (
              <span key={f.id} className="flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
                <button
                  onClick={() => {
                    const ns = folderStack.slice(0, i + 1);
                    setFolderStack(ns);
                    setFolderId(f.id);
                  }}
                  className={`${i === folderStack.length - 1 ? "text-text-primary font-semibold" : "text-text-muted hover:text-text-primary"} transition-fast`}
                >
                  {f.name}
                </button>
              </span>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted/60" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search files…"
                className="pl-8 pr-3 py-1.5 rounded-lg bg-bg-card border border-brand-border text-xs text-text-primary placeholder-text-muted/50 outline-none focus:border-brand/50 transition-fast w-44"
              />
            </div>

            <div className="flex rounded-lg border border-brand-border overflow-hidden">
              {(["list", "grid"] as ViewMode[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`flex h-7 w-7 items-center justify-center transition-fast ${view === v ? "bg-brand-dim text-brand" : "text-text-muted hover:text-text-primary"}`}
                >
                  {v === "list" ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className={view === "grid" ? "grid grid-cols-4 gap-3" : "space-y-1"}>
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className={`skeleton rounded-lg ${view === "grid" ? "h-24" : "h-10"}`} />)}
            </div>
          )}

          {isEmpty && (
            <div className="flex flex-col items-center justify-center gap-3 h-full text-text-muted">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-20">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <p className="text-sm">{query ? "No files found" : "This folder is empty"}</p>
              <p className="text-xs text-text-muted/60">Drag files here or click Upload</p>
            </div>
          )}

          {!loading && !isEmpty && view === "list" && (
            <div>
              {folders.length > 0 && filter === "all" && (
                <div className="mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1 px-2">Folders</p>
                  {folders.map(f => (
                    <button
                      key={f.id}
                      onDoubleClick={() => openFolder(f)}
                      onClick={() => openFolder(f)}
                      className="w-full flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-bg-hover transition-fast text-left group"
                    >
                      <span className="text-lg flex-shrink-0">📁</span>
                      <span className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-text-primary truncate">{f.name}</p>
                      </span>
                      <svg className="opacity-0 group-hover:opacity-100 transition-fast text-text-muted" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                  ))}
                </div>
              )}

              {visibleFiles.length > 0 && (
                <>
                  {folders.length > 0 && filter === "all" && <div className="h-px bg-brand-border/40 my-2" />}
                  <div className="grid grid-cols-[auto_1fr_80px_100px_60px] gap-x-4 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted no-select">
                    <span /><span>Name</span><span className="text-right">Size</span><span className="text-right">Modified</span><span />
                  </div>
                  {visibleFiles.map(f => (
                    <div
                      key={f.id}
                      onClick={() => setSelectedFile(f)}
                      onDoubleClick={() => f.url && window.nexus.system.openExternal(f.url)}
                      className={`grid grid-cols-[auto_1fr_80px_100px_60px] gap-x-4 items-center rounded-lg px-3 py-1.5 hover:bg-bg-hover transition-fast cursor-pointer group ${selectedFile?.id === f.id ? "bg-brand-dim" : ""}`}
                    >
                      <span className="text-lg select-none">{fileIcon(f.mimeType)}</span>
                      <div className="min-w-0 flex items-center gap-2">
                        <p className="text-[13px] text-text-primary truncate">{f.name}</p>
                        {f.isStarred && <span className="text-[10px] text-amber-400">⭐</span>}
                      </div>
                      <p className="text-[11px] text-text-muted text-right">{formatSize(f.size)}</p>
                      <p className="text-[11px] text-text-muted text-right">{formatDate(f.updatedAt)}</p>
                      <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-fast">
                        <IconBtn onClick={e => { e.stopPropagation(); handleStar(f); }} title={f.isStarred ? "Unstar" : "Star"}>
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </IconBtn>
                        <IconBtn onClick={e => { e.stopPropagation(); handleDelete(f); }} title="Delete">
                          <path d="M3 6h18M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </IconBtn>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {!loading && !isEmpty && view === "grid" && (
            <div className="grid grid-cols-4 gap-3">
              {folders.map(f => (
                <button
                  key={f.id}
                  onDoubleClick={() => openFolder(f)}
                  onClick={() => openFolder(f)}
                  className="flex flex-col items-center gap-2 rounded-xl border border-brand-border bg-bg-card p-4 hover:bg-bg-hover hover:border-brand/30 transition-fast"
                >
                  <span className="text-3xl">📁</span>
                  <p className="text-[12px] font-medium text-text-primary text-center truncate w-full">{f.name}</p>
                </button>
              ))}
              {visibleFiles.map(f => (
                <div
                  key={f.id}
                  onClick={() => setSelectedFile(f)}
                  onDoubleClick={() => f.url && window.nexus.system.openExternal(f.url)}
                  className={`relative flex flex-col items-center gap-2 rounded-xl border bg-bg-card p-4 hover:bg-bg-hover hover:border-brand/30 transition-fast cursor-pointer ${
                    selectedFile?.id === f.id ? "border-brand" : "border-brand-border"
                  }`}
                >
                  <span className="text-3xl">{fileIcon(f.mimeType)}</span>
                  <p className="text-[12px] font-medium text-text-primary text-center truncate w-full">{f.name}</p>
                  <p className="text-[10px] text-text-muted">{formatSize(f.size)}</p>
                  {f.isStarred && <span className="absolute top-2 right-2 text-amber-400 text-xs">⭐</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* File detail panel */}
      {selectedFile && (
        <FilePreviewPanel
          file={selectedFile}
          onClose={() => setSelectedFile(null)}
          onStar={() => handleStar(selectedFile)}
          onDelete={() => handleDelete(selectedFile)}
        />
      )}

      {/* New folder modal */}
      {newFolderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 no-select">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setNewFolderOpen(false)} />
          <div className="relative w-full max-w-[360px] rounded-xl border border-brand-border bg-bg-card shadow-2xl p-5">
            <h3 className="text-sm font-semibold text-text-primary mb-3">New folder</h3>
            <input
              autoFocus
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") setNewFolderOpen(false); }}
              placeholder="Folder name"
              className="w-full rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/40 mb-3"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setNewFolderOpen(false)} className="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-hover">Cancel</button>
              <button onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="rounded-md px-3 py-1.5 text-xs font-semibold text-bg-deep disabled:opacity-50" style={{ background: "linear-gradient(135deg, #00d2ff 0%, #0098c7 100%)" }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Drag overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-brand-dim/40 border-4 border-dashed border-brand pointer-events-none">
          <p className="text-base font-semibold text-brand">Drop to upload</p>
        </div>
      )}
    </div>
  );
}

function IconBtn({ onClick, title, children }: { onClick: (e: React.MouseEvent) => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-bg-hover hover:text-text-primary transition-fast">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

function FilePreviewPanel({ file, onClose, onStar, onDelete }: { file: DriveFile; onClose: () => void; onStar: () => void; onDelete: () => void }) {
  const isImage = (file.mimeType ?? "").startsWith("image/");
  const isPdf = (file.mimeType ?? "").includes("pdf");
  return (
    <aside className="w-[280px] flex-shrink-0 border-l border-brand-border bg-bg-base flex flex-col no-select overflow-hidden">
      <div className="h-[52px] flex-shrink-0 flex items-center justify-between border-b border-brand-border px-4">
        <span className="text-sm font-semibold text-text-primary truncate">Details</span>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Preview area */}
        <div className="aspect-square rounded-lg border border-brand-border bg-bg-card flex items-center justify-center mb-3 overflow-hidden">
          {isImage && file.url ? (
            <img src={file.url} alt={file.name} className="w-full h-full object-contain" />
          ) : (
            <span className="text-6xl">{fileIcon(file.mimeType)}</span>
          )}
        </div>

        <p className="text-sm font-semibold text-text-primary break-words mb-3">{file.name}</p>

        <div className="space-y-2 text-xs">
          <Row label="Type">{file.mimeType ?? "Unknown"}</Row>
          <Row label="Size">{formatSize(file.size)}</Row>
          <Row label="Modified">{formatDate(file.updatedAt)}</Row>
          <Row label="Created">{formatDate(file.createdAt)}</Row>
        </div>

        <div className="mt-4 space-y-2">
          {file.url && (
            <button
              onClick={() => window.nexus.system.openExternal(file.url!)}
              className="w-full rounded-md py-2 text-xs font-semibold text-bg-deep"
              style={{ background: "linear-gradient(135deg, #00d2ff 0%, #0098c7 100%)" }}
            >
              {isPdf ? "Open PDF" : isImage ? "Open image" : "Open / Download"}
            </button>
          )}
          <button onClick={onStar} className="w-full rounded-md border border-brand-border py-2 text-xs font-medium text-text-secondary hover:bg-bg-hover transition-fast">
            {file.isStarred ? "★ Unstar" : "☆ Star"}
          </button>
          <button onClick={onDelete} className="w-full rounded-md border border-red-500/30 bg-red-500/10 py-2 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-fast">
            Move to trash
          </button>
        </div>
      </div>
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-secondary truncate text-right">{children}</span>
    </div>
  );
}
