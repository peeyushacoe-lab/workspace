"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileSpreadsheet, Users, Trash2, ExternalLink, Loader2, Clock, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type SheetItem = {
  id: string; title: string; updatedAt: string;
  isOwner: boolean; sharedRole: string | null;
};

export default function SheetsPage() {
  const router = useRouter();
  const [sheets, setSheets] = useState<SheetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/sheets")
      .then((r) => r.json())
      .then((d: SheetItem[]) => setSheets(Array.isArray(d) ? d : []))
      .catch(() => toast.error("Failed to load spreadsheets"))
      .finally(() => setLoading(false));
  }, []);

  async function createNew() {
    setCreating(true);
    try {
      const r = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled Spreadsheet" }),
      });
      const d = (await r.json()) as { id: string };
      router.push(`/apps/sheets/${d.id}`);
    } catch { toast.error("Failed to create spreadsheet"); setCreating(false); }
  }

  async function deleteSheet(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/sheets/${id}`, { method: "DELETE" });
    setSheets((prev) => prev.filter((s) => s.id !== id));
    toast.success("Deleted");
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/apps")} title="Back to Apps"
            className="flex items-center justify-center h-9 w-9 rounded-lg text-[#8A92A6] hover:bg-[#1B1F2A] transition-colors flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-[#E6E9F0]">Spreadsheets</h1>
            <p className="text-sm text-[#8A92A6] mt-0.5">Create and collaborate on spreadsheets</p>
          </div>
        </div>
        <button onClick={createNew} disabled={creating}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[#00C2FF] text-[#06121A] hover:bg-[#0098E6] disabled:opacity-50 transition-colors">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          New spreadsheet
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#00C2FF]" /></div>
      ) : sheets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#0E2532] flex items-center justify-center mb-4">
            <FileSpreadsheet className="w-8 h-8 text-[#00C2FF]" />
          </div>
          <h2 className="text-base font-semibold text-[#E6E9F0] mb-1">No spreadsheets yet</h2>
          <p className="text-sm text-[#8A92A6] mb-4">Create your first spreadsheet to get started</p>
          <button onClick={createNew} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[#00C2FF] text-[#06121A] hover:bg-[#0098E6] transition-colors">
            <Plus className="w-4 h-4" /> Create spreadsheet
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {sheets.map((sheet) => (
            <div key={sheet.id}
              onClick={() => router.push(`/apps/sheets/${sheet.id}`)}
              className="group bg-[#12151D] border border-[#262A35] rounded-xl p-4 cursor-pointer hover:border-[#00C2FF]/30 hover:shadow-sm transition-all">
              {/* Preview icon */}
              <div className="w-full h-24 rounded-lg bg-[#1B1F2A] flex items-center justify-center mb-3 group-hover:bg-[#0E2532] transition-colors">
                <FileSpreadsheet className="w-8 h-8 text-[#00C2FF]" />
              </div>
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#E6E9F0] truncate">{sheet.title}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3 text-[#5A6275]" />
                    <span className="text-[11px] text-[#5A6275]">
                      {formatDistanceToNow(new Date(sheet.updatedAt), { addSuffix: true })}
                    </span>
                  </div>
                  {!sheet.isOwner && (
                    <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded-full bg-[#0E2532] text-[10px] text-[#00C2FF]">
                      <Users className="w-2.5 h-2.5" /> Shared
                    </span>
                  )}
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); window.open(`/apps/sheets/${sheet.id}`, "_blank"); }}
                    className="p-1 rounded hover:bg-[#1B1F2A] text-[#5A6275]">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  {sheet.isOwner && (
                    <button onClick={(e) => deleteSheet(sheet.id, e)}
                      className="p-1 rounded hover:bg-[#1B1F2A] text-[#5A6275] hover:text-[#ea4335]">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
