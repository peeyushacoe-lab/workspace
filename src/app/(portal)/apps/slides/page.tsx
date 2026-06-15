"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Presentation, Users, Trash2, ExternalLink, Loader2, Clock, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type PresItem = {
  id: string; title: string; updatedAt: string;
  isOwner: boolean; sharedRole: string | null;
};

export default function SlidesPage() {
  const router = useRouter();
  const [presentations, setPresentations] = useState<PresItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/slides")
      .then((r) => r.json())
      .then((d: PresItem[]) => setPresentations(Array.isArray(d) ? d : []))
      .catch(() => toast.error("Failed to load presentations"))
      .finally(() => setLoading(false));
  }, []);

  async function createNew() {
    setCreating(true);
    try {
      const r = await fetch("/api/slides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled Presentation" }),
      });
      const d = (await r.json()) as { id: string };
      router.push(`/apps/slides/${d.id}`);
    } catch { toast.error("Failed to create presentation"); setCreating(false); }
  }

  async function deletePresentation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/slides/${id}`, { method: "DELETE" });
    setPresentations((prev) => prev.filter((p) => p.id !== id));
    toast.success("Deleted");
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/apps")} title="Back to Apps"
            className="flex items-center justify-center h-9 w-9 rounded-lg text-[#5f6368] hover:bg-[#f1f3f4] transition-colors flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-[#202124]">Presentations</h1>
            <p className="text-sm text-[#5f6368] mt-0.5">Create and collaborate on presentations</p>
          </div>
        </div>
        <button onClick={createNew} disabled={creating}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[#1a56db] text-white hover:bg-[#1648c7] disabled:opacity-50 transition-colors">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          New presentation
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-[#1a56db]" /></div>
      ) : presentations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#e8f0fe] flex items-center justify-center mb-4">
            <Presentation className="w-8 h-8 text-[#1a56db]" />
          </div>
          <h2 className="text-base font-semibold text-[#202124] mb-1">No presentations yet</h2>
          <p className="text-sm text-[#5f6368] mb-4">Create your first presentation to get started</p>
          <button onClick={createNew} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[#1a56db] text-white hover:bg-[#1648c7] transition-colors">
            <Plus className="w-4 h-4" /> Create presentation
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {presentations.map((pres) => (
            <div key={pres.id}
              onClick={() => router.push(`/apps/slides/${pres.id}`)}
              className="group bg-white border border-[#e8eaed] rounded-xl p-4 cursor-pointer hover:border-[#1a56db]/30 hover:shadow-sm transition-all">
              <div className="w-full h-24 rounded-lg bg-[#f1f3f4] flex items-center justify-center mb-3 group-hover:bg-[#e8f0fe] transition-colors">
                <Presentation className="w-8 h-8 text-[#1a56db]" />
              </div>
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#202124] truncate">{pres.title}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3 text-[#80868b]" />
                    <span className="text-[11px] text-[#80868b]">
                      {formatDistanceToNow(new Date(pres.updatedAt), { addSuffix: true })}
                    </span>
                  </div>
                  {!pres.isOwner && (
                    <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded-full bg-[#e8f0fe] text-[10px] text-[#1a56db]">
                      <Users className="w-2.5 h-2.5" /> Shared
                    </span>
                  )}
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); window.open(`/apps/slides/${pres.id}`, "_blank"); }}
                    className="p-1 rounded hover:bg-[#f1f3f4] text-[#80868b]">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  {pres.isOwner && (
                    <button onClick={(e) => deletePresentation(pres.id, e)}
                      className="p-1 rounded hover:bg-[#f1f3f4] text-[#80868b] hover:text-[#ea4335]">
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
