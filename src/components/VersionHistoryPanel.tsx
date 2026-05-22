"use client";

import { useCallback, useEffect, useState } from "react";
import {
  X,
  RotateCcw,
  Loader2,
  History,
  CheckCircle2,
  Clock,
  Download,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type FileVersion = {
  id: string;
  versionNum: number;
  storageKey: string;
  size: string;
  uploadedBy: string;
  uploaderName: string;
  createdAt: string;
  isCurrent: boolean;
};

type Props = {
  fileId: string;
  fileName: string;
  onClose: () => void;
  onRestored: () => void;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VersionHistoryPanel({ fileId, fileName, onClose, onRestored }: Props) {
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/drive/files/${fileId}/versions`);
      if (!res.ok) throw new Error("Failed to load versions");
      const data = await res.json() as FileVersion[];
      setVersions(data);
    } catch {
      toast.error("Could not load version history");
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const handleRestore = async (versionId: string, versionNum: number) => {
    setRestoringId(versionId);
    try {
      const res = await fetch(
        `/api/drive/files/${fileId}/versions/${versionId}/restore`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Restore failed");
      toast.success(`Restored to version ${versionNum}`);
      await fetchVersions();
      onRestored();
    } catch {
      toast.error("Could not restore version");
    } finally {
      setRestoringId(null);
    }
  };

  const handleDownloadVersion = async (versionId: string, versionNum: number) => {
    setDownloadingId(versionId);
    try {
      const res = await fetch(
        `/api/drive/files/${fileId}/versions/${versionId}/restore`,
        { method: "GET" }
      );
      if (!res.ok) throw new Error("Could not get download URL");
      const data = await res.json() as { downloadUrl?: string };
      if (!data.downloadUrl) throw new Error("No download URL");
      const a = document.createElement("a");
      a.href = data.downloadUrl;
      a.download = `${fileName} (v${versionNum})`;
      a.click();
    } catch {
      toast.error("Could not download version");
    } finally {
      setDownloadingId(null);
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-[#1b1f2e] border border-[rgba(0,255,255,0.08)] shadow-2xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[rgba(0,255,255,0.08)] flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <History className="h-5 w-5 text-[#00d2ff] shrink-0" />
            <div className="min-w-0">
              <h2 className="font-semibold text-[#dfe1f6] text-sm">Version History</h2>
              <p className="truncate text-xs text-[#bbc9cf] mt-0.5">{fileName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#bbc9cf] hover:bg-[#262939] hover:text-[#dfe1f6] rounded-md transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Version list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-[#00d2ff]" />
            </div>
          ) : versions.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-[#bbc9cf]">
              <History className="h-10 w-10 text-[#e2e8f0]" />
              <p className="text-sm">No version history yet</p>
            </div>
          ) : (
            <div>
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="border-b border-[rgba(0,255,255,0.08)] px-4 py-3 flex items-center justify-between hover:bg-[#262939]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#dfe1f6]">
                        Version {v.versionNum}
                      </span>
                      {v.isCurrent && (
                        <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 font-medium flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Current
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[#bbc9cf] truncate">
                      by {v.uploaderName}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-[#bbc9cf]">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span>
                        {formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}
                      </span>
                      <span>·</span>
                      <span>{formatFileSize(Number(v.size))}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0 ml-3">
                    <button
                      disabled={downloadingId === v.id}
                      onClick={() => handleDownloadVersion(v.id, v.versionNum)}
                      title="Download this version"
                      className="text-xs text-[#00d2ff] hover:text-[#00b8d9] font-medium border border-[#00d2ff]/30 bg-[#00d2ff]/10 rounded px-2 py-0.5 flex items-center gap-1 disabled:opacity-50 transition-colors"
                    >
                      {downloadingId === v.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      Download
                    </button>
                    {!v.isCurrent && (
                      <button
                        disabled={restoringId === v.id}
                        onClick={() => handleRestore(v.id, v.versionNum)}
                        className="text-xs text-[#00d2ff] hover:text-[#00b8d9] font-medium border border-[#00d2ff]/30 bg-[#00d2ff]/10 rounded px-2 py-0.5 flex items-center gap-1 disabled:opacity-50 transition-colors"
                      >
                        {restoringId === v.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[rgba(0,255,255,0.08)] px-4 py-3">
          <p className="text-xs text-[#bbc9cf] text-center">
            {versions.length} version{versions.length !== 1 ? "s" : ""} stored
          </p>
        </div>
      </div>
    </>
  );
}
