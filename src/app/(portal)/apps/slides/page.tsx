"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Presentation } from "lucide-react";
import { toast } from "sonner";
import { AppHome, type HomeTemplate } from "@/components/AppHome";

type PresItem = {
  id: string; title: string; updatedAt: string;
  isOwner: boolean; sharedRole: string | null;
  /** First slide's text, computed server-side for the card thumbnail. */
  previewLines?: string[];
};

/**
 * Presentations home — same docs.google.com layout as Docs and Sheets, via
 * the shared <AppHome>.
 */

const TEMPLATES: HomeTemplate[] = [
  { id: "blank",     label: "Blank",            preview: "blank" },
  { id: "pitch",     label: "Pitch deck",       sublabel: "Business", preview: "deck" },
  { id: "report",    label: "Status report",    sublabel: "Work",     preview: "deck" },
  { id: "training",  label: "Training",         sublabel: "Work",     preview: "deck" },
  { id: "incident",  label: "Incident review",  sublabel: "Security", preview: "deck" },
];

export default function SlidesPage() {
  const router = useRouter();
  const [decks, setDecks] = useState<PresItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/slides")
      .then(r => r.json())
      .then((d: PresItem[]) => setDecks(Array.isArray(d) ? d : []))
      .catch(() => toast.error("Failed to load presentations"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (templateId: string) => {
    setCreating(true);
    try {
      const label = TEMPLATES.find(t => t.id === templateId)?.label;
      const res = await fetch("/api/slides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: templateId === "blank" ? "Untitled Presentation" : (label ?? "Untitled Presentation"),
        }),
      });
      if (!res.ok) throw new Error();
      const { id } = await res.json() as { id: string };
      // The editor owns template content (it already has layout presets and a
      // templates dialog); this seeds the title and passes the chosen id along.
      router.push(`/apps/slides/${id}${templateId === "blank" ? "" : `?template=${templateId}`}`);
    } catch {
      toast.error("Failed to create presentation");
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    setDecks(prev => prev.filter(d => d.id !== id));
    try {
      const res = await fetch(`/api/slides/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Presentation deleted");
    } catch {
      toast.error("Could not delete that presentation");
      load();
    }
  };

  return (
    <AppHome
      noun="presentation"
      appName="Sage Slides"
      thumb="slide"
      templates={TEMPLATES}
      items={decks}
      loading={loading}
      creating={creating}
      accent="var(--warn)"
      onCreate={create}
      onOpen={id => router.push(`/apps/slides/${id}`)}
      onDelete={remove}
      emptyIcon={Presentation}
    />
  );
}
