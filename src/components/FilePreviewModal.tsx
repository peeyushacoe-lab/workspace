"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Download,
  Trash2,
  History,
  FileText,
  File,
  Loader2,
  AlertCircle,
  Share2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
    } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  isStarred: boolean;
  isTrashed: boolean;
  storageUrl: string;
  folderId: string | null;
};

type Props = {
  file: DriveFile;
  isOwner: boolean;
  onClose: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onShowVersions: () => void;
  onShare?: () => void;
  allFiles?: DriveFile[];
  onNavigate?: (file: DriveFile) => void;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getPreviewType(mimeType: string, name: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";

  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mimeType === "text/csv" || ext === "csv") return "csv";

  const textExts = ["txt", "md", "js", "ts", "jsx", "tsx", "json", "html", "css", "xml", "yaml", "yml", "sh", "py", "rb", "go", "rs"];
  if (mimeType.startsWith("text/") || textExts.includes(ext)) return "text";

  return "unsupported";
}

function parseCsv(raw: string): string[][] {
  return raw
    .trim()
    .split("\n")
    .map((line) => line.split(",").map((cell) => cell.replace(/^"|"$/g, "").trim()));
}

type ImageState = {
  scale: number;
  panX: number;
  panY: number;
  rotation: number;
  isDragging: boolean;
  dragStartX: number;
  dragStartY: number;
  startPanX: number;
  startPanY: number;
};

