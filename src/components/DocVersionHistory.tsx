"use client";

import { useCallback, useEffect, useState } from "react";
import { History, RotateCcw, Trash2, Save, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

/**
 * Server-persisted version history, shared by Docs, Sheets and Slides.
 *
 * Every office-suite document is a `Note` row (discriminated by `color` — see
 * src/lib/doc-markers.ts), so one panel and one API endpoint
 * (/api/documents/[id]/versions) covers all three editors.
 *
 * Replaces the localStorage-only history that used to live in DocsView, which
 * was invisible to collaborators and lost whenever the browser cache was
 * cleared.
 *
 * Not to be confused with `VersionHistoryPanel.tsx`, which is Drive's
 * file-version panel (R2 blobs, different model entirely).
 */

export type DocVersion = {
  id: string;
  label: string;
  title: string | null;
  size: number;
  createdAt: string;
  authorId: string | null;
  authorName?: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocVersionHistory({
  docId,
  onClose,
  getContent,
  onRestored,
  canEdit = true,
}: {
  docId: string;
  onClose: () => void;
  /** Current document body, snapshotted when the user clicks "Save version". */
  getContent: () => { content: string; title?: string };
  /** Called with the restored body so the editor can reload itself. */
  onRestored: (content: string, title?: string) => void;
  canEdit?: boolean;
}) {
  const [versions, setVersions] = useState<DocVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${docId}/versions`);
      if (res.ok) setVersions((await res.json()) as DocVersion[]);
    } catch {
      toast.error("Could not load version history");
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => { void load(); }, [load]);

  const saveVersion = async () => {
    const { content, title } = getContent();
    if (!content) { toast.error("Nothing to save"); return; }
    setBusyId("new");
    try {
      const res = await fetch(`/api/documents/${docId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, title, label: "Manual save" }),
      });
      if (!res.ok) throw new Error();
      toast.success("Version saved");
      await load();
    } catch {
      toast.error("Could not save version");
    } finally {
      setBusyId(null);
    }
  };

  const restore = async (version: DocVersion) => {
    setBusyId(version.id);
    try {
      const res = await fetch(`/api/documents/${docId}/versions/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: version.id }),
      });
      if (!res.ok) throw new Error();
      const doc = (await res.json()) as { content: string; title?: string };
      onRestored(doc.content, doc.title);
      toast.success("Restored — the previous state was saved first");
      await load();
    } catch {
      toast.error("Could not restore this version");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (version: DocVersion) => {
    setBusyId(version.id);
    try {
      await fetch(`/api/documents/${docId}/versions?versionId=${version.id}`, { method: "DELETE" });
      setVersions(prev => prev.filter(v => v.id !== version.id));
    } catch {
      toast.error("Could not delete this version");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border-soft">
        <History className="w-4 h-4 text-muted" />
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">Version history</p>
          <p className="text-[10px] text-subtle">
            {loading ? "Loading…" : `${versions.length} version${versions.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {canEdit && (
            <button
              onClick={() => void saveVersion()}
              disabled={busyId === "new"}
              title="Save a version now"
              className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-hover transition-colors disabled:opacity-50"
            >
              {busyId === "new"
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Save className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-subtle hover:text-foreground hover:bg-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-subtle" />
          </div>
        ) : versions.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <History className="w-6 h-6 mx-auto text-subtle mb-2" />
            <p className="text-xs text-muted">No versions yet</p>
            <p className="text-[10px] text-subtle mt-1">
              Versions are captured automatically as you edit.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border-soft">
            {versions.map(version => (
              <li key={version.id} className="px-3 py-2.5 hover:bg-hover transition-colors group">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">{version.label}</p>
                    <p className="text-[10px] text-subtle mt-0.5">
                      {formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })}
                      {version.authorName ? ` · ${version.authorName}` : ""}
                      {` · ${formatSize(version.size)}`}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        onClick={() => void restore(version)}
                        disabled={busyId === version.id}
                        title="Restore this version"
                        className="p-1.5 rounded-md text-muted hover:text-accent hover:bg-accent-soft transition-colors disabled:opacity-50"
                      >
                        {busyId === version.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <RotateCcw className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => void remove(version)}
                        disabled={busyId === version.id}
                        title="Delete this version"
                        className="p-1.5 rounded-md text-muted hover:text-crit hover:bg-crit-soft transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Fire-and-forget autosave snapshot. The server coalesces repeated calls inside
 * a 5-minute window into a single row and skips identical content, so callers
 * can invoke this on every debounced save without flooding the history.
 */
export function snapshotVersion(docId: string, content: string, title?: string): void {
  if (!docId || !content) return;
  fetch(`/api/documents/${docId}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, title, auto: true }),
  }).catch(() => { /* autosave is best-effort */ });
}
