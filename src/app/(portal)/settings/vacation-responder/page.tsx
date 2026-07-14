"use client";

import { useEffect, useState } from "react";
import { PalmtreeIcon, Loader2, Save } from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { toast } from "sonner";

type Responder = {
  isEnabled: boolean;
  subject: string;
  message: string;
  startDate: string | null;
  endDate: string | null;
};

const cardClass = "bg-[#12151D] border border-[#262A35] rounded-xl";
const inputClass =
  "w-full px-3 py-2 bg-[#0B0D12] border border-[#262A35] rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] focus:outline-none focus:border-[#00C2FF]/60 focus:ring-2 focus:ring-[#00C2FF]/20 transition-colors";
const primaryBtn =
  "inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#00C2FF] text-[#06121A] hover:bg-[#0098E6] transition disabled:opacity-50 disabled:cursor-not-allowed";

function toInputDate(v: string | null): string {
  return v ? v.slice(0, 10) : "";
}

export default function VacationResponderPage() {
  const [data, setData] = useState<Responder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/vacation-responder")
      .then((r) => r.json())
      .then((d: Responder) => setData(d))
      .catch(() => toast.error("Failed to load vacation responder"))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/vacation-responder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Vacation responder saved");
    } catch {
      toast.error("Failed to save vacation responder");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0D12] text-[#E6E9F0]">
      <PageHeader
        eyebrow="Settings"
        title="Vacation responder"
        description="Automatically reply to incoming mail while you're away. Replies once per sender per 24 hours."
      />

      <div className="px-6 pb-10 max-w-2xl space-y-6">
        {loading || !data ? (
          <div className="flex items-center gap-2 text-[#5A6275] text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className={`${cardClass} p-5 space-y-4`}>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="flex items-center gap-2 text-sm font-medium">
                <PalmtreeIcon className="w-4 h-4 text-[#00C2FF]" />
                Vacation responder on
              </span>
              <input
                type="checkbox"
                checked={data.isEnabled}
                onChange={(e) => setData({ ...data, isEnabled: e.target.checked })}
                className="w-4 h-4 accent-[#00C2FF]"
              />
            </label>

            <div>
              <label className="text-xs text-[#8A92A6] mb-1 block">Subject</label>
              <input
                className={inputClass}
                value={data.subject}
                onChange={(e) => setData({ ...data, subject: e.target.value })}
                placeholder="Automatic reply"
              />
            </div>

            <div>
              <label className="text-xs text-[#8A92A6] mb-1 block">Message</label>
              <textarea
                className={`${inputClass} min-h-[120px]`}
                value={data.message}
                onChange={(e) => setData({ ...data, message: e.target.value })}
                placeholder="I'm currently out of office and will respond when I return."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#8A92A6] mb-1 block">Start date (optional)</label>
                <input
                  type="date"
                  className={inputClass}
                  value={toInputDate(data.startDate)}
                  onChange={(e) => setData({ ...data, startDate: e.target.value || null })}
                />
              </div>
              <div>
                <label className="text-xs text-[#8A92A6] mb-1 block">End date (optional)</label>
                <input
                  type="date"
                  className={inputClass}
                  value={toInputDate(data.endDate)}
                  onChange={(e) => setData({ ...data, endDate: e.target.value || null })}
                />
              </div>
            </div>

            <button onClick={() => void save()} disabled={saving} className={primaryBtn}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
