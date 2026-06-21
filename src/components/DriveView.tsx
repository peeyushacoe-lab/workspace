"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  FileSpreadsheet,
  Presentation,
  FolderPlus,
  Info,
  ChevronUp,
  Move,
  History,
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
  if (
    mimeType.includes("word") ||
    mimeType.includes("document") ||
    mimeType === "text/plain"
  )
    return FileText;
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType === "text/csv")
    return FileSpreadsheet;
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint"))
    return Presentation;
  return File;
}

// Google-style type-coloured icon tint
function getMimeColor(mimeType: string): string {
  if (mimeType === "application/pdf") return "#ea4335"; // red
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType === "text/csv")
    return "#0f9d58"; // green
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint"))
    return "#f4b400"; // amber
  if (mimeType.startsWith("image/")) return "#a142f4"; // purple
  if (mimeType.startsWith("video/")) return "#ff6d00"; // orange
  if (mimeType.startsWith("audio/")) return "#1a73e8"; // blue
  if (
    mimeType.includes("word") ||
    mimeType.includes("document") ||
    mimeType === "text/plain"
  )
    return "#00C2FF"; // blue
  return "#8A92A6"; // grey
}

// Nexus file-type badge: short label + gradient (matches the dark design)
function getFileBadge(name: string, mimeType: string): { ext: string; badgeBg: string; thumbBg: string } {
  const dot = name.lastIndexOf(".");
  const raw = dot > -1 ? name.slice(dot + 1).toLowerCase() : "";
  const norm = (label: string, badgeBg: string, thumbBg: string) => ({ ext: label, badgeBg, thumbBg });

  if (raw === "fig" || raw === "figma")
    return norm("FIG", "linear-gradient(135deg,#F24E1E,#FF7262)", "linear-gradient(135deg,#1A1320,#22141C)");
  if (raw === "pdf" || mimeType === "application/pdf")
    return norm("PDF", "linear-gradient(135deg,#EF4444,#B91C1C)", "linear-gradient(135deg,#1C1518,#221518)");
  if (raw === "svg")
    return norm("SVG", "linear-gradient(135deg,#F59E0B,#D97706)", "linear-gradient(135deg,#1E1A13,#241F14)");
  if (raw === "md" || raw === "markdown")
    return norm("MD", "linear-gradient(135deg,#5A6275,#3A4150)", "linear-gradient(135deg,#15181F,#181C24)");
  if (mimeType.startsWith("video/") || ["mp4", "mov", "webm", "avi", "mkv"].includes(raw))
    return norm("MP4", "linear-gradient(135deg,#7C5CFF,#5B21B6)", "linear-gradient(135deg,#181423,#1C1530)");
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType === "text/csv" || ["xls", "xlsx", "csv"].includes(raw))
    return norm("XLS", "linear-gradient(135deg,#10B981,#059669)", "linear-gradient(135deg,#131E1A,#142420)");
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint") || ["ppt", "pptx"].includes(raw))
    return norm("PPT", "linear-gradient(135deg,#F4B400,#D97706)", "linear-gradient(135deg,#1E1A13,#241F14)");
  if (mimeType.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(raw))
    return norm("IMG", "linear-gradient(135deg,#A142F4,#6D28D9)", "linear-gradient(135deg,#1A1423,#1F1730)");
  if (mimeType.startsWith("audio/") || ["mp3", "wav", "flac"].includes(raw))
    return norm("AUD", "linear-gradient(135deg,#1a73e8,#1D4ED8)", "linear-gradient(135deg,#131820,#141C26)");
  if (mimeType.includes("word") || mimeType.includes("document") || mimeType === "text/plain" || ["doc", "docx", "txt"].includes(raw))
    return norm("DOC", "linear-gradient(135deg,#3B82F6,#1D4ED8)", "linear-gradient(135deg,#131820,#141C26)");
  return norm((raw || "FILE").slice(0, 3).toUpperCase(), "linear-gradient(135deg,#5A6275,#3A4150)", "linear-gradient(135deg,#15181F,#181C24)");
}