export function FilePreviewModal({
  file,
  isOwner,
  onClose,
  onDownload,
  onDelete,
  onShowVersions,
  onShare,
  allFiles,
  onNavigate,
}: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [csvData, setCsvData] = useState<string[][] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imgState, setImgState] = useState<ImageState>({
    scale: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    startPanX: 0,
    startPanY: 0,
  });
  const imgContainerRef = useRef<HTMLDivElement>(null);

  // AI summary state
  const [_aiSummary, setAiSummary] = useState<string | null>(null);
  const [_aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [_aiSummaryError, setAiSummaryError] = useState<string | null>(null);
  const [_showSummaryPanel, setShowSummaryPanel] = useState(false);

  const previewType = getPreviewType(file.mimeType, file.name);

  // Find index in allFiles
  const currentIndex = allFiles ? allFiles.findIndex((f) => f.id === file.id) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = allFiles ? currentIndex < allFiles.length - 1 : false;

  const goNext = useCallback(() => {
    if (allFiles && hasNext && onNavigate) onNavigate(allFiles[currentIndex + 1]);
  }, [allFiles, hasNext, currentIndex, onNavigate]);

  const goPrev = useCallback(() => {
    if (allFiles && hasPrev && onNavigate) onNavigate(allFiles[currentIndex - 1]);
  }, [allFiles, hasPrev, currentIndex, onNavigate]);

  // Reset AI summary when file changes
  useEffect(() => {
    setAiSummary(null);
    setAiSummaryError(null);
    setAiSummaryLoading(false);
    setShowSummaryPanel(false);
  }, [file.id]);

  const _handleSummarize = async () => {
    if (!textContent) return;
    setAiSummaryLoading(true);
    setAiSummaryError(null);
    setShowSummaryPanel(true);
    try {
      const res = await fetch("/api/ai/drive-summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: textContent.slice(0, 3000),
          filename: file.name,
        }),
      });
      const data = (await res.json()) as { summary?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Summary failed");
      setAiSummary(data.summary ?? "");
    } catch (err) {
      setAiSummaryError(err instanceof Error ? err.message : "Could not summarize");
    } finally {
      setAiSummaryLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreviewUrl(null);
    setTextContent(null);
    setCsvData(null);
    setImgState((s) => ({ ...s, scale: 1, panX: 0, panY: 0, rotation: 0 }));

    async function load() {
      try {
        // Use the proxied download endpoint for all types — avoids direct S3/R2
        // CORS issues and pre-signed URL expiry problems.
        const downloadEndpoint = `/api/drive/files/${file.id}/download`;

        const previewEndpoint = `${downloadEndpoint}?preview=1`;

        if (previewType === "text" || previewType === "csv") {
          const textRes = await fetch(previewEndpoint);
          if (!textRes.ok) throw new Error("Could not load file content");
          const text = await textRes.text();
          if (cancelled) return;
          if (previewType === "csv") {
            setCsvData(parseCsv(text));
          } else {
            setTextContent(text);
          }
        } else if (previewType !== "unsupported") {
          // Use ?preview=1 so the server proxies with Content-Disposition: inline,
          // preventing browsers from downloading instead of displaying the file.
          if (!cancelled) setPreviewUrl(previewEndpoint);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load preview");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [file.id, previewType]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, goNext, goPrev]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Image pan handlers
  const handleImgMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setImgState((s) => ({
      ...s,
      isDragging: true,
      dragStartX: e.clientX,
      dragStartY: e.clientY,
      startPanX: s.panX,
      startPanY: s.panY,
    }));
  };

  const handleImgMouseMove = (e: React.MouseEvent) => {
    setImgState((s) => {
      if (!s.isDragging) return s;
      return {
        ...s,
        panX: s.startPanX + (e.clientX - s.dragStartX),
        panY: s.startPanY + (e.clientY - s.dragStartY),
      };
    });
  };

  const handleImgMouseUp = () => {
    setImgState((s) => ({ ...s, isDragging: false }));
  };

  const handleZoomIn = () => setImgState((s) => ({ ...s, scale: Math.min(s.scale + 0.25, 5) }));
  const handleZoomOut = () => setImgState((s) => ({ ...s, scale: Math.max(s.scale - 0.25, 0.25) }));
  const handleRotate = () => setImgState((s) => ({ ...s, rotation: s.rotation + 90 }));
  const handleZoomReset = () => setImgState((s) => ({ ...s, scale: 1, panX: 0, panY: 0, rotation: 0 }));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex flex-col"
      onClick={handleBackdropClick}
    >
      {/* Prev/Next arrows outside modal */}
      {allFiles && hasPrev && (
        <button
          onClick={goPrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-60 rounded-full bg-[#1B1F2A]/90 p-2.5 shadow-lg hover:bg-[#1B1F2A] transition-colors border border-[#262A35]"
          title="Previous file"
        >
          <ChevronLeft className="h-5 w-5 text-[#8A92A6]" />
        </button>
      )}
      {allFiles && hasNext && (
        <button
          onClick={goNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-60 rounded-full bg-[#1B1F2A]/90 p-2.5 shadow-lg hover:bg-[#1B1F2A] transition-colors border border-[#262A35]"
          title="Next file"
        >
          <ChevronRight className="h-5 w-5 text-[#8A92A6]" />
        </button>
      )}

      {/* Modal container */}
      <div className="relative flex h-full max-h-[90vh] w-full max-w-5xl mx-auto my-auto flex-col rounded-2xl bg-[#12151D] shadow-2xl overflow-hidden border border-[#262A35]">
        {/* Header */}
        <div className="bg-[#12151D] border-b border-[#262A35] px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <FileText className="h-5 w-5 text-[#00C2FF] shrink-0" />
            <div className="min-w-0">
              <h2 className="font-medium text-[#E6E9F0] text-sm truncate">{file.name}</h2>
              <div className="flex items-center gap-3 text-xs text-[#8A92A6] mt-0.5">
                <span>{formatFileSize(file.size)}</span>
                <span>·</span>
                <span>Modified {formatDistanceToNow(new Date(file.updatedAt), { addSuffix: true })}</span>
                {allFiles && allFiles.length > 1 && (
                  <>
                    <span>·</span>
                    <span>{currentIndex + 1} of {allFiles.length}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {/* Zoom controls for images */}
            {previewType === "image" && !loading && !error && previewUrl && (
              <div className="flex items-center gap-1 rounded-md border border-[#262A35] p-0.5 mr-1">
                <button
                  onClick={handleZoomOut}
                  title="Zoom out"
                  className="p-1.5 text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] rounded-md transition-colors"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs text-[#8A92A6] w-10 text-center">
                  {Math.round(imgState.scale * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  title="Zoom in"
                  className="p-1.5 text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] rounded-md transition-colors"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <span className="mx-0.5 h-4 w-px bg-[#262A35]" />
                <button
                  onClick={handleRotate}
                  title="Rotate 90°"
                  className="p-1.5 text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] rounded-md transition-colors"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handleZoomReset}
                  title="Reset view"
                  className="p-1.5 text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] rounded-md transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <button
              onClick={onShowVersions}
              title="Version history"
              className="bg-[#12151D] text-[#8A92A6] hover:bg-[#1B1F2A] border border-[#262A35] rounded-md px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <History className="h-3.5 w-3.5" />
              History
            </button>
            {onShare && (
              <button
                onClick={onShare}
                title="Share"
                className="bg-[#12151D] text-[#8A92A6] hover:bg-[#1B1F2A] border border-[#262A35] rounded-md px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                <Share2 className="h-3.5 w-3.5" />
                Share
              </button>
            )}
            <button
              onClick={onDownload}
              title="Download"
              className="bg-[#00C2FF] text-[#06121A] hover:opacity-90 rounded-md px-4 py-2 text-sm font-medium flex items-center gap-2 transition-opacity"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
            {isOwner && (
              <button
                onClick={() => { onDelete(); onClose(); }}
                title="Delete"
                className="bg-[#12151D] text-red-400 hover:bg-red-400/10 border border-red-400/30 rounded-md px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            )}
            <button
              onClick={onClose}
              title="Close"
              className="p-2 text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] rounded-md transition-colors ml-1"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Preview area */}
        <div className="flex-1 overflow-auto bg-[#12151D] flex items-center justify-center p-8">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#00C2FF]" />
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-[#8A92A6]">
              <AlertCircle className="h-12 w-12 text-[#8A92A6]" />
              <p className="text-sm">{error}</p>
              <button
                onClick={onDownload}
                className="bg-[#00C2FF] text-[#06121A] hover:opacity-90 rounded-md px-4 py-2 text-sm font-medium flex items-center gap-2 transition-opacity"
              >
                <Download className="h-4 w-4" />
                Download instead
              </button>
            </div>
          ) : previewType === "image" && previewUrl ? (
            <div
              ref={imgContainerRef}
              className="flex h-full items-center justify-center overflow-hidden"
              style={{ cursor: imgState.isDragging ? "grabbing" : imgState.scale > 1 ? "grab" : "default" }}
              onMouseDown={handleImgMouseDown}
              onMouseMove={handleImgMouseMove}
              onMouseUp={handleImgMouseUp}
              onMouseLeave={handleImgMouseUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={file.name}
                draggable={false}
                className="max-w-full max-h-full rounded-lg shadow-2xl select-none"
                style={{
                  transform: `scale(${imgState.scale}) translate(${imgState.panX / imgState.scale}px, ${imgState.panY / imgState.scale}px) rotate(${imgState.rotation}deg)`,
                  transition: imgState.isDragging ? "none" : "transform 150ms ease-out",
                }}
              />
            </div>
          ) : previewType === "pdf" && previewUrl ? (
            <iframe
              src={previewUrl}
              title={file.name}
              className="bg-[#12151D] rounded-lg shadow-2xl w-full max-w-4xl h-full border-0"
              style={{ minHeight: "500px" }}
            />
          ) : previewType === "video" && previewUrl ? (
            <div className="flex h-full items-center justify-center">
              <video
                src={previewUrl}
                controls
                className="max-h-full max-w-full rounded-lg shadow-2xl"
              >
                Your browser does not support video playback.
              </video>
            </div>
          ) : previewType === "audio" && previewUrl ? (
            <div className="flex h-full items-center justify-center">
              <div className="w-full max-w-lg rounded-2xl bg-[#12151D] p-8 shadow-md text-center border border-[#262A35]">
                <File className="h-16 w-16 text-[#00C2FF] mx-auto mb-4" />
                <p className="text-sm font-medium text-[#E6E9F0] mb-4">{file.name}</p>
                <audio src={previewUrl} controls className="w-full">
                  Your browser does not support audio playback.
                </audio>
              </div>
            </div>
          ) : previewType === "csv" && csvData ? (
            <div className="h-full overflow-auto w-full">
              <div className="rounded-lg border border-[#262A35] bg-[#12151D] overflow-auto shadow-2xl">
                <table className="text-sm w-full">
                  <thead>
                    <tr className="border-b border-[#262A35] bg-[#12151D]">
                      {csvData[0]?.map((cell, i) => (
                        <th
                          key={i}
                          className="py-2.5 px-4 text-left font-semibold text-[#E6E9F0] whitespace-nowrap text-xs"
                        >
                          {cell}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(1).map((row, ri) => (
                      <tr key={ri} className="border-b border-[#262A35] hover:bg-[#12151D] transition-colors">
                        {row.map((cell, ci) => (
                          <td key={ci} className="py-2 px-4 text-[#8A92A6] whitespace-nowrap text-sm">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : previewType === "text" && textContent !== null ? (
            <div className="h-full overflow-auto w-full">
              <pre
                className="rounded-lg bg-[#12151D] text-[#E6E9F0] p-5 text-xs leading-relaxed overflow-auto font-mono whitespace-pre-wrap break-words shadow-2xl border border-[#262A35]"
                style={{
                  tabSize: 2,
                  minHeight: "300px",
                }}
              >
                {textContent}
              </pre>
            </div>
          ) : (
            // Unsupported or no URL
            <div className="flex h-full flex-col items-center justify-center gap-4 text-[#8A92A6]">
              <File className="h-16 w-16 text-[#8A92A6]" />
              <p className="text-base font-medium text-[#E6E9F0]">Preview not available</p>
              <p className="text-sm text-[#8A92A6]">{file.mimeType}</p>
              <button
                onClick={onDownload}
                className="bg-[#00C2FF] text-[#06121A] hover:opacity-90 rounded-md px-4 py-2 text-sm font-medium flex items-center gap-2 transition-opacity"
              >
                <Download className="h-4 w-4" />
                Download file
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
