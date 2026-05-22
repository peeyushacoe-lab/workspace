"use client";

import { useState } from "react";
import {
  Download,
  File,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  AlertCircle,
} from "lucide-react";

type SharedFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  downloadUrl: string | null;
  role: string;
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

function getPreviewType(mimeType: string, name: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const textExts = ["txt", "md", "json", "html", "css", "xml", "yaml", "yml"];
  if (mimeType.startsWith("text/") || textExts.includes(ext)) return "text";
  return "unsupported";
}

export function ShareFileViewer({ file }: { file: SharedFile }) {
  const [zoom, setZoom] = useState(1);
  const previewType = getPreviewType(file.mimeType, file.name);
  const Icon = getMimeIcon(file.mimeType);

  const handleDownload = () => {
    if (!file.downloadUrl) return;
    const a = document.createElement("a");
    a.href = file.downloadUrl;
    a.download = file.name;
    a.click();
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0f1321]" style={{ fontFamily: "DM Sans, sans-serif" }}>
      {/* Top bar */}
      <header className="flex items-center gap-4 border-b border-[rgba(0,255,255,0.1)] bg-[#1b1f2e] px-6 py-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Icon className="h-6 w-6 text-[#00d2ff] shrink-0" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-[#dfe1f6]">{file.name}</h1>
            <p className="text-xs text-[#bbc9cf]">{formatFileSize(file.size)} · {file.mimeType}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[#00d2ff]/10 text-[#00d2ff]">
            {file.role === "EDITOR" ? "Can edit" : "View only"}
          </span>
          {file.downloadUrl && (
            <button
              onClick={handleDownload}
              className="bg-[#00d2ff] text-[#003543] hover:opacity-90 rounded-md px-4 py-2 text-sm font-medium flex items-center gap-2 transition-opacity"
              style={{ transition: "opacity 150ms ease-out" }}
            >
              <Download className="h-4 w-4" />
              Download
            </button>
          )}
        </div>
      </header>

      {/* Preview area */}
      <main className="flex-1 flex items-center justify-center p-6 overflow-auto">
        {!file.downloadUrl ? (
          <div className="flex flex-col items-center gap-3 text-[#bbc9cf]">
            <AlertCircle className="h-12 w-12 text-[#bbc9cf]" />
            <p className="text-sm">File preview unavailable</p>
          </div>
        ) : previewType === "image" ? (
          <div className="flex flex-col items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={file.downloadUrl}
              alt={file.name}
              className="max-w-full rounded-lg shadow-2xl object-contain"
              style={{ maxHeight: "75vh", transform: `scale(${zoom})`, transformOrigin: "center", transition: "transform 150ms ease-out" }}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
                className="bg-[#1b1f2e] text-[#bbc9cf] hover:bg-[#262939] border border-[rgba(0,255,255,0.1)] rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
              >
                −
              </button>
              <span className="text-sm text-[#bbc9cf] w-16 text-center">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                className="bg-[#1b1f2e] text-[#bbc9cf] hover:bg-[#262939] border border-[rgba(0,255,255,0.1)] rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
              >
                +
              </button>
              <button
                onClick={() => setZoom(1)}
                className="bg-[#1b1f2e] text-[#bbc9cf] hover:bg-[#262939] border border-[rgba(0,255,255,0.1)] rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        ) : previewType === "pdf" ? (
          <iframe
            src={file.downloadUrl}
            title={file.name}
            className="bg-[#1b1f2e] rounded-lg shadow-2xl w-full max-w-4xl h-full border-0"
            style={{ height: "80vh", maxWidth: "1000px" }}
          />
        ) : previewType === "video" ? (
          <video
            src={file.downloadUrl}
            controls
            className="max-w-full rounded-lg shadow-2xl"
            style={{ maxHeight: "75vh" }}
          >
            Your browser does not support video playback.
          </video>
        ) : previewType === "audio" ? (
          <div className="w-full max-w-lg rounded-2xl bg-[#1b1f2e] p-10 shadow-md text-center border border-[rgba(0,255,255,0.1)]">
            <File className="h-16 w-16 text-[#00d2ff] mx-auto mb-4" />
            <p className="text-sm font-medium text-[#dfe1f6] mb-6">{file.name}</p>
            <audio src={file.downloadUrl} controls className="w-full">
              Your browser does not support audio playback.
            </audio>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-[#bbc9cf]">
            <File className="h-16 w-16 text-[#bbc9cf]" />
            <p className="text-base font-medium text-[#dfe1f6]">Preview not available</p>
            <p className="text-sm text-[#bbc9cf]">{file.mimeType}</p>
            {file.downloadUrl && (
              <button
                onClick={handleDownload}
                className="bg-[#00d2ff] text-[#003543] hover:opacity-90 rounded-md px-4 py-2 text-sm font-medium flex items-center gap-2 transition-opacity"
              >
                <Download className="h-4 w-4" />
                Download file
              </button>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-[rgba(0,255,255,0.1)] bg-[#1b1f2e] px-6 py-3 text-center text-xs text-[#bbc9cf]">
        Shared via CyberSage Drive
      </footer>
    </div>
  );
}
