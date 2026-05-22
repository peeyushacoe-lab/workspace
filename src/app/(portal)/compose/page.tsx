"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, PenLine } from "lucide-react";
import { SimpleComposer } from "@/components/WorkspaceDashboard";

function ComposePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const to = searchParams.get("to") ?? "";
  const subject = searchParams.get("subject") ?? "";
  const body = searchParams.get("body") ?? "";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Page header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-surface">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex items-center gap-2 ml-2">
          <PenLine className="h-5 w-5 text-accent" />
          <h1 className="text-base font-semibold text-foreground">New Message</h1>
        </div>
      </div>

      {/* Compose area */}
      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        <SimpleComposer
          bare={true}
          defaultRecipient={to}
          defaultSubject={subject}
          defaultBody={body}
          draftKey="compose-fullpage"
          onSuccess={() => router.push("/inbox")}
        />
      </div>
    </div>
  );
}

export default function ComposePage() {
  return (
    <Suspense>
      <ComposePageContent />
    </Suspense>
  );
}
