"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  File,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Music,
  Video,
  Star,
  Trash2,
  Edit3,
  Share2,
  Download,
  Upload,
  Plus,
  Search,
  Grid3x3,
  List,
  ChevronRight,
  ChevronDown,
  X,
  Copy,
  Check,
  HardDrive,
  AlertTriangle,
  Loader2,
  Eye,
  Users,
  Clock,
  Activity,
  Calendar,
  SortAsc,
  MoreVertical,
  Sparkles,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { FilePreviewModal } from "@/components/FilePreviewModal";
import { VersionHistoryPanel } from "@/components/VersionHistoryPanel";
import { FileActivityLog } from "@/components/FileActivityLog";

type DriveFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  children?: DriveFolder[];
};

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  folderId: string | null;
  ownerId: string;
  isStarred: boolean;
  isTrashed: boolean;
  storageUrl: string;
  createdAt: string;
  updatedAt: string;
};

type StorageInfo = {
  usedMB: number;
  totalMB: number;
  configured: boolean;
};

type SidebarSection = "my-drive" | "shared" | "recent" | "starred" | "trash";

type SortKey = "name" | "size" | "updatedAt";
type SortDir = "asc" | "desc";

type UploadTask = {
  id: string;
  name: string;
  progress: number; // 0–100
  done: boolean;
  error: string | null;
};

type ContextMenu = {
  x: number;
  y: number;
  fileId?: string;
  folderId?: string;
  isFolder: boolean;
};

type ShareModal = {
  fileId: string;
  fileName: string;
};

type DetailTab = "activity" | "intelligence";

type FileIntelligence = {
  summary: string;
  classification: string;
  sensitivityLevel: string;
  cached: boolean;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMimeIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType === "application/pdf") return FileText;
  if (mimeType.startsWith("video/")) return Video;
  if (mimeType.startsWith("audio/")) return Music;
  return File;
}