// Tinted folder icon palette (cycles by index, mirrors the design's per-folder tints)
const FOLDER_TINTS = [
  { iconBg: "rgba(0,194,255,0.14)", iconColor: "#00C2FF" },
  { iconBg: "rgba(124,92,255,0.14)", iconColor: "#9B7DFF" },
  { iconBg: "rgba(16,185,129,0.14)", iconColor: "#10B981" },
  { iconBg: "rgba(245,158,11,0.14)", iconColor: "#F59E0B" },
];

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
        className={`flex w-full items-center gap-1 rounded-r-full px-2 py-1.5 text-sm transition-colors ${
          currentFolderId === folder.id
            ? "bg-[#0E2532] text-[#00C2FF] font-medium"
            : "text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0]"
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#8A92A6]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#8A92A6]" />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 ">
      <div className="w-full max-w-md rounded-2xl bg-[#12151D] p-6 shadow-2xl border border-[#262A35]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#E6E9F0]">Share &ldquo;{fileName}&rdquo;</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-[#1B1F2A] transition-colors">
            <X className="h-4 w-4 text-[#8A92A6]" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-[#12151D] p-1 mb-5 border border-[#262A35]">
          {(["link", "email"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${
                tab === t ? "bg-[#1B1F2A] text-[#E6E9F0] shadow-sm" : "text-[#8A92A6] hover:text-[#E6E9F0]"
              }`}
            >
              {t === "link" ? "Create link" : "Share by email"}
            </button>
          ))}
        </div>

        {/* Role */}
        <div className="mb-4">
          <p className="text-xs font-medium text-[#8A92A6] mb-2">Permission</p>
          <div className="flex gap-2">
            {(["VIEWER", "EDITOR"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`flex-1 rounded-xl border py-2 text-sm font-medium transition-colors ${
                  role === r
                    ? "border-[#00C2FF] bg-[#0E2532] text-[#00C2FF]"
                    : "border-[#262A35] text-[#8A92A6] hover:border-[#00C2FF]/40"
                }`}
              >
                {r === "VIEWER" ? "View only" : "Can edit"}
              </button>
            ))}
          </div>
        </div>

        {/* Expiry */}
        <div className="mb-5">
          <p className="text-xs font-medium text-[#8A92A6] mb-2">Expiry</p>
          <div className="flex gap-2 flex-wrap">
            {(["never", "7", "30", "custom"] as const).map((e) => (
              <button
                key={e}
                onClick={() => setExpiry(e)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                  expiry === e
                    ? "border-[#00C2FF] bg-[#0E2532] text-[#00C2FF]"
                    : "border-[#262A35] text-[#8A92A6] hover:border-[#00C2FF]/40"
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
              className="mt-2 w-full rounded-xl border border-[#262A35] px-3 py-2 text-sm outline-none focus:border-[#00C2FF] focus:ring-2 focus:ring-[#00C2FF]/15 bg-[#12151D] text-[#E6E9F0]"
            />
          )}
        </div>

        {/* Tab content */}
        {tab === "link" ? (
          <div>
            {linkUrl ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-xl border border-[#262A35] bg-[#12151D] p-3">
                  <span className="flex-1 truncate text-sm text-[#E6E9F0]">{linkUrl}</span>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 rounded-lg p-1.5 hover:bg-[#1B1F2A] transition-colors"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4 text-[#8A92A6]" />
                    )}
                  </button>
                </div>
                {linkExpiry && (
                  <p className="text-xs text-[#8A92A6]">
                    Expires {formatDistanceToNow(new Date(linkExpiry), { addSuffix: true })}
                  </p>
                )}
                {!linkExpiry && expiry === "never" && (
                  <p className="text-xs text-[#8A92A6]">This link never expires.</p>
                )}
              </div>
            ) : (
              <button
                onClick={handleCreateLink}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00C2FF] py-2.5 text-sm font-medium text-[#06121A] hover:opacity-90 disabled:opacity-60 transition-colors"
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
              className="flex-1 rounded-xl border border-[#262A35] px-3 py-2 text-sm outline-none focus:border-[#00C2FF] focus:ring-2 focus:ring-[#00C2FF]/15 bg-[#12151D] text-[#E6E9F0]"
            />
            <button
              onClick={handleShareWithEmail}
              disabled={loading || !email.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-[#00C2FF] px-4 py-2 text-sm font-medium text-[#06121A] hover:opacity-90 disabled:opacity-60 transition-colors"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Move Modal ────────────────────────────────────────────────────────────────

function MoveModalDialog({
  name,
  folders,
  currentFolderId,
  onClose,
  onMove,
}: {
  name: string;
  folders: DriveFolder[];
  currentFolderId: string | null;
  onClose: () => void;
  onMove: (targetFolderId: string | null) => void;
}) {
  const [target, setTarget] = useState<string | null>(null);

  const renderTree = (list: DriveFolder[], depth: number): React.ReactNode =>
    list.map((f) => (
      <div key={f.id}>
        <button
          onClick={() => setTarget(f.id)}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
            target === f.id
              ? "bg-[#0E2532] text-[#00C2FF] font-medium"
              : "text-[#8A92A6] hover:bg-[#1B1F2A]"
          }`}
          style={{ paddingLeft: 8 + depth * 16 + "px" }}
        >
          <Folder className="h-4 w-4 shrink-0 text-yellow-500" />
          <span className="truncate">{f.name}</span>
        </button>
        {f.children && f.children.length > 0 && renderTree(f.children, depth + 1)}
      </div>
    ));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-2xl bg-[#12151D] p-6 shadow-2xl border border-[#262A35]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#E6E9F0]">Move &ldquo;{name}&rdquo;</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-[#1B1F2A] transition-colors">
            <X className="h-4 w-4 text-[#8A92A6]" />
          </button>
        </div>
        <div className="max-h-72 overflow-y-auto rounded-xl border border-[#262A35] p-1.5 mb-4">
          <button
            onClick={() => setTarget(null)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
              target === null
                ? "bg-[#0E2532] text-[#00C2FF] font-medium"
                : "text-[#8A92A6] hover:bg-[#1B1F2A]"
            }`}
          >
            <HardDrive className="h-4 w-4 shrink-0" />
            My Drive
          </button>
          {renderTree(folders, 0)}
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[#262A35] px-4 py-2 text-sm font-medium text-[#8A92A6] hover:bg-[#1B1F2A] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onMove(target)}
            disabled={target === currentFolderId}
            className="rounded-lg bg-[#00C2FF] px-4 py-2 text-sm font-semibold text-[#06121A] hover:bg-[#0098E6] disabled:opacity-50 transition-colors"
          >
            Move here
          </button>
        </div>
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
    <div className="bg-[#12151D] border-l border-[#262A35] w-80 flex flex-col shrink-0">
      <div className="px-4 py-3 border-b border-[#262A35] flex items-center justify-between font-semibold text-[#E6E9F0] text-sm">
        <span className="truncate">{file.name}</span>
        <button onClick={onClose} className="rounded-lg p-1 hover:bg-[#1B1F2A] transition-colors ml-2">
          <X className="h-4 w-4 text-[#8A92A6]" />
        </button>
      </div>
      <div className="flex border-b border-[#262A35]">
        <button
          onClick={() => setActiveTab("activity")}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "activity"
              ? "border-b-2 border-[#00C2FF] text-[#00C2FF]"
              : "text-[#8A92A6] hover:text-[#E6E9F0]"
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          Activity
        </button>
        <button
          onClick={() => { setActiveTab("intelligence"); void loadIntelligence(); }}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
            activeTab === "intelligence"
              ? "border-b-2 border-[#00C2FF] text-[#00C2FF]"
              : "text-[#8A92A6] hover:text-[#E6E9F0]"
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
                <Loader2 className="w-5 h-5 animate-spin text-[#00C2FF]" />
              </div>
            ) : intelligence ? (
              <>
                {intelligence.classification && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#7a8899]">Type</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-[#1B1F2A] text-[#8A92A6]">{intelligence.classification}</span>
                  </div>
                )}
                {intelligence.sensitivityLevel && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#7a8899]">Sensitivity</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${sensitivityColors[intelligence.sensitivityLevel] ?? "text-[#8A92A6] bg-[#1B1F2A]"}`}>
                      {intelligence.sensitivityLevel}
                    </span>
                  </div>
                )}
                {intelligence.summary && (
                  <div>
                    <p className="text-xs text-[#7a8899] mb-1 font-medium">AI Summary</p>
                    <p className="text-xs text-[#8A92A6] leading-relaxed">{intelligence.summary}</p>
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
  const router = useRouter();
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
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [moveModal, setMoveModal] = useState<{ id: string; name: string; isFolder: boolean } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<"all" | "folders" | "images" | "docs" | "pdf">("all");
  const [starredOnly, setStarredOnly] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);

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
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setShowNewMenu(false);
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false);
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
      if (!res.ok) {
        let errMsg = "Could not create folder";
        try {
          const d = await res.json() as { error?: string };
          if (d.error) errMsg = d.error;
        } catch { /* ignore */ }
        toast.error(errMsg);
        return;
      }
      toast.success("Folder created");
      setCreatingFolder(false);
      setNewFolderName("");
      fetchContent();
      fetchSidebarFolders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create folder");
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

  const handleMove = async (id: string, isFolder: boolean, targetFolderId: string | null) => {
    try {
      const endpoint = isFolder ? "/api/drive/folders/" + id : "/api/drive/files/" + id;
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isFolder ? { parentId: targetFolderId } : { folderId: targetFolderId }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Moved");
      setMoveModal(null);
      fetchContent();
      fetchSidebarFolders();
    } catch {
      toast.error("Could not move item");
    }
  };

  const handleFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files ?? []);
    for (const f of fileList) {
      handleUploadSingle(f);
    }
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  // Create native Nexus document/spreadsheet/presentation from Drive
  const createNativeFile = async (type: "doc" | "sheet" | "slide") => {
    setShowNewMenu(false);
    const apiMap = { doc: "/api/docs", sheet: "/api/sheets", slide: "/api/slides" };
    const titleMap = { doc: "Untitled Document", sheet: "Untitled Spreadsheet", slide: "Untitled Presentation" };
    const navMap = { doc: (id: string) => `/docs?open=${id}`, sheet: (id: string) => `/apps/sheets/${id}`, slide: (id: string) => `/apps/slides/${id}` };
    try {
      const res = await fetch(apiMap[type], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleMap[type] }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { id: string };
      router.push(navMap[type](data.id));
    } catch {
      toast.error(`Could not create ${titleMap[type]}`);
    }
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

  // Selection
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  // Clear selection when navigating / changing section
  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentFolderId, section]);

  // Bulk actions — wire to existing per-item handlers in a loop
  const bulkTrash = async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      const isFolder = folders.some((f) => f.id === id);
      await handleTrash(id, isFolder);
    }
    clearSelection();
  };
  const bulkStar = async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      const file = files.find((f) => f.id === id);
      if (file && !file.isStarred) await handleStar(file.id, file.isStarred);
    }
    clearSelection();
  };
  const bulkMove = async (targetFolderId: string | null) => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      const isFolder = folders.some((f) => f.id === id);
      await handleMove(id, isFolder, targetFolderId);
    }
    clearSelection();
  };

  // Drag-to-move: move a file into a folder
  const handleDropOnFolder = async (fileId: string, targetFolderId: string) => {
    setDragOverFolderId(null);
    if (fileId === targetFolderId) return;
    const isFolder = folders.some((f) => f.id === fileId);
    await handleMove(fileId, isFolder, targetFolderId);
  };

  // Sorting
  const sortFn = (a: DriveFile, b: DriveFile): number => {
    let cmp = 0;
    if (sortKey === "name") cmp = a.name.localeCompare(b.name);
    else if (sortKey === "size") cmp = a.size - b.size;
    else cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    return sortDir === "asc" ? cmp : -cmp;
  };

  const matchesTypeFilter = (file: DriveFile): boolean => {
    if (typeFilter === "all") return true;
    if (typeFilter === "folders") return false;
    if (typeFilter === "images") return file.mimeType.startsWith("image/");
    if (typeFilter === "pdf") return file.mimeType === "application/pdf";
    if (typeFilter === "docs")
      return (
        file.mimeType.includes("word") ||
        file.mimeType.includes("document") ||
        file.mimeType === "text/plain" ||
        file.mimeType.includes("sheet") ||
        file.mimeType.includes("excel") ||
        file.mimeType === "text/csv" ||
        file.mimeType.includes("presentation") ||
        file.mimeType.includes("powerpoint")
      );
    return true;
  };

  const showFolders = typeFilter === "all" || typeFilter === "folders";
  const filteredFolders = (showFolders && !starredOnly ? folders : [])
    .filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredFiles = files
    .filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(matchesTypeFilter)
    .filter((f) => (starredOnly ? f.isStarred : true))
    .sort(sortFn);

  const filtersActive = typeFilter !== "all" || starredOnly;

  const storagePercent = storage
    ? Math.min((storage.usedMB / (storage.totalMB || 15360)) * 100, 100)
    : 0;

  const activeFileForDetail = selectedItem ? files.find((f) => f.id === selectedItem) ?? null : null;

  return (
    <div
      className="flex h-full bg-[#12151D] relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-[#00C2FF]/5 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#00C2FF] bg-[#12151D] px-12 py-10 shadow-sm">
            <Upload className="h-10 w-10 text-[#00C2FF]" />
            <p className="text-base font-semibold text-[#E6E9F0]">Drop files here to upload</p>
            <p className="text-xs text-[#5A6275]">to {section === "my-drive" && breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].name : "My Drive"}</p>
          </div>
        </div>
      )}

      {/* Hidden upload inputs */}
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileInputChange} />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFolderInputChange}
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
      />

      {/* Left sidebar */}
      <aside className="bg-[#12151D] border-r border-[#262A35] w-60 flex-shrink-0 flex flex-col py-3">
        <div className="px-3 pb-2 relative" ref={newMenuRef}>
          <button
            onClick={() => setShowNewMenu((v) => !v)}
            className="flex items-center gap-3 rounded-2xl bg-[#12151D] border border-[#262A35] pl-4 pr-6 py-3 text-sm font-medium text-[#E6E9F0] shadow-sm hover:shadow transition-shadow"
          >
            <Plus className="h-5 w-5 text-[#00C2FF]" />
            New
          </button>
          {showNewMenu && (
            <div className="absolute left-3 top-full z-30 mt-1 w-56 rounded-lg border border-[#262A35] bg-[#12151D] py-1.5 shadow-lg">
              <NewMenuItem
                icon={FolderPlus}
                label="New folder"
                onClick={() => {
                  setCreatingFolder(true);
                  setNewFolderName("");
                  setShowNewMenu(false);
                }}
              />
              <div className="my-1 border-t border-[#262A35]" />
              <NewMenuItem icon={FileText} label="New document" onClick={() => createNativeFile("doc")} />
              <NewMenuItem icon={FileSpreadsheet} label="New spreadsheet" onClick={() => createNativeFile("sheet")} />
              <NewMenuItem icon={Presentation} label="New presentation" onClick={() => createNativeFile("slide")} />
              <div className="my-1 border-t border-[#262A35]" />
              <NewMenuItem
                icon={Upload}
                label="File upload"
                onClick={() => {
                  fileInputRef.current?.click();
                  setShowNewMenu(false);
                }}
              />
              <NewMenuItem
                icon={Folder}
                label="Folder upload"
                onClick={() => {
                  folderInputRef.current?.click();
                  setShowNewMenu(false);
                }}
              />
            </div>
          )}
        </div>

        <nav className="mt-2 pr-3 space-y-0.5">
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
                setSelectedItem(null);
                setDetailFile(null);
              }}
              className={`flex w-full items-center gap-3 rounded-r-full pl-6 pr-3 py-2 text-sm transition-colors ${
                section === key
                  ? "bg-[#0E2532] text-[#00C2FF] font-medium"
                  : "text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0]"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </button>
          ))}
        </nav>

        {section === "my-drive" && sidebarFolders.length > 0 && (
          <div className="mt-4 pr-2">
            <p className="text-xs font-medium text-[#5A6275] px-6 py-1.5">
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

        <div className="px-5 py-3 border-t border-[#262A35] mt-auto">
          {storage && (
            <div>
              <div className="flex items-center gap-2 mb-2 text-[#8A92A6]">
                <HardDrive className="h-4 w-4" />
                <span className="text-xs font-medium">Storage</span>
              </div>
              <div className="bg-[#262A35] rounded-full h-1.5">
                <div
                  className="bg-[#00C2FF] h-1.5 rounded-full transition-all"
                  style={{ width: storagePercent + "%" }}
                />
              </div>
              <p className="mt-2 text-xs text-[#5A6275]">
                {formatFileSize(storage.usedMB * 1024 * 1024)} of {(storage.totalMB / 1024).toFixed(0)} GB used
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col bg-[#12151D] min-w-0 overflow-hidden">
        {storage && !storage.configured && (
          <div className="flex items-center gap-2 bg-yellow-950/30 border-b border-yellow-700/30 px-6 py-2.5 text-sm text-yellow-400">
            <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
            File storage not configured. Set R2_ENDPOINT in .env
          </div>
        )}

        {/* Top search bar */}
        <div className="px-6 pt-4 pb-2 bg-[#12151D] flex items-center gap-3">
          <div className="relative flex-1 max-w-2xl">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A92A6]" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in Drive"
              className="w-full bg-[#1B1F2A] rounded-full pl-11 py-2.5 text-sm focus:bg-[#12151D] focus:ring-1 focus:ring-[#00C2FF]/40 focus:shadow-sm outline-none pr-4 text-[#E6E9F0] placeholder:text-[#8A92A6] transition-colors"
            />
          </div>

          {/* Filter dropdown */}
          <div className="relative" ref={filterMenuRef}>
            <button
              onClick={() => setShowFilterMenu((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                filtersActive
                  ? "border-[#00C2FF] bg-[#0E2532] text-[#00C2FF]"
                  : "border-[#262A35] text-[#8A92A6] hover:bg-[#1B1F2A]"
              }`}
            >
              <SortAsc className="h-4 w-4" />
              Filters
              {filtersActive && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[#00C2FF]" />}
            </button>
            {showFilterMenu && (
              <div className="absolute right-0 top-full mt-1 z-30 w-56 rounded-lg border border-[#262A35] bg-[#12151D] py-2 shadow-lg">
                <p className="px-4 pb-1 text-xs font-medium text-[#5A6275]">File type</p>
                {(
                  [
                    { key: "all", label: "All items" },
                    { key: "folders", label: "Folders" },
                    { key: "images", label: "Images" },
                    { key: "docs", label: "Documents" },
                    { key: "pdf", label: "PDFs" },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setTypeFilter(key)}
                    className={`flex w-full items-center justify-between px-4 py-1.5 text-sm transition-colors hover:bg-[#1B1F2A] ${
                      typeFilter === key ? "text-[#00C2FF] font-medium" : "text-[#8A92A6]"
                    }`}
                  >
                    {label}
                    {typeFilter === key && <Check className="h-4 w-4 text-[#00C2FF]" />}
                  </button>
                ))}
                <div className="my-1.5 border-t border-[#262A35]" />
                <button
                  onClick={() => setStarredOnly((v) => !v)}
                  className={`flex w-full items-center justify-between px-4 py-1.5 text-sm transition-colors hover:bg-[#1B1F2A] ${
                    starredOnly ? "text-[#00C2FF] font-medium" : "text-[#8A92A6]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Star className={`h-4 w-4 ${starredOnly ? "fill-yellow-400 text-yellow-400" : ""}`} />
                    Starred only
                  </span>
                  {starredOnly && <Check className="h-4 w-4 text-[#00C2FF]" />}
                </button>
                {filtersActive && (
                  <>
                    <div className="my-1.5 border-t border-[#262A35]" />
                    <button
                      onClick={() => { setTypeFilter("all"); setStarredOnly(false); }}
                      className="flex w-full items-center gap-2 px-4 py-1.5 text-sm text-[#8A92A6] hover:bg-[#1B1F2A] transition-colors"
                    >
                      <X className="h-4 w-4" />
                      Clear filters
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Active filter chips */}
        {filtersActive && (
          <div className="px-6 pb-1 flex items-center gap-2 flex-wrap">
            {typeFilter !== "all" && (
              <span className="flex items-center gap-1.5 rounded-full bg-[#0E2532] px-3 py-1 text-xs font-medium text-[#00C2FF]">
                {typeFilter === "folders" ? "Folders"
                  : typeFilter === "images" ? "Images"
                  : typeFilter === "docs" ? "Documents"
                  : "PDFs"}
                <button onClick={() => setTypeFilter("all")} className="hover:text-[#0098E6]">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {starredOnly && (
              <span className="flex items-center gap-1.5 rounded-full bg-[#0E2532] px-3 py-1 text-xs font-medium text-[#00C2FF]">
                Starred
                <button onClick={() => setStarredOnly(false)} className="hover:text-[#0098E6]">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
        )}

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="mx-6 mt-1 mb-1 flex items-center gap-2 rounded-xl border border-[#00C2FF]/30 bg-[#0E2532] px-4 py-2">
            <span className="text-sm font-medium text-[#00C2FF]">{selectedIds.size} selected</span>
            <div className="flex-1" />
            <button
              onClick={bulkStar}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-[#00C2FF] hover:bg-[#12151D]/60 transition-colors"
            >
              <Star className="h-4 w-4" /> Star all
            </button>
            <button
              onClick={() => { setMoveModal({ id: "__bulk__", name: selectedIds.size + " items", isFolder: false }); }}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-[#00C2FF] hover:bg-[#12151D]/60 transition-colors"
            >
              <Move className="h-4 w-4" /> Move all
            </button>
            <button
              onClick={bulkTrash}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-[#ea4335] hover:bg-[#12151D]/60 transition-colors"
            >
              <Trash2 className="h-4 w-4" /> Trash all
            </button>
            <button
              onClick={clearSelection}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-[#8A92A6] hover:bg-[#12151D]/60 transition-colors"
            >
              <X className="h-4 w-4" /> Clear
            </button>
          </div>
        )}

        {/* Toolbar: breadcrumb + controls */}
        <div className="h-14 shrink-0 px-6 bg-[#12151D] flex items-center gap-3 border-b border-[#262A35]/60">
          <nav className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
            <button
              onClick={() => navigateToBreadcrumb(-1)}
              className={`rounded-lg px-2 py-1 text-lg text-[#E6E9F0] hover:bg-[#1B1F2A] transition-colors font-normal whitespace-nowrap ${
                breadcrumb.length === 0 ? "font-medium" : ""
              }`}
            >
              {section === "my-drive" ? "My Drive"
                : section === "shared" ? "Shared with me"
                : section === "recent" ? "Recent"
                : section === "starred" ? "Starred"
                : "Trash"}
            </button>
            {breadcrumb.map((crumb, idx) => (
              <span key={crumb.id} className="flex items-center gap-1 min-w-0">
                <ChevronRight className="h-4 w-4 text-[#5A6275] shrink-0" />
                <button
                  onClick={() => navigateToBreadcrumb(idx)}
                  className={`rounded-lg px-2 py-1 text-lg text-[#E6E9F0] hover:bg-[#1B1F2A] transition-colors truncate ${
                    idx === breadcrumb.length - 1 ? "font-medium" : "font-normal"
                  }`}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>

          {/* Sort */}
          <div className="relative" ref={sortMenuRef}>
            <button
              onClick={() => setShowSortMenu((v) => !v)}
              title="Sort"
              className="text-[#8A92A6] hover:bg-[#1B1F2A] rounded-full p-2 flex items-center gap-2 transition-colors"
            >
              <SortAsc className="h-[18px] w-[18px]" />
            </button>
            {showSortMenu && (
              <div className="absolute right-0 top-full mt-1 z-30 bg-[#12151D] border border-[#262A35] rounded-lg shadow-lg py-1 min-w-[180px]">
                {(
                  [
                    { key: "name", label: "Name" },
                    { key: "size", label: "Size" },
                    { key: "updatedAt", label: "Last modified" },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                      else { setSortKey(key); setSortDir("asc"); }
                      setShowSortMenu(false);
                    }}
                    className={`px-4 py-2 text-sm text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] flex items-center gap-2 cursor-pointer w-full justify-between ${
                      sortKey === key ? "text-[#00C2FF] font-medium" : ""
                    }`}
                  >
                    {label}
                    {sortKey === key && (
                      sortDir === "asc"
                        ? <ChevronUp className="h-4 w-4 text-[#00C2FF]" />
                        : <ChevronDown className="h-4 w-4 text-[#00C2FF]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* View toggle */}
          <div className="flex items-center rounded-full border border-[#262A35] p-0.5">
            <button
              onClick={() => setView("list")}
              title="List view"
              className={`rounded-full p-1.5 transition-colors ${
                view === "list" ? "bg-[#0E2532] text-[#00C2FF]" : "text-[#8A92A6] hover:bg-[#1B1F2A]"
              }`}
            >
              <List className="h-[18px] w-[18px]" />
            </button>
            <button
              onClick={() => setView("grid")}
              title="Grid view"
              className={`rounded-full p-1.5 transition-colors ${
                view === "grid" ? "bg-[#0E2532] text-[#00C2FF]" : "text-[#8A92A6] hover:bg-[#1B1F2A]"
              }`}
            >
              <Grid3x3 className="h-[18px] w-[18px]" />
            </button>
          </div>

          {/* Details toggle */}
          <button
            onClick={() => {
              if (detailFile) { setDetailFile(null); setSelectedItem(null); }
              else if (activeFileForDetail) setDetailFile(activeFileForDetail);
            }}
            title="View details"
            className={`rounded-full p-2 transition-colors ${
              detailFile ? "bg-[#0E2532] text-[#00C2FF]" : "text-[#8A92A6] hover:bg-[#1B1F2A]"
            }`}
          >
            <Info className="h-[18px] w-[18px]" />
          </button>

          {/* Upload primary */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex h-[34px] items-center gap-2 rounded-lg bg-[#00C2FF] px-4 text-[12.5px] font-semibold text-[#06121A] hover:bg-[#0098E6] transition-colors"
          >
            <Upload className="h-[15px] w-[15px]" strokeWidth={2.6} />
            Upload
          </button>
        </div>

        {/* Upload progress bar area */}
        {uploadTasks.length > 0 && (
          <div className="border-b border-[#262A35] bg-[#12151D] px-6 py-2 space-y-1.5">
            {uploadTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3">
                <span className="text-xs text-[#8A92A6] truncate flex-1 max-w-xs">{task.name}</span>
                {task.error ? (
                  <span className="text-xs text-red-400">{task.error}</span>
                ) : task.done ? (
                  <span className="text-xs text-green-400 flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> Done
                  </span>
                ) : (
                  <div className="flex items-center gap-2 flex-1 max-w-xs">
                    <div className="bg-[#1B1F2A] rounded-full h-1.5 flex-1">
                      <div
                        className="bg-[#00C2FF] text-[#06121A] h-1.5 rounded-full transition-all"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-[#8A92A6] w-8 text-right">{task.progress}%</span>
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
                  className="rounded-lg border border-[#00C2FF] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#00C2FF]/15 w-48 bg-[#12151D] text-[#E6E9F0]"
                />
                <button
                  onClick={handleCreateFolder}
                  className="bg-[#00C2FF] text-[#06121A] hover:opacity-90 rounded-md px-3 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setCreatingFolder(false);
                    setNewFolderName("");
                  }}
                  className="bg-[#12151D] text-[#8A92A6] hover:bg-[#12151D] border border-[#262A35] rounded-md px-3 py-2 text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}

            {loadingContent ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#00C2FF]" />
              </div>
            ) : filteredFolders.length === 0 && filteredFiles.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-[#8A92A6]">
                <HardDrive className="h-12 w-12 text-[#262b3a]" />
                <p className="text-sm">
                  {searchQuery ? "No results found" : "This folder is empty"}
                </p>
                {!searchQuery && (
                  <p className="text-xs text-[#262b3a]">
                    Drag & drop files here to upload
                  </p>
                )}
              </div>
            ) : view === "grid" ? (
              <>
                {filteredFolders.length > 0 && (
                  <>
                    <p className="mb-3.5 text-xs font-medium text-[#5A6275]">Folders</p>
                    <div
                      className="mb-7 grid gap-3.5"
                      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}
                    >
                      {filteredFolders.map((folder, idx) => (
                        <GridFolderCard
                          key={folder.id}
                          folder={folder}
                          tintIndex={idx}
                          selected={selectedItem === folder.id}
                          checked={selectedIds.has(folder.id)}
                          onToggleCheck={() => toggleSelect(folder.id)}
                          dragOver={dragOverFolderId === folder.id}
                          onDragEnterFolder={() => setDragOverFolderId(folder.id)}
                          onDragLeaveFolder={() => setDragOverFolderId((cur) => (cur === folder.id ? null : cur))}
                          onDropItem={(itemId) => handleDropOnFolder(itemId, folder.id)}
                          onMoveStart={() => setMoveModal({ id: folder.id, name: folder.name, isFolder: true })}
                          renamingId={renamingId}
                          renameValue={renameValue}
                          onSetRenameValue={setRenameValue}
                          onSelect={() => setSelectedItem(folder.id)}
                          onOpen={() => navigateToFolder(folder)}
                          _onRenameStart={() => {
                            setRenamingId(folder.id);
                            setRenameValue(folder.name);
                          }}
                          onRenameSubmit={() => handleRename(folder.id, true)}
                          onRenameCancel={() => setRenamingId(null)}
                          onTrash={() => handleTrash(folder.id, true)}
                          onContextMenu={(e) => handleContextMenu(e, { folderId: folder.id, isFolder: true })}
                        />
                      ))}
                    </div>
                  </>
                )}
                {filteredFiles.length > 0 && (
                  <>
                    <p className="mb-3.5 text-xs font-medium text-[#5A6275]">Files</p>
                    <div
                      className="grid gap-4"
                      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
                    >
                      {filteredFiles.map((file) => (
                        <GridFileCard
                          key={file.id}
                          file={file}
                          selected={selectedItem === file.id}
                          checked={selectedIds.has(file.id)}
                          onToggleCheck={() => toggleSelect(file.id)}
                          onMoveStart={() => setMoveModal({ id: file.id, name: file.name, isFolder: false })}
                          renamingId={renamingId}
                          renameValue={renameValue}
                          onSetRenameValue={setRenameValue}
                          onSelect={() => {
                            setSelectedItem(file.id);
                            setDetailFile(file);
                          }}
                          onPreview={() => handlePreview(file)}
                          _onRenameStart={() => {
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
                  </>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-[#262A35] bg-[#12151D] overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#12151D] border-b border-[#262A35]">
                      <th
                        className="text-xs font-semibold text-[#8A92A6] px-4 py-3 text-left cursor-pointer hover:text-[#E6E9F0] select-none"
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
                        className="text-xs font-semibold text-[#8A92A6] px-4 py-3 text-left cursor-pointer hover:text-[#E6E9F0] select-none"
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
                        className="text-xs font-semibold text-[#8A92A6] px-4 py-3 text-left cursor-pointer hover:text-[#E6E9F0] select-none"
                        onClick={() => {
                          if (sortKey === "size") setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                          else { setSortKey("size"); setSortDir("asc"); }
                        }}
                      >
                        <span className="flex items-center gap-1">
                          Size {sortKey === "size" && <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>}
                        </span>
                      </th>
                      <th className="text-xs font-semibold text-[#8A92A6] px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFolders.map((folder) => (
                      <ListFolderRow
                        key={folder.id}
                        folder={folder}
                        checked={selectedIds.has(folder.id)}
                        onToggleCheck={() => toggleSelect(folder.id)}
                        dragOver={dragOverFolderId === folder.id}
                        onDragEnterFolder={() => setDragOverFolderId(folder.id)}
                        onDragLeaveFolder={() => setDragOverFolderId((cur) => (cur === folder.id ? null : cur))}
                        onDropItem={(itemId) => handleDropOnFolder(itemId, folder.id)}
                        onMoveStart={() => setMoveModal({ id: folder.id, name: folder.name, isFolder: true })}
                        renamingId={renamingId}
                        renameValue={renameValue}
                        onSetRenameValue={setRenameValue}
                        onOpen={() => navigateToFolder(folder)}
                        _onRenameStart={() => {
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
                        checked={selectedIds.has(file.id)}
                        onToggleCheck={() => toggleSelect(file.id)}
                        onMoveStart={() => setMoveModal({ id: file.id, name: file.name, isFolder: false })}
                        renamingId={renamingId}
                        renameValue={renameValue}
                        onSetRenameValue={setRenameValue}
                        onSelect={() => {
                          setSelectedItem(file.id);
                          setDetailFile(file);
                        }}
                        onPreview={() => handlePreview(file)}
                        _onRenameStart={() => {
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
          className="fixed z-50 bg-[#12151D] border border-[#262A35] rounded-lg shadow-lg py-1 min-w-[160px] text-sm"
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
                <div className="my-1 border-t border-[#262A35]" />
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
                <div className="my-1 border-t border-[#262A35]" />
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
                <div className="my-1 border-t border-[#262A35]" />
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

      {/* Move modal */}
      {moveModal && (
        <MoveModalDialog
          name={moveModal.name}
          folders={sidebarFolders}
          currentFolderId={currentFolderId}
          onClose={() => setMoveModal(null)}
          onMove={(targetId) => {
            if (moveModal.id === "__bulk__") {
              void bulkMove(targetId);
            } else {
              void handleMove(moveModal.id, moveModal.isFolder, targetId);
            }
            setMoveModal(null);
          }}
        />
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
      className={`px-4 py-2 text-sm flex items-center gap-2 cursor-pointer w-full hover:bg-[#1B1F2A] hover:text-[#E6E9F0] transition-colors ${
        danger ? "text-red-400" : "text-[#8A92A6]"
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
  tintIndex,
  selected,
  checked,
  onToggleCheck,
  dragOver,
  onDragEnterFolder,
  onDragLeaveFolder,
  onDropItem,
  onMoveStart,
  renamingId,
  renameValue,
  onSetRenameValue,
  onSelect,
  onOpen,
  _onRenameStart,
  onRenameSubmit,
  onRenameCancel,
  onTrash,
  onContextMenu,
}: {
  folder: DriveFolder;
  tintIndex: number;
  selected: boolean;
  checked: boolean;
  onToggleCheck: () => void;
  dragOver: boolean;
  onDragEnterFolder: () => void;
  onDragLeaveFolder: () => void;
  onDropItem: (itemId: string) => void;
  onMoveStart: () => void;
  renamingId: string | null;
  renameValue: string;
  onSetRenameValue: (v: string) => void;
  onSelect: () => void;
  onOpen: () => void;
  _onRenameStart: () => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onTrash: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const tint = FOLDER_TINTS[tintIndex % FOLDER_TINTS.length];
  return (
    <div
      className={`group relative flex cursor-pointer items-center gap-3 rounded-[11px] border p-3.5 transition-all ${
        dragOver
          ? "border-[#00C2FF] bg-[#0E2532] ring-2 ring-[#00C2FF]/30"
          : selected || checked
          ? "border-[#00C2FF] bg-[#00C2FF]/10"
          : "bg-[#12151D] border-[#262A35] hover:border-[#00C2FF]/40"
      }`}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onContextMenu={onContextMenu}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
      onDragEnter={(e) => { e.preventDefault(); onDragEnterFolder(); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onDragLeaveFolder(); }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData("application/x-drive-item");
        if (id) { e.preventDefault(); e.stopPropagation(); onDropItem(id); }
      }}
    >
      <CardCheckbox checked={checked} onToggle={onToggleCheck} />
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[9px]"
        style={{ background: tint.iconBg }}
      >
        <Folder className="h-5 w-5" style={{ color: tint.iconColor }} />
      </div>
      <div className="min-w-0 flex-1">
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
            className="w-full rounded-lg border border-[#00C2FF] px-2 py-1 text-xs outline-none bg-[#12151D] text-[#E6E9F0]"
          />
        ) : (
          <>
            <p className="truncate text-[13.5px] font-semibold text-[#E6E9F0]">{folder.name}</p>
            <p className="text-[11.5px] text-[#5A6275]">
              {folder.children?.length ? `${folder.children.length} items` : "Folder"}
            </p>
          </>
        )}
      </div>
      <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
        <ActionBtn icon={Move} onClick={(e) => { e.stopPropagation(); onMoveStart(); }} title="Move" />
        <ActionBtn icon={Edit3} onClick={(e) => { e.stopPropagation(); _onRenameStart(); }} title="Rename" />
        <ActionBtn icon={Trash2} onClick={(e) => { e.stopPropagation(); onTrash(); }} title="Trash" />
        <ActionBtn icon={MoreVertical} onClick={(e) => { e.stopPropagation(); onContextMenu(e); }} title="More" />
      </div>
    </div>
  );
}

