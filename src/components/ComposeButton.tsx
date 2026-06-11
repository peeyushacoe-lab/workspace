"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, X, Send, Maximize2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { SimpleComposer } from "./WorkspaceDashboard";
import type { UserRole } from "@/generated/prisma/enums";

const DRAFT_KEY = "cybersage-compose-draft";

export function ComposeButton({
  userRole,
  collapsed = false,
}: {
  userRole: UserRole;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "C" && e.ctrlKey && e.shiftKey && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  if (collapsed) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          title="Compose (Ctrl+Shift+C)"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#00d2ff] text-[#003543] hover:bg-[#47d6ff] transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {open && <ComposeModal userRole={userRole} onClose={() => setOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mx-2 mb-1 flex w-[calc(100%-1rem)] items-center gap-2.5 rounded-lg bg-[#00d2ff] px-3 py-2 text-[13px] font-medium text-[#003543] hover:bg-[#47d6ff] transition-colors"
      >
        <Pencil className="h-3.5 w-3.5 flex-shrink-0" />
        <span>Compose</span>
        <span className="ml-auto text-[10px] font-normal text-[#003543]/60 hidden xl:inline">⌃⇧C</span>
      </button>
      {open && <ComposeModal userRole={userRole} onClose={() => setOpen(false)} />}
    </>
  );
}

function ComposeModal({
  userRole,
  onClose,
}: {
  userRole: UserRole;
  onClose: () => void;
}) {
  const router = useRouter();

  const expandToFullPage = () => {
    onClose();
    router.push("/compose");
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-lg bg-[#1b1f2e] rounded-xl shadow-2xl border border-[rgba(255,255,255,0.09)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#00d2ff]">
              <Send className="h-3 w-3 text-[#003543]" />
            </div>
            <h2 className="text-sm font-semibold text-[#dfe1f6]">New Message</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={expandToFullPage}
              className="rounded-md p-1.5 text-[#9aa3b8] hover:bg-[#262939] hover:text-[#dfe1f6] transition-colors"
              aria-label="Expand to full page"
              title="Full-page compose"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-[#9aa3b8] hover:bg-[#262939] hover:text-[#dfe1f6] transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="max-h-[80vh] overflow-y-auto">
          <SimpleComposer
            userRole={userRole}
            bare
            draftKey={DRAFT_KEY}
            onSuccess={onClose}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
