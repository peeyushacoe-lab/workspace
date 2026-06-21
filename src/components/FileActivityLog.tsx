"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Loader2, Eye, Download, Share2, Upload, Pencil, Trash2, RotateCcw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type ActivityEntry = {
  id: string;
  action: string;
  actorId: string | null;
  actorName: string;
  actorEmail: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type Props = {
  fileId: string;
};

function getActionIcon(action: string) {
  switch (action) {
    case "DRIVE_FILE_VIEW": return Eye;
    case "DRIVE_FILE_DOWNLOAD": return Download;
    case "DRIVE_FILE_SHARE": return Share2;
    case "DRIVE_FILE_UPLOAD": return Upload;
    case "DRIVE_FILE_EDIT": return Pencil;
    case "DRIVE_FILE_DELETE": return Trash2;
    case "DRIVE_FILE_RESTORE": return RotateCcw;
    default: return Activity;
  }
}

function getActionLabel(action: string): string {
  switch (action) {
    case "DRIVE_FILE_VIEW": return "viewed this file";
    case "DRIVE_FILE_DOWNLOAD": return "downloaded this file";
    case "DRIVE_FILE_SHARE": return "shared this file";
    case "DRIVE_FILE_UPLOAD": return "uploaded this file";
    case "DRIVE_FILE_EDIT": return "edited this file";
    case "DRIVE_FILE_DELETE": return "deleted this file";
    case "DRIVE_FILE_RESTORE": return "restored this file";
    default: return action.replace("DRIVE_FILE_", "").toLowerCase();
  }
}

export function FileActivityLog({ fileId }: Props) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/drive/files/${fileId}/activity`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as ActivityEntry[];
      setEntries(data);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-[#00C2FF]" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-[#8A92A6]">
        <Activity className="h-8 w-8 text-[#5A6275]" />
        <p className="text-sm">No activity recorded yet</p>
      </div>
    );
  }

  return (
    <div className="py-2">
      {entries.map((entry) => {
        const Icon = getActionIcon(entry.action);
        return (
          <div key={entry.id} className="border-b border-[#262A35] px-4 py-3 hover:bg-[#1B1F2A] transition-colors flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#1B1F2A] flex items-center justify-center text-[#8A92A6] flex-shrink-0 mt-0.5">
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[#E6E9F0]">
                <span className="font-medium">{entry.actorName}</span>
                {" "}
                <span className="text-[#8A92A6]">{getActionLabel(entry.action)}</span>
              </p>
              {entry.actorEmail && (
                <p className="text-xs text-[#8A92A6] truncate">{entry.actorEmail}</p>
              )}
              <p className="text-xs text-[#8A92A6] mt-0.5">
                {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