function GridFileCard({
  file,
  selected,
  checked,
  onToggleCheck,
  onMoveStart,
  renamingId,
  renameValue,
  onSetRenameValue,
  onSelect,
  onPreview,
  _onRenameStart,
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
  checked: boolean;
  onToggleCheck: () => void;
  onMoveStart: () => void;
  renamingId: string | null;
  renameValue: string;
  onSetRenameValue: (v: string) => void;
  onSelect: () => void;
  onPreview: () => void;
  _onRenameStart: () => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onTrash: () => void;
  onStar: () => void;
  onShare: () => void;
  onDownload: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const badge = getFileBadge(file.name, file.mimeType);
  const isImage = file.mimeType.startsWith("image/") && !!file.storageUrl;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-drive-item", file.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`group relative cursor-pointer overflow-hidden rounded-xl border transition-all ${
        selected || checked
          ? "border-[#00C2FF] bg-[#00C2FF]/[0.06]"
          : "bg-[#12151D] border-[#262A35] hover:border-[#00C2FF]/40"
      }`}
      onClick={onSelect}
      onDoubleClick={onPreview}
      onContextMenu={onContextMenu}
    >
      <CardCheckbox checked={checked} onToggle={onToggleCheck} />
      {/* Thumbnail area */}
      <div
        className="relative flex h-[116px] items-center justify-center"
        style={{ background: badge.thumbBg }}
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/drive/files/${file.id}/download`}
            alt={file.name}
            className="h-full w-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div
            className="flex h-14 w-[46px] items-center justify-center rounded-md"
            style={{ background: badge.badgeBg, boxShadow: "0 6px 16px -4px rgba(0,0,0,0.4)" }}
          >
            <span className="font-mono text-[11px] font-extrabold text-white">{badge.ext}</span>
          </div>
        )}
        {file.isStarred && (
          <Star className="absolute right-2.5 top-2.5 h-[15px] w-[15px] fill-[#FFB020] text-[#FFB020]" />
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
            activeClass="text-[#FFB020]"
          />
          <ActionBtn icon={Share2} onClick={(e) => { e.stopPropagation(); onShare(); }} title="Share" />
          <ActionBtn icon={Move} onClick={(e) => { e.stopPropagation(); onMoveStart(); }} title="Move" />
          <ActionBtn icon={Download} onClick={(e) => { e.stopPropagation(); onDownload(); }} title="Download" />
          <ActionBtn icon={Trash2} onClick={(e) => { e.stopPropagation(); onTrash(); }} title="Trash" />
        </div>
      </div>
      {/* Meta */}
      <div className="px-3 py-3">
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
            className="w-full rounded-lg border border-[#00C2FF] px-2 py-1 text-xs outline-none bg-[#12151D] text-[#E6E9F0]"
          />
        ) : (
          <p className="mb-1 truncate text-[13px] font-semibold text-[#E6E9F0]">{file.name}</p>
        )}
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#5A6275]">
          <span>{formatFileSize(file.size)}</span>
          <span className="h-[3px] w-[3px] rounded-full bg-[#444C5E]" />
          <span className="truncate">{formatDistanceToNow(new Date(file.updatedAt), { addSuffix: true })}</span>
        </div>
      </div>
    </div>
  );
}