function FolderTreeItem({
  folder,
  depth,
  currentFolderId,
  onSelect,
}: {
  folder: DriveFolder;
  depth: number;
  currentFolderId: string | null;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = folder.children && folder.children.length > 0;

  return (
    <div>
      <button
        onClick={() => {
          onSelect(folder.id);
          if (hasChildren) setExpanded((e) => !e);
        }}
        className={`flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors ${
          currentFolderId === folder.id
            ? "bg-[#00d2ff]/10 text-[#a5e7ff] font-medium"
            : "text-[#bbc9cf] hover:bg-[#1b1f2e] hover:text-[#dfe1f6]"
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#bbc9cf]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#bbc9cf]" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {expanded ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-yellow-500" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-yellow-500" />
        )}
        <span className="truncate">{folder.name}</span>
      </button>
      {expanded && hasChildren && (
        <div>
          {folder.children!.map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              depth={depth + 1}
              currentFolderId={currentFolderId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Share Modal ───────────────────────────────────────────────────────────────

type ShareRole = "VIEWER" | "EDITOR";
type ShareExpiry = "never" | "7" | "30" | "custom";

function ShareModalDialog({
  fileId,
  fileName,
  onClose,
}: {
  fileId: string;
  fileName: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"email" | "link">("link");
  const [role, setRole] = useState<ShareRole>("VIEWER");
  const [expiry, setExpiry] = useState<ShareExpiry>("7");
  const [customDate, setCustomDate] = useState("");
  const [email, setEmail] = useState("");
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [linkExpiry, setLinkExpiry] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const computeExpiresInDays = (): number | undefined => {
    if (expiry === "never") return undefined;
    if (expiry === "7") return 7;
    if (expiry === "30") return 30;
    return undefined;
  };

  const computeCustomExpiresAt = (): string | undefined => {
    if (expiry === "custom" && customDate) return new Date(customDate).toISOString();
    return undefined;
  };

  const handleCreateLink = async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        role,
        createLink: true,
      };
      const days = computeExpiresInDays();
      if (days) body.expiresInDays = days;
      const customAt = computeCustomExpiresAt();
      if (customAt) body.expiresAt = customAt;

      const res = await fetch(`/api/drive/files/${fileId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to create link");
      const data = await res.json() as { shareUrl?: string; expiresAt?: string };
      setLinkUrl(data.shareUrl ?? null);
      setLinkExpiry(data.expiresAt ?? null);
      toast.success("Share link created");
    } catch {
      toast.error("Could not create share link");
    } finally {
      setLoading(false);
    }
  };

  const handleShareWithEmail = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        role,
        email: email.trim(),
        createLink: false,
      };
      const days = computeExpiresInDays();
      if (days) body.expiresInDays = days;
      const customAt = computeCustomExpiresAt();
      if (customAt) body.expiresAt = customAt;

      const res = await fetch(`/api/drive/files/${fileId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Shared with ${email.trim()}`);
      setEmail("");
    } catch {
      toast.error("Could not share with that email");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!linkUrl) return;
    navigator.clipboard.writeText(linkUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-[#1b1f2e] p-6 shadow-2xl border border-[rgba(0,255,255,0.1)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#dfe1f6]">Share &ldquo;{fileName}&rdquo;</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-[#262939] transition-colors">
            <X className="h-4 w-4 text-[#bbc9cf]" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-[#1b1f2e] p-1 mb-5 border border-[rgba(0,255,255,0.1)]">
          {(["link", "email"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${
                tab === t ? "bg-[#262939] text-[#dfe1f6] shadow-sm" : "text-[#bbc9cf] hover:text-[#dfe1f6]"
              }`}
            >
              {t === "link" ? "Create link" : "Share by email"}
            </button>
          ))}
        </div>

        {/* Role */}
        <div className="mb-4">
          <p className="text-xs font-medium text-[#bbc9cf] mb-2">Permission</p>
          <div className="flex gap-2">
            {(["VIEWER", "EDITOR"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`flex-1 rounded-xl border py-2 text-sm font-medium transition-colors ${
                  role === r
                    ? "border-[#00d2ff] bg-[#00d2ff]/10 text-[#a5e7ff]"
                    : "border-[rgba(0,255,255,0.1)] text-[#bbc9cf] hover:border-[#859399]"
                }`}
              >
                {r === "VIEWER" ? "View only" : "Can edit"}
              </button>
            ))}
          </div>
        </div>

        {/* Expiry */}
        <div className="mb-5">
          <p className="text-xs font-medium text-[#bbc9cf] mb-2">Expiry</p>
          <div className="flex gap-2 flex-wrap">
            {(["never", "7", "30", "custom"] as const).map((e) => (
              <button
                key={e}
                onClick={() => setExpiry(e)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                  expiry === e
                    ? "border-[#00d2ff] bg-[#00d2ff]/10 text-[#a5e7ff]"
                    : "border-[rgba(0,255,255,0.1)] text-[#bbc9cf] hover:border-[#859399]"
                }`}
              >
                {e === "never" ? "Never" : e === "7" ? "7 days" : e === "30" ? "30 days" : "Custom"}
              </button>
            ))}
          </div>
          {expiry === "custom" && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="mt-2 w-full rounded-xl border border-[rgba(0,255,255,0.1)] px-3 py-2 text-sm outline-none focus:border-[#00d2ff] focus:ring-2 focus:ring-[#00d2ff]/20 bg-[#0f1321] text-[#dfe1f6]"
            />
          )}
        </div>

        {/* Tab content */}
        {tab === "link" ? (
          <div>
            {linkUrl ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-xl border border-[rgba(0,255,255,0.1)] bg-[#0f1321] p-3">
                  <span className="flex-1 truncate text-sm text-[#dfe1f6]">{linkUrl}</span>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 rounded-lg p-1.5 hover:bg-[#262939] transition-colors"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4 text-[#bbc9cf]" />
                    )}
                  </button>
                </div>
                {linkExpiry && (
                  <p className="text-xs text-[#bbc9cf]">
                    Expires {formatDistanceToNow(new Date(linkExpiry), { addSuffix: true })}
                  </p>
                )}
                {!linkExpiry && expiry === "never" && (
                  <p className="text-xs text-[#bbc9cf]">This link never expires.</p>
                )}
              </div>
            ) : (
              <button
                onClick={handleCreateLink}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00d2ff] py-2.5 text-sm font-medium text-[#003543] hover:opacity-90 disabled:opacity-60 transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                Create link
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              onKeyDown={(e) => { if (e.key === "Enter") handleShareWithEmail(); }}
              className="flex-1 rounded-xl border border-[rgba(0,255,255,0.1)] px-3 py-2 text-sm outline-none focus:border-[#00d2ff] focus:ring-2 focus:ring-[#00d2ff]/20 bg-[#0f1321] text-[#dfe1f6]"
            />
            <button
              onClick={handleShareWithEmail}
              disabled={loading || !email.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-[#00d2ff] px-4 py-2 text-sm font-medium text-[#003543] hover:opacity-90 disabled:opacity-60 transition-colors"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── File Detail Side Panel ────────────────────────────────────────────────────

function FileDetailPanel({
  file,
  onClose,
}: {
  file: DriveFile;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>("activity");
  const [intelligence, setIntelligence] = useState<FileIntelligence | null>(null);
  const [loadingIntel, setLoadingIntel] = useState(false);

  const loadIntelligence = async () => {
    if (intelligence) return;
    setLoadingIntel(true);
    try {
      const res = await fetch(`/api/drive/files/${file.id}/intelligence`);
      if (res.ok) setIntelligence(await res.json() as FileIntelligence);
    } finally {
      setLoadingIntel(false);
    }
  };

  const sensitivityColors: Record<string, string> = {
    PUBLIC:       "text-green-400 bg-green-400/10",
    INTERNAL:     "text-blue-400 bg-blue-400/10",
    CONFIDENTIAL: "text-amber-400 bg-amber-400/10",
    RESTRICTED:   "text-rose-400 bg-rose-400/10",
  };

  return (
    <div className="bg-[#1b1f2e] border-l border-[rgba(0,255,255,0.1)] w-80 flex flex-col shrink-0">
      <div className="px-4 py-3 border-b border-[rgba(0,255,255,0.1)] flex items-center justify-between font-semibold text-[#dfe1f6] text-sm">
        <span className="truncate">{file.name}</span>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-[#262939] transition-colors ml-2">
          <X className="h-4 w-4 text-[#bbc9cf]" />
        </button>
      </div>
      <div className="flex border-b border-[rgba(0,255,255,0.1)]">
        <button
          onClick={() => setActiveTab("activity")}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "activity"
              ? "border-b-2 border-[#00d2ff] text-[#00d2ff]"
              : "text-[#bbc9cf] hover:text-[#dfe1f6]"
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          Activity
        </button>
        <button
          onClick={() => { setActiveTab("intelligence"); void loadIntelligence(); }}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "intelligence"
              ? "border-b-2 border-[#00d2ff] text-[#00d2ff]"
              : "text-[#bbc9cf] hover:text-[#dfe1f6]"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          AI Intel
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {activeTab === "activity" && <FileActivityLog fileId={file.id} />}
        {activeTab === "intelligence" && (
          <div className="p-3 space-y-3">
            {loadingIntel ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-[#00d2ff]" />
              </div>
            ) : intelligence ? (
              <>
                {intelligence.classification && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#7a8899]">Type</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-[#262939] text-[#bbc9cf]">{intelligence.classification}</span>
                  </div>
                )}
                {intelligence.sensitivityLevel && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#7a8899]">Sensitivity</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${sensitivityColors[intelligence.sensitivityLevel] ?? "text-[#bbc9cf] bg-[#262939]"}`}>
                      {intelligence.sensitivityLevel}
                    </span>
                  </div>
                )}
                {intelligence.summary && (
                  <div>
                    <p className="text-xs text-[#7a8899] mb-1 font-medium">AI Summary</p>
                    <p className="text-xs text-[#bbc9cf] leading-relaxed">{intelligence.summary}</p>
                  </div>
                )}
                {intelligence.cached && (
                  <p className="text-xs text-[#4a5568] italic">Cached analysis</p>
                )}
              </>
            ) : (
              <div className="text-center py-6">
                <Sparkles className="w-6 h-6 text-[#4a5568] mx-auto mb-2" />
                <p className="text-xs text-[#7a8899]">Click AI Intel to analyze this file</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main DriveView ────────────────────────────────────────────────────────────

export function DriveView({ currentUserId }: { currentUserId: string }) {
  const [section, setSection] = useState<SidebarSection>("my-drive");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<DriveFolder[]>([]);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [sidebarFolders, setSidebarFolders] = useState<DriveFolder[]>([]);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [shareModal, setShareModal] = useState<ShareModal | null>(null);
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  const [versionFile, setVersionFile] = useState<DriveFile | null>(null);
  const [detailFile, setDetailFile] = useState<DriveFile | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  const fetchStorage = useCallback(async () => {
    try {
      const res = await fetch("/api/drive/storage");
      if (res.ok) {
        const data = await res.json() as {
          totalMB?: number;
          usedMB?: number;
          configured?: boolean;
          totalBytes?: number;
          usagePercent?: number;
        };
        setStorage({
          usedMB: data.usedMB ?? (data.totalBytes ? data.totalBytes / 1024 / 1024 : 0),
          totalMB: data.totalMB ?? 15360,
          configured: data.configured ?? true,
        });
      }
    } catch {
      setStorage({ usedMB: 0, totalMB: 15360, configured: false });
    }
  }, []);

  const fetchSidebarFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/drive/folders?parentId=root");
      if (res.ok) {
        const data = await res.json() as DriveFolder[];
        setSidebarFolders(data);
      }
    } catch {
      setSidebarFolders([]);
    }
  }, []);

  const fetchContent = useCallback(async () => {
    setLoadingContent(true);
    try {
      let foldersData: DriveFolder[] = [];
      let filesData: DriveFile[] = [];

      if (section === "my-drive") {
        const folderParam = currentFolderId ?? "root";
        const [fRes, fileRes] = await Promise.all([
          fetch(`/api/drive/folders?parentId=${folderParam}`),
          fetch(`/api/drive/files?folderId=${folderParam === "root" ? "" : folderParam}`),
        ]);
        if (fRes.ok) foldersData = await fRes.json() as DriveFolder[];
        if (fileRes.ok) filesData = (await fileRes.json() as DriveFile[]).map((f) => ({
          ...f,
          size: Number(f.size),
        }));
      } else if (section === "starred") {
        const fileRes = await fetch(`/api/drive/files?starred=true`);
        if (fileRes.ok) filesData = (await fileRes.json() as DriveFile[]).map((f) => ({
          ...f,
          size: Number(f.size),
        }));
      } else if (section === "trash") {
        const fileRes = await fetch(`/api/drive/files?trashed=true`);
        if (fileRes.ok) filesData = (await fileRes.json() as DriveFile[]).map((f) => ({
          ...f,
          size: Number(f.size),
        }));
      } else if (section === "recent") {
        const fileRes = await fetch(`/api/drive/files?all=true`);
        if (fileRes.ok) {
          const all = (await fileRes.json() as DriveFile[]).map((f) => ({
            ...f,
            size: Number(f.size),
          }));
          filesData = all
            .filter((f) => !f.isTrashed)
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .slice(0, 50);
        }
      } else if (section === "shared") {
        // Files shared with current user via DrivePermission
        const fileRes = await fetch(`/api/drive/files/shared`);
        if (fileRes.ok) filesData = (await fileRes.json() as DriveFile[]).map((f) => ({
          ...f,
          size: Number(f.size),
        }));
      }

      setFolders(foldersData);
      setFiles(filesData);
    } catch {
      toast.error("Failed to load drive contents");
    } finally {
      setLoadingContent(false);
    }
  }, [currentFolderId, section]);

  useEffect(() => {
    fetchStorage();
    fetchSidebarFolders();
  }, [fetchStorage, fetchSidebarFolders]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  // Close sort menu / context menu on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
      setContextMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const navigateToFolder = (folder: DriveFolder) => {
    setCurrentFolderId(folder.id);
    setBreadcrumb((prev) => {
      const idx = prev.findIndex((f) => f.id === folder.id);
      if (idx !== -1) return prev.slice(0, idx + 1);
      return [...prev, folder];
    });
  };

  const navigateToBreadcrumb = (index: number) => {
    if (index === -1) {
      setCurrentFolderId(null);
      setBreadcrumb([]);
    } else {
      setCurrentFolderId(breadcrumb[index].id);
      setBreadcrumb(breadcrumb.slice(0, index + 1));
    }
  };

  // Single file upload (legacy input handler)
  const handleUploadSingle = async (file: File) => {
    const taskId = Math.random().toString(36).slice(2);
    const task: UploadTask = { id: taskId, name: file.name, progress: 0, done: false, error: null };
    setUploadTasks((prev) => [...prev, task]);

    try {
      const fd = new FormData();
      fd.append("file", file);
      if (currentFolderId) fd.append("folderId", currentFolderId);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploadTasks((prev) =>
              prev.map((t) => (t.id === taskId ? { ...t, progress: pct } : t))
            );
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadTasks((prev) =>
              prev.map((t) => (t.id === taskId ? { ...t, progress: 100, done: true } : t))
            );
            resolve();
          } else {
            let msg = "Upload failed";
            try {
              const d = JSON.parse(xhr.responseText) as { error?: string };
              msg = d.error ?? msg;
            } catch {
              // ignore
            }
            reject(new Error(msg));
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.open("POST", "/api/drive/upload");
        xhr.send(fd);
      });

      toast.success(`${file.name} uploaded`);
      fetchContent();
      fetchStorage();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, error: msg, done: true } : t))
      );
      toast.error(`${file.name}: ${msg}`);
    } finally {
      // Remove task after 4 seconds
      setTimeout(() => {
        setUploadTasks((prev) => prev.filter((t) => t.id !== taskId));
      }, 4000);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    for (const f of files) {
      handleUploadSingle(f);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    for (const f of droppedFiles) {
      handleUploadSingle(f);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch("/api/drive/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim(), parentId: currentFolderId }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Folder created");
      setCreatingFolder(false);
      setNewFolderName("");
      fetchContent();
      fetchSidebarFolders();
    } catch {
      toast.error("Could not create folder");
    }
  };

  const handleRename = async (id: string, isFolder: boolean) => {
    if (!renameValue.trim()) return;
    try {
      const endpoint = isFolder ? `/api/drive/folders/${id}` : `/api/drive/files/${id}`;
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Renamed");
      setRenamingId(null);
      setRenameValue("");
      fetchContent();
    } catch {
      toast.error("Rename failed");
    }
  };

  const handleTrash = async (id: string, isFolder: boolean) => {
    try {
      const endpoint = isFolder ? `/api/drive/folders/${id}` : `/api/drive/files/${id}`;
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Moved to trash");
      fetchContent();
    } catch {
      toast.error("Could not trash item");
    }
  };

  const handleStar = async (id: string, isStarred: boolean) => {
    try {
      const res = await fetch(`/api/drive/files/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isStarred: !isStarred }),
      });
      if (!res.ok) throw new Error("Failed");
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, isStarred: !isStarred } : f))
      );
    } catch {
      toast.error("Could not update star");
    }
  };

  const handleShare = (file: DriveFile) => {
    setShareModal({ fileId: file.id, fileName: file.name });
  };

  const handleDownload = (file: DriveFile) => {
    const a = document.createElement("a");
    a.href = `/api/drive/files/${file.id}/download`;
    a.download = file.name;
    a.click();
  };

  const handlePreview = (file: DriveFile) => {
    setPreviewFile(file);
  };

  // Right-click context menu
  const handleContextMenu = (
    e: React.MouseEvent,
    opts: { fileId?: string; folderId?: string; isFolder: boolean }
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, ...opts });
  };

  const getContextFile = () =>
    contextMenu?.fileId ? files.find((f) => f.id === contextMenu.fileId) ?? null : null;

  const getContextFolder = () =>
    contextMenu?.folderId ? folders.find((f) => f.id === contextMenu.folderId) ?? null : null;

  // Sorting
  const sortFn = (a: DriveFile, b: DriveFile): number => {
    let cmp = 0;
    if (sortKey === "name") cmp = a.name.localeCompare(b.name);
    else if (sortKey === "size") cmp = a.size - b.size;
    else cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    return sortDir === "asc" ? cmp : -cmp;
  };

  const filteredFolders = folders.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredFiles = files
    .filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort(sortFn);

  const storagePercent = storage
    ? Math.min((storage.usedMB / (storage.totalMB || 15360)) * 100, 100)
    : 0;

  const activeFileForDetail = selectedItem ? files.find((f) => f.id === selectedItem) ?? null : null;

  return (
    <div
      className="flex h-full bg-[#0f1321] relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-2xl border-4 border-dashed border-[#00d2ff] bg-[#00d2ff]/10">
          <div className="flex flex-col items-center gap-2 text-[#00d2ff]">
            <Upload className="h-12 w-12" />
            <p className="text-lg font-semibold">Drop files to upload</p>
          </div>
        </div>
      )}

      {/* Left sidebar */}
      <aside className="bg-[#1b1f2e] border-r border-[rgba(0,255,255,0.1)] w-56 flex-shrink-0 flex flex-col">
        <div className="p-4 flex gap-2">
          <button
            onClick={() => {
              setCreatingFolder(true);
              setNewFolderName("");
            }}
            className="bg-[#00d2ff] text-[#003543] hover:opacity-90 rounded-md px-4 py-2 text-sm font-medium flex items-center gap-2 flex-1 justify-center"
            style={{ transition: "background-color 150ms ease-out" }}
          >
            <Plus className="h-4 w-4" />
            New
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Upload files"
            className="bg-[#1b1f2e] text-[#bbc9cf] hover:bg-[#1b1f2e] border border-[rgba(0,255,255,0.1)] rounded-md px-3 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <Upload className="h-4 w-4" />
          </button>
        </div>

        <nav className="px-3 space-y-0.5">
          {(
            [
              { key: "my-drive", label: "My Drive", icon: HardDrive },
              { key: "shared", label: "Shared with me", icon: Users },
              { key: "recent", label: "Recent", icon: Clock },
              { key: "starred", label: "Starred", icon: Star },
              { key: "trash", label: "Trash", icon: Trash2 },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setSection(key);
                setCurrentFolderId(null);
                setBreadcrumb([]);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                section === key
                  ? "bg-[#00d2ff]/10 text-[#a5e7ff] font-medium"
                  : "text-[#bbc9cf] hover:bg-[#1b1f2e] hover:text-[#dfe1f6]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        {section === "my-drive" && sidebarFolders.length > 0 && (
          <div className="mt-4 px-3">
            <p className="text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider px-4 py-2">
              Folders
            </p>
            <div className="space-y-0.5">
              {sidebarFolders.map((f) => (
                <FolderTreeItem
                  key={f.id}
                  folder={f}
                  depth={0}
                  currentFolderId={currentFolderId}
                  onSelect={(id) => {
                    setCurrentFolderId(id);
                    const found = sidebarFolders.find((sf) => sf.id === id);
                    if (found) setBreadcrumb([found]);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="px-4 py-3 border-t border-[rgba(0,255,255,0.1)] mt-auto">
          {storage && (
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-xs text-[#bbc9cf]">{formatFileSize(storage.usedMB * 1024 * 1024)} used</span>
                <span className="text-xs text-[#bbc9cf]">15 GB</span>
              </div>
              <div className="bg-[#262939] rounded-full h-1.5">
                <div
                  className="bg-[#00d2ff] text-[#003543] h-1.5 rounded-full transition-all"
                  style={{ width: `${storagePercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col bg-[#0f1321] min-w-0 overflow-hidden">
        {storage && !storage.configured && (
          <div className="flex items-center gap-2 bg-yellow-950/30 border-b border-yellow-700/30 px-6 py-2.5 text-sm text-yellow-400">
            <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
            File storage not configured. Set R2_ENDPOINT in .env
          </div>
        )}

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-[rgba(0,255,255,0.1)] bg-[#1b1f2e] flex items-center gap-3">
          <nav className="flex items-center gap-1 flex-1 min-w-0">
            <button
              onClick={() => navigateToBreadcrumb(-1)}
              className="text-sm text-[#bbc9cf] hover:text-[#dfe1f6] transition-colors font-medium whitespace-nowrap"
            >
              {section === "my-drive" ? "My Drive"
                : section === "shared" ? "Shared with me"
                : section === "recent" ? "Recent"
                : section === "starred" ? "Starred"
                : "Trash"}
            </button>
            {breadcrumb.map((crumb, idx) => (
              <span key={crumb.id} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-[#3c494e]" />
                <button
                  onClick={() => navigateToBreadcrumb(idx)}
                  className={`text-sm text-[#bbc9cf] hover:text-[#dfe1f6] transition-colors ${
                    idx === breadcrumb.length - 1
                      ? "font-medium text-[#dfe1f6]"
                      : ""
                  }`}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>

          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#bbc9cf]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="w-full bg-[#1b1f2e] border-transparent rounded-lg pl-9 py-2 text-sm focus:ring-2 focus:ring-[#00d2ff] focus:bg-[#262939] outline-none pr-3 text-[#dfe1f6]"
            />
          </div>

          {/* Sort */}
          <div className="relative" ref={sortMenuRef}>
            <button
              onClick={() => setShowSortMenu((v) => !v)}
              className="bg-[#1b1f2e] text-[#bbc9cf] hover:bg-[#1b1f2e] border border-[rgba(0,255,255,0.1)] rounded-md px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <SortAsc className="h-4 w-4" />
              Sort
            </button>
            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1 z-30 bg-[#1b1f2e] border border-[rgba(0,255,255,0.1)] rounded-lg shadow-lg py-1 min-w-[160px]">
                {(
                  [
                    { key: "name", label: "Name" },
                    { key: "size", label: "Size" },
                    { key: "updatedAt", label: "Date modified" },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                      else { setSortKey(key); setSortDir("asc"); }
                      setShowSortMenu(false);
                    }}
                    className={`px-4 py-2 text-sm text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] flex items-center gap-2 cursor-pointer w-full justify-between ${
                      sortKey === key ? "text-[#00d2ff] font-medium" : ""
                    }`}
                  >
                    {label}
                    {sortKey === key && (
                      <span className="text-xs text-[#bbc9cf]">{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-[rgba(0,255,255,0.1)] p-0.5">
            <button
              onClick={() => setView("grid")}
              className={`rounded-md p-1.5 transition-colors ${
                view === "grid" ? "bg-[#00d2ff]/10 text-[#00d2ff]" : "text-[#bbc9cf] hover:bg-[#1b1f2e]"
              }`}
            >
              <Grid3x3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`rounded-md p-1.5 transition-colors ${
                view === "list" ? "bg-[#00d2ff]/10 text-[#00d2ff]" : "text-[#bbc9cf] hover:bg-[#1b1f2e]"
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-[#00d2ff] text-[#003543] hover:opacity-90 rounded-md px-4 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <Upload className="h-4 w-4" />
            Upload
          </button>
        </div>

        {/* Upload progress bar area */}
        {uploadTasks.length > 0 && (
          <div className="border-b border-[rgba(0,255,255,0.1)] bg-[#1b1f2e] px-6 py-2 space-y-1.5">
            {uploadTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3">
                <span className="text-xs text-[#bbc9cf] truncate flex-1 max-w-xs">{task.name}</span>
                {task.error ? (
                  <span className="text-xs text-red-400">{task.error}</span>
                ) : task.done ? (
                  <span className="text-xs text-green-400 flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> Done
                  </span>
                ) : (
                  <div className="flex items-center gap-2 flex-1 max-w-xs">
                    <div className="bg-[#262939] rounded-full h-1.5 flex-1">
                      <div
                        className="bg-[#00d2ff] text-[#003543] h-1.5 rounded-full transition-all"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-[#bbc9cf] w-8 text-right">{task.progress}%</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* File browser area */}
          <div className="flex-1 overflow-y-auto p-6">
            {creatingFolder && (
              <div className="mb-4 flex items-center gap-2">
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateFolder();
                    if (e.key === "Escape") {
                      setCreatingFolder(false);
                      setNewFolderName("");
                    }
                  }}
                  placeholder="Folder name"
                  className="rounded-lg border border-[#00d2ff] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#00d2ff]/20 w-48 bg-[#1b1f2e] text-[#dfe1f6]"
                />
                <button
                  onClick={handleCreateFolder}
                  className="bg-[#00d2ff] text-[#003543] hover:opacity-90 rounded-md px-3 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setCreatingFolder(false);
                    setNewFolderName("");
                  }}
                  className="bg-[#1b1f2e] text-[#bbc9cf] hover:bg-[#1b1f2e] border border-[rgba(0,255,255,0.1)] rounded-md px-3 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {loadingContent ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#00d2ff]" />
              </div>
            ) : filteredFolders.length === 0 && filteredFiles.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-[#bbc9cf]">
                <HardDrive className="h-12 w-12 text-[#3c494e]" />
                <p className="text-sm">
                  {searchQuery ? "No results found" : "This folder is empty"}
                </p>
                {!searchQuery && (
                  <p className="text-xs text-[#3c494e]">
                    Drag & drop files here to upload
                  </p>
                )}
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {filteredFolders.map((folder) => (
                  <GridFolderCard
                    key={folder.id}
                    folder={folder}
                    selected={selectedItem === folder.id}
                    renamingId={renamingId}
                    renameValue={renameValue}
                    onSetRenameValue={setRenameValue}
                    onSelect={() => setSelectedItem(folder.id)}
                    onOpen={() => navigateToFolder(folder)}
                    onRenameStart={() => {
                      setRenamingId(folder.id);
                      setRenameValue(folder.name);
                    }}
                    onRenameSubmit={() => handleRename(folder.id, true)}
                    onRenameCancel={() => setRenamingId(null)}
                    onTrash={() => handleTrash(folder.id, true)}
                    onContextMenu={(e) => handleContextMenu(e, { folderId: folder.id, isFolder: true })}
                  />
                ))}
                {filteredFiles.map((file) => (
                  <GridFileCard
                    key={file.id}
                    file={file}
                    selected={selectedItem === file.id}
                    renamingId={renamingId}
                    renameValue={renameValue}
                    onSetRenameValue={setRenameValue}
                    onSelect={() => {
                      setSelectedItem(file.id);
                      setDetailFile(file);
                    }}
                    onPreview={() => handlePreview(file)}
                    onRenameStart={() => {
                      setRenamingId(file.id);
                      setRenameValue(file.name);
                    }}
                    onRenameSubmit={() => handleRename(file.id, false)}
                    onRenameCancel={() => setRenamingId(null)}
                    onTrash={() => handleTrash(file.id, false)}
                    onStar={() => handleStar(file.id, file.isStarred)}
                    onShare={() => handleShare(file)}
                    onDownload={() => handleDownload(file)}
                    onContextMenu={(e) => handleContextMenu(e, { fileId: file.id, isFolder: false })}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-[rgba(0,255,255,0.1)] bg-[#1b1f2e] overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#0f1321] border-b border-[rgba(0,255,255,0.1)]">
                      <th
                        className="text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider px-4 py-3 text-left cursor-pointer hover:text-[#dfe1f6] select-none"
                        onClick={() => {
                          if (sortKey === "name") setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                          else { setSortKey("name"); setSortDir("asc"); }
                        }}
                      >
                        <span className="flex items-center gap-1">
                          Name {sortKey === "name" && <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>}
                        </span>
                      </th>
                      <th
                        className="text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider px-4 py-3 text-left cursor-pointer hover:text-[#dfe1f6] select-none"
                        onClick={() => {
                          if (sortKey === "updatedAt") setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                          else { setSortKey("updatedAt"); setSortDir("desc"); }
                        }}
                      >
                        <span className="flex items-center gap-1">
                          Modified {sortKey === "updatedAt" && <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>}
                        </span>
                      </th>
                      <th
                        className="text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider px-4 py-3 text-left cursor-pointer hover:text-[#dfe1f6] select-none"
                        onClick={() => {
                          if (sortKey === "size") setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                          else { setSortKey("size"); setSortDir("asc"); }
                        }}
                      >
                        <span className="flex items-center gap-1">
                          Size {sortKey === "size" && <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>}
                        </span>
                      </th>
                      <th className="text-xs font-semibold text-[#bbc9cf] uppercase tracking-wider px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFolders.map((folder) => (
                      <ListFolderRow
                        key={folder.id}
                        folder={folder}
                        renamingId={renamingId}
                        renameValue={renameValue}
                        onSetRenameValue={setRenameValue}
                        onOpen={() => navigateToFolder(folder)}
                        onRenameStart={() => {
                          setRenamingId(folder.id);
                          setRenameValue(folder.name);
                        }}
                        onRenameSubmit={() => handleRename(folder.id, true)}
                        onRenameCancel={() => setRenamingId(null)}
                        onTrash={() => handleTrash(folder.id, true)}
                        onContextMenu={(e) => handleContextMenu(e, { folderId: folder.id, isFolder: true })}
                      />
                    ))}
                    {filteredFiles.map((file) => (
                      <ListFileRow
                        key={file.id}
                        file={file}
                        renamingId={renamingId}
                        renameValue={renameValue}
                        onSetRenameValue={setRenameValue}
                        onSelect={() => {
                          setSelectedItem(file.id);
                          setDetailFile(file);
                        }}
                        onPreview={() => handlePreview(file)}
                        onRenameStart={() => {
                          setRenamingId(file.id);
                          setRenameValue(file.name);
                        }}
                        onRenameSubmit={() => handleRename(file.id, false)}
                        onRenameCancel={() => setRenamingId(null)}
                        onTrash={() => handleTrash(file.id, false)}
                        onStar={() => handleStar(file.id, file.isStarred)}
                        onShare={() => handleShare(file)}
                        onDownload={() => handleDownload(file)}
                        onContextMenu={(e) => handleContextMenu(e, { fileId: file.id, isFolder: false })}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* File detail side panel */}
          {activeFileForDetail && detailFile && detailFile.id === activeFileForDetail.id && (
            <FileDetailPanel
              file={activeFileForDetail}
              onClose={() => {
                setSelectedItem(null);
                setDetailFile(null);
              }}
            />
          )}
        </div>
      </main>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-[#1b1f2e] border border-[rgba(0,255,255,0.1)] rounded-lg shadow-lg py-1 min-w-[160px] text-sm"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {!contextMenu.isFolder && (() => {
            const file = getContextFile();
            if (!file) return null;
            return (
              <>
                <CtxItem icon={Eye} label="Preview" onClick={() => { handlePreview(file); setContextMenu(null); }} />
                <CtxItem icon={Download} label="Download" onClick={() => { handleDownload(file); setContextMenu(null); }} />
                <CtxItem icon={Share2} label="Share" onClick={() => { handleShare(file); setContextMenu(null); }} />
                <div className="my-1 border-t border-[rgba(0,255,255,0.1)]" />
                <CtxItem
                  icon={Star}
                  label={file.isStarred ? "Unstar" : "Star"}
                  onClick={() => { handleStar(file.id, file.isStarred); setContextMenu(null); }}
                />
                <CtxItem
                  icon={Edit3}
                  label="Rename"
                  onClick={() => {
                    setRenamingId(file.id);
                    setRenameValue(file.name);
                    setContextMenu(null);
                  }}
                />
                <div className="my-1 border-t border-[rgba(0,255,255,0.1)]" />
                <CtxItem
                  icon={Trash2}
                  label="Move to Trash"
                  danger
                  onClick={() => { handleTrash(file.id, false); setContextMenu(null); }}
                />
              </>
            );
          })()}
          {contextMenu.isFolder && (() => {
            const folder = getContextFolder();
            if (!folder) return null;
            return (
              <>
                <CtxItem icon={FolderOpen} label="Open" onClick={() => { navigateToFolder(folder); setContextMenu(null); }} />
                <CtxItem
                  icon={Edit3}
                  label="Rename"
                  onClick={() => {
                    setRenamingId(folder.id);
                    setRenameValue(folder.name);
                    setContextMenu(null);
                  }}
                />
                <div className="my-1 border-t border-[rgba(0,255,255,0.1)]" />
                <CtxItem
                  icon={Trash2}
                  label="Move to Trash"
                  danger
                  onClick={() => { handleTrash(folder.id, true); setContextMenu(null); }}
                />
              </>
            );
          })()}
        </div>
      )}

      {/* Share modal */}
      {shareModal && (
        <ShareModalDialog
          fileId={shareModal.fileId}
          fileName={shareModal.fileName}
          onClose={() => setShareModal(null)}
        />
      )}

      {/* Preview modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          isOwner={previewFile.ownerId === currentUserId}
          onClose={() => setPreviewFile(null)}
          onDownload={() => handleDownload(previewFile)}
          onDelete={() => {
            handleTrash(previewFile.id, false);
            setPreviewFile(null);
          }}
          onShowVersions={() => {
            setVersionFile(previewFile);
            setPreviewFile(null);
          }}
          onShare={() => {
            handleShare(previewFile);
            setPreviewFile(null);
          }}
          allFiles={filteredFiles}
          onNavigate={(f) => {
            const found = filteredFiles.find((ff) => ff.id === f.id);
            if (found) setPreviewFile(found);
          }}
        />
      )}

      {/* Version history panel */}
      {versionFile && (
        <VersionHistoryPanel
          fileId={versionFile.id}
          fileName={versionFile.name}
          onClose={() => setVersionFile(null)}
          onRestored={() => {
            fetchContent();
          }}
        />
      )}
    </div>
  );
}

// ── Context menu item ─────────────────────────────────────────────────────────

function CtxItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm flex items-center gap-2 cursor-pointer w-full hover:bg-[#262939] hover:text-[#dfe1f6] transition-colors ${
        danger ? "text-red-400" : "text-[#bbc9cf]"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

// ── Grid cards ────────────────────────────────────────────────────────────────

function GridFolderCard({
  folder,
  selected,
  renamingId,
  renameValue,
  onSetRenameValue,
  onSelect,
  onOpen,
  onRenameStart,
  onRenameSubmit,
  onRenameCancel,
  onTrash,
  onContextMenu,
}: {
  folder: DriveFolder;
  selected: boolean;
  renamingId: string | null;
  renameValue: string;
  onSetRenameValue: (v: string) => void;
  onSelect: () => void;
  onOpen: () => void;
  onRenameStart: () => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onTrash: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`group relative cursor-pointer rounded-xl border p-4 transition-all ${
        selected
          ? "border-[#00d2ff]/30 bg-[#00d2ff]/10"
          : "bg-[#1b1f2e] border-[rgba(0,255,255,0.1)] hover:shadow-md hover:border-[#00d2ff]/30"
      }`}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onContextMenu={onContextMenu}
    >
      <div className="mb-3 flex justify-center">
        <div className="w-12 h-12 rounded-lg bg-[#1b1f2e] flex items-center justify-center">
          <Folder className="h-7 w-7 text-yellow-500" />
        </div>
      </div>
      {renamingId === folder.id ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onSetRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenameSubmit();
            if (e.key === "Escape") onRenameCancel();
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-full rounded-lg border border-[#00d2ff] px-2 py-1 text-xs outline-none bg-[#0f1321] text-[#dfe1f6]"
        />
      ) : (
        <p className="font-medium text-sm text-[#dfe1f6] truncate text-center">{folder.name}</p>
      )}
      <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
        <ActionBtn icon={Edit3} onClick={(e) => { e.stopPropagation(); onRenameStart(); }} title="Rename" />
        <ActionBtn icon={Trash2} onClick={(e) => { e.stopPropagation(); onTrash(); }} title="Trash" />
        <ActionBtn icon={MoreVertical} onClick={(e) => { e.stopPropagation(); onContextMenu(e); }} title="More" />
      </div>
    </div>
  );
}

function GridFileCard({
  file,
  selected,
  renamingId,
  renameValue,
  onSetRenameValue,
  onSelect,
  onPreview,
  onRenameStart,
  onRenameSubmit,
  onRenameCancel,
  onTrash,
  onStar,
  onShare,
  onDownload,
  onContextMenu,
}: {
  file: DriveFile;
  selected: boolean;
  renamingId: string | null;
  renameValue: string;
  onSetRenameValue: (v: string) => void;
  onSelect: () => void;
  onPreview: () => void;
  onRenameStart: () => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onTrash: () => void;
  onStar: () => void;
  onShare: () => void;
  onDownload: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const Icon = getMimeIcon(file.mimeType);
  return (
    <div
      className={`group relative cursor-pointer rounded-xl border p-4 transition-all ${
        selected
          ? "border-[#00d2ff]/30 bg-[#00d2ff]/10"
          : "bg-[#1b1f2e] border-[rgba(0,255,255,0.1)] hover:shadow-md hover:border-[#00d2ff]/30"
      }`}
      onClick={onSelect}
      onDoubleClick={onPreview}
      onContextMenu={onContextMenu}
    >
      {/* Thumbnail area */}
      <div className="mb-3 flex justify-center">
        {file.mimeType.startsWith("image/") && file.storageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/drive/files/${file.id}/download`}
            alt={file.name}
            className="h-12 w-full rounded-lg object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-[#1b1f2e] flex items-center justify-center">
            <Icon className="h-7 w-7 text-[#00d2ff]" />
          </div>
        )}
      </div>
      {renamingId === file.id ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onSetRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenameSubmit();
            if (e.key === "Escape") onRenameCancel();
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-full rounded-lg border border-[#00d2ff] px-2 py-1 text-xs outline-none bg-[#0f1321] text-[#dfe1f6]"
        />
      ) : (
        <p className="font-medium text-sm text-[#dfe1f6] truncate text-center">{file.name}</p>
      )}
      <p className="mt-1 text-center text-xs text-[#bbc9cf]">{formatFileSize(file.size)}</p>
      {file.isStarred && (
        <Star className="absolute left-2 top-2 h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
      )}
      <div className="absolute right-1 top-1 hidden flex-wrap gap-1 group-hover:flex">
        <ActionBtn
          icon={Eye}
          onClick={(e) => { e.stopPropagation(); onPreview(); }}
          title="Preview"
        />
        <ActionBtn
          icon={Star}
          onClick={(e) => { e.stopPropagation(); onStar(); }}
          title={file.isStarred ? "Unstar" : "Star"}
          active={file.isStarred}
          activeClass="text-yellow-500"
        />
        <ActionBtn icon={Share2} onClick={(e) => { e.stopPropagation(); onShare(); }} title="Share" />
        <ActionBtn icon={Download} onClick={(e) => { e.stopPropagation(); onDownload(); }} title="Download" />
        <ActionBtn icon={Trash2} onClick={(e) => { e.stopPropagation(); onTrash(); }} title="Trash" />
      </div>
    </div>
  );
}

// ── List rows ─────────────────────────────────────────────────────────────────

function ListFolderRow({
  folder,
  renamingId,
  renameValue,
  onSetRenameValue,
  onOpen,
  onRenameStart,
  onRenameSubmit,
  onRenameCancel,
  onTrash,
  onContextMenu,
}: {
  folder: DriveFolder;
  renamingId: string | null;
  renameValue: string;
  onSetRenameValue: (v: string) => void;
  onOpen: () => void;
  onRenameStart: () => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onTrash: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <tr
      className="border-b border-[rgba(0,255,255,0.1)] hover:bg-[#0f1321] transition-colors group cursor-pointer"
      onContextMenu={onContextMenu}
    >
      <td className="px-4 py-3 text-sm text-[#dfe1f6]">
        <div className="flex items-center gap-2.5 cursor-pointer" onDoubleClick={onOpen}>
          <Folder className="h-5 w-5 text-yellow-500 shrink-0" />
          {renamingId === folder.id ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => onSetRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRenameSubmit();
                if (e.key === "Escape") onRenameCancel();
              }}
              className="rounded border border-[#00d2ff] px-2 py-0.5 text-sm outline-none bg-[#0f1321] text-[#dfe1f6]"
            />
          ) : (
            <span className="text-sm font-medium text-[#dfe1f6]">{folder.name}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-[#dfe1f6]">
        <span className="flex items-center gap-1.5 text-[#bbc9cf]">
          <Calendar className="h-3.5 w-3.5 text-[#bbc9cf]" />
          {formatDistanceToNow(new Date(folder.createdAt), { addSuffix: true })}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-[#bbc9cf]">—</td>
      <td className="px-4 py-3 text-right">
        <div className="hidden gap-1 justify-end group-hover:flex">
          <ActionBtn icon={Edit3} onClick={onRenameStart} title="Rename" />
          <ActionBtn icon={Trash2} onClick={onTrash} title="Trash" />
        </div>
      </td>
    </tr>
  );
}

function ListFileRow({
  file,
  renamingId,
  renameValue,
  onSetRenameValue,
  onSelect,
  onPreview,
  onRenameStart,
  onRenameSubmit,
  onRenameCancel,
  onTrash,
  onStar,
  onShare,
  onDownload,
  onContextMenu,
}: {
  file: DriveFile;
  renamingId: string | null;
  renameValue: string;
  onSetRenameValue: (v: string) => void;
  onSelect: () => void;
  onPreview: () => void;
  onRenameStart: () => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onTrash: () => void;
  onStar: () => void;
  onShare: () => void;
  onDownload: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const Icon = getMimeIcon(file.mimeType);
  return (
    <tr
      className="border-b border-[rgba(0,255,255,0.1)] hover:bg-[#0f1321] transition-colors group cursor-pointer"
      onContextMenu={onContextMenu}
      onClick={onSelect}
    >
      <td className="px-4 py-3 text-sm text-[#dfe1f6]">
        <div className="flex items-center gap-2.5 cursor-pointer" onDoubleClick={onPreview}>
          <Icon className="h-5 w-5 text-[#00d2ff] shrink-0" />
          {renamingId === file.id ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => onSetRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRenameSubmit();
                if (e.key === "Escape") onRenameCancel();
              }}
              className="rounded border border-[#00d2ff] px-2 py-0.5 text-sm outline-none bg-[#0f1321] text-[#dfe1f6]"
            />
          ) : (
            <span className="text-sm font-medium text-[#dfe1f6]">{file.name}</span>
          )}
          {file.isStarred && <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400 shrink-0" />}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-[#dfe1f6]">
        <span className="flex items-center gap-1.5 text-[#bbc9cf]">
          <Calendar className="h-3.5 w-3.5 text-[#bbc9cf]" />
          {formatDistanceToNow(new Date(file.updatedAt), { addSuffix: true })}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-[#bbc9cf]">{formatFileSize(file.size)}</td>
      <td className="px-4 py-3 text-right">
        <div className="hidden gap-1 justify-end group-hover:flex">
          <ActionBtn icon={Eye} onClick={onPreview} title="Preview" />
          <ActionBtn
            icon={Star}
            onClick={onStar}
            title={file.isStarred ? "Unstar" : "Star"}
            active={file.isStarred}
            activeClass="text-yellow-500"
          />
          <ActionBtn icon={Share2} onClick={onShare} title="Share" />
          <ActionBtn icon={Download} onClick={onDownload} title="Download" />
          <ActionBtn icon={Trash2} onClick={onTrash} title="Trash" />
        </div>
      </td>
    </tr>
  );
}

// ── Action button ─────────────────────────────────────────────────────────────

function ActionBtn({
  icon: Icon,
  onClick,
  title,
  active,
  activeClass,
}: {
  icon: React.ElementType;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  active?: boolean;
  activeClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1 hover:bg-[#1b1f2e] rounded-md opacity-0 group-hover:opacity-100 transition-opacity ${
        active && activeClass ? activeClass : "text-[#bbc9cf]"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
