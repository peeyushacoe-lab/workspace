"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { AppHome, type HomeTemplate } from "@/components/AppHome";

type SheetItem = {
  id: string; title: string; updatedAt: string;
  isOwner: boolean; sharedRole: string | null;
};

/**
 * Spreadsheets home — the docs.google.com layout: a template gallery, then a
 * filterable list of recent files. Shared with Docs and Slides via <AppHome>,
 * because three near-identical screens drift the moment one is touched.
 */

const TEMPLATES: HomeTemplate[] = [
  { id: "blank",    label: "Blank",           preview: "blank" },
  { id: "budget",   label: "Monthly budget",  sublabel: "Personal", preview: "table" },
  { id: "invoice",  label: "Invoice",         sublabel: "Work",     preview: "table" },
  { id: "tracker",  label: "Project tracker", sublabel: "Work",     preview: "table" },
  { id: "expenses", label: "Expense report",  sublabel: "Work",     preview: "table" },
];

export default function SheetsPage() {
  const router = useRouter();
  const [sheets, setSheets] = useState<SheetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/sheets")
      .then(r => r.json())
      .then((d: SheetItem[]) => setSheets(Array.isArray(d) ? d : []))
      .catch(() => toast.error("Failed to load spreadsheets"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (templateId: string) => {
    setCreating(true);
    try {
      const label = TEMPLATES.find(t => t.id === templateId)?.label;
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: templateId === "blank" ? "Untitled Spreadsheet" : (label ?? "Untitled Spreadsheet"),
        }),
      });
      if (!res.ok) throw new Error();
      const { id } = await res.json() as { id: string };
      // The editor owns template content (it already has a templates dialog);
      // this only seeds the title and hands over the chosen template id.
      router.push(`/apps/sheets/${id}${templateId === "blank" ? "" : `?template=${templateId}`}`);
    } catch {
      toast.error("Failed to create spreadsheet");
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    // Optimistic — the list is the only thing showing it, and a failed delete
    // reloads below.
    setSheets(prev => prev.filter(s => s.id !== id));
    try {
      const res = await fetch(`/api/sheets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Spreadsheet deleted");
    } catch {
      toast.error("Could not delete that spreadsheet");
      load();
    }
  };

  return (
    <AppHome
      noun="spreadsheet"
      templates={TEMPLATES}
      items={sheets}
      loading={loading}
      creating={creating}
      accent="var(--ok)"
      onCreate={create}
      onOpen={id => router.push(`/apps/sheets/${id}`)}
      onDelete={remove}
      emptyIcon={FileSpreadsheet}
    />
  );
}