// ── List rows ─────────────────────────────────────────────────────────────────

function ListFolderRow({
  folder,
  checked,
  onToggleCheck,
  dragOver,
  onDragEnterFolder,
  onDragLeaveFolder,
  onDropItem,
  onMoveStart,
  renamingId,
  renameValue,
  onSetRenameValue,
  onOpen,
  _onRenameStart,
  onRenameSubmit,
  onRenameCancel,
  onTrash,
  onContextMenu,
}: {
  folder: DriveFolder;
  checked: boolean;
  onToggleCheck: () => void;
  dragOver: boolean;
  onDragEnterFolder: () => void;
  onDragLeaveFolder: () => void;
  onDropItem: (itemId: string) => void;
  onMoveStart: () => void;
  renamingId: string | null;
  renameValue: string;
  onSetRenameValue: (v: string) => void;
  onOpen: () => void;
  _onRenameStart: () => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onTrash: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <tr
      className={`border-b border-[#262A35] transition-colors group cursor-pointer ${
        dragOver ? "bg-[#0E2532]" : checked ? "bg-[#00C2FF]/10" : "hover:bg-[#12151D]"
      }`}
      onContextMenu={onContextMenu}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
      onDragEnter={(e) => { e.preventDefault(); onDragEnterFolder(); }}
      onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) onDragLeaveFolder(); }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData("application/x-drive-item");
        if (id) { e.preventDefault(); e.stopPropagation(); onDropItem(id); }
      }}
    >
      <td className="px-4 py-3 text-sm text-[#E6E9F0]">
        <div className="flex items-center gap-2.5 cursor-pointer" onDoubleClick={onOpen}>
          <RowCheckbox checked={checked} onToggle={onToggleCheck} />
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
              className="rounded border border-[#00C2FF] px-2 py-0.5 text-sm outline-none bg-[#12151D] text-[#E6E9F0]"
            />
          ) : (
            <span className="text-sm font-medium text-[#E6E9F0]">{folder.name}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-[#E6E9F0]">
        <span className="flex items-center gap-1.5 text-[#8A92A6]">
          <Calendar className="h-3.5 w-3.5 text-[#8A92A6]" />
          {formatDistanceToNow(new Date(folder.createdAt), { addSuffix: true })}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-[#8A92A6]">—</td>
      <td className="px-4 py-3 text-right">
        <div className="hidden gap-1 justify-end group-hover:flex">
          <ActionBtn icon={Move} onClick={onMoveStart} title="Move" />
          <ActionBtn icon={Edit3} onClick={_onRenameStart} title="Rename" />
          <ActionBtn icon={Trash2} onClick={onTrash} title="Trash" />
        </div>
      </td>
    </tr>
  );
}

function ListFileRow({
  file,
  checked,
  onToggleCheck,
  onMoveStart,
  renamingId,
  renameValue,
  onSetRenameValue,
  onSelect,
  onPreview,
  _onRenameStart,
  onRenameSubmit,
  onRenameCancel,
  onTrash,
  onStar,
  onShare,
  onDownload,
  onContextMenu,
}: {
  file: DriveFile;
  checked: boolean;
  onToggleCheck: () => void;
  onMoveStart: () => void;
  renamingId: string | null;
  renameValue: string;
  onSetRenameValue: (v: string) => void;
  onSelect: () => void;
  onPreview: () => void;
  _onRenameStart: () => void;
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
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-drive-item", file.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`border-b border-[#262A35] transition-colors group cursor-pointer ${
        checked ? "bg-[#00C2FF]/10" : "hover:bg-[#12151D]"
      }`}
      onContextMenu={onContextMenu}
      onClick={onSelect}
    >
      <td className="px-4 py-3 text-sm text-[#E6E9F0]">
        <div className="flex items-center gap-2.5 cursor-pointer" onDoubleClick={onPreview}>
          <RowCheckbox checked={checked} onToggle={onToggleCheck} />
          <Icon className="h-5 w-5 text-[#00C2FF] shrink-0" />
          {renamingId === file.id ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => onSetRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRenameSubmit();
                if (e.key === "Escape") onRenameCancel();
              }}
              className="rounded border border-[#00C2FF] px-2 py-0.5 text-sm outline-none bg-[#12151D] text-[#E6E9F0]"
            />
          ) : (
            <span className="text-sm font-medium text-[#E6E9F0]">{file.name}</span>
          )}
          {file.isStarred && <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400 shrink-0" />}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-[#E6E9F0]">
        <span className="flex items-center gap-1.5 text-[#8A92A6]">
          <Calendar className="h-3.5 w-3.5 text-[#8A92A6]" />
          {formatDistanceToNow(new Date(file.updatedAt), { addSuffix: true })}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-[#8A92A6]">{formatFileSize(file.size)}</td>
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
          <ActionBtn icon={Move} onClick={onMoveStart} title="Move" />
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
      className={`p-1 hover:bg-[#12151D] rounded-md opacity-0 group-hover:opacity-100 transition-opacity ${
        active && activeClass ? activeClass : "text-[#8A92A6]"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

// ── Selection checkboxes ──────────────────────────────────────────────────────

function CardCheckbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={checked ? "Deselect" : "Select"}
      className={`absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border transition-all ${
        checked
          ? "border-[#00C2FF] bg-[#00C2FF] text-[#06121A] opacity-100"
          : "border-[#2E333F] bg-[#12151D] text-transparent opacity-0 group-hover:opacity-100"
      }`}
    >
      <Check className="h-3.5 w-3.5" />
    </button>
  );
}

function RowCheckbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={checked ? "Deselect" : "Select"}
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all ${
        checked
          ? "border-[#00C2FF] bg-[#00C2FF] text-[#06121A] opacity-100"
          : "border-[#2E333F] bg-[#12151D] text-transparent opacity-0 group-hover:opacity-100"
      }`}
    >
      <Check className="h-3 w-3" />
    </button>
  );
}

function NewMenuItem({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2 text-sm text-[#E6E9F0] hover:bg-[#1B1F2A] transition-colors"
    >
      <Icon className="h-4 w-4 text-[#8A92A6]" />
      {label}
    </button>
  );
}
