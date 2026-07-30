"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { MentorPanelTab } from "@/components/MentorWorkspace";

export default function MentorPage() {
  const [me, setMe] = useState<{ isMentor?: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/internship/me").then(r => r.json()).then(setMe).catch(() => setMe({}));
  }, []);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        eyebrow="Nexus"
        title="Mentor"
        description="Manage interns — curriculum, attendance, and HR records."
      />
      <div className="flex-1 overflow-auto bg-surface p-6">
        {!me ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 text-accent animate-spin" />
          </div>
        ) : me.isMentor ? (
          <MentorPanelTab />
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-accent-soft flex items-center justify-center mb-4">
              <ShieldAlert className="w-7 h-7 text-accent" />
            </div>
            <p className="font-semibold text-foreground">Mentor access required</p>
            <p className="text-sm text-subtle mt-1 max-w-xs">This area is only available to mentors.</p>
          </div>
        )}
      </div>
    </div>
  );
}
