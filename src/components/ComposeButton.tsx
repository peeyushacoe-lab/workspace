"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SquarePen, X, Maximize2, ChevronDown } from "lucide-react";
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
      if (e.key === "Escape") { setOpen(false); return; }
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
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#c2d3fc] text-[#1a56db] hover:bg-[#b3c7fb] shadow-[0_1px_3px_rgba(0,0,0,0.12)] transition-all"
        >
          <SquarePen className="h-[17px] w-[17px]" />
        </button>
        {open && <ComposeModal userRole={userRole} onClose={() => setOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-2xl bg-[#c2d3fc] hover:bg-[#b3c7fb] px-4 py-2.5 text-[13.5px] font-semibold text-[#1a56db] shadow-[0_1px_3px_rgba(0,0,0,0.10)] transition-all"
      >
        <SquarePen className="h-4 w-4 flex-shrink-0" />
        <span>Compose</span>
        <span className="ml-auto text-[10px] font-normal text-[#1a56db]/50 hidden xl:inline">⌃⇧C</span>
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
  const [minimized, setMinimized] = useState(false);

  const expandToFullPage = () => {
    onClose();
    router.push("/compose");
  };

  return createPortal(
    <>
      {/* Backdrop — only when not minimized */}
      {!minimized && (
        <div
          className="fixed inset-0 z-[199] bg-black/20"
          onClick={onClose}
        />
      )}

      {/* Compose window */}
      <div
        className={`fixed z-[200] transition-all duration-200 ${
          minimized
            ? "bottom-0 right-6 w-72 rounded-t-2xl shadow-lg"
            : "bottom-6 right-6 w-[580px] max-w-[calc(100vw-3rem)] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.18)] border border-[#e0e0e0]"
        } bg-white overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 ${
            minimized
              ? "bg-[#404040] rounded-t-2xl cursor-pointer"
              : "bg-[#404040]"
          }`}
          onClick={minimized ? () => setMinimized(false) : undefined}
        >
          <h2 className="text-[13.5px] font-semibold text-white">New Message</h2>
          <div className="flex items-center gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }}
              className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
              aria-label={minimized ? "Restore" : "Minimise"}
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${minimized ? "rotate-180" : ""}`} />
            </button>
            <button
              onClick={expandToFullPage}
              className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Expand to full page"
              title="Open full compose"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        {!minimized && (
          <div className="max-h-[70vh] overflow-y-auto">
            <SimpleComposer
              userRole={userRole}
              bare
              draftKey={DRAFT_KEY}
              onSuccess={onClose}
            />
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
