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
          className="nx-press nx-lift flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover transition-colors"
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
        className="nx-press nx-lift flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-foreground hover:bg-accent-hover transition-colors"
      >
        <SquarePen className="h-4 w-4 flex-shrink-0" />
        <span>Compose</span>
        
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
          style={{ position: "fixed", inset: 0, zIndex: 199, background: "rgba(0,0,0,0.2)" }}
          onClick={onClose}
        />
      )}

      {/* Compose window — inline style so nothing in the cascade can override position */}
      <div
        style={{
          position: "fixed",
          bottom: minimized ? 0 : 24,
          right: 24,
          zIndex: 200,
          width: minimized ? 288 : 580,
          maxWidth: "calc(100vw - 3rem)",
        }}
        className={`bg-surface overflow-hidden transition-[width] duration-200 ${
          minimized
            ? "rounded-t-2xl shadow-lg"
            : "rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.5)] border border-border"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 bg-surface-sunken ${
            minimized ? "rounded-t-2xl cursor-pointer" : ""
          }`}
          onClick={minimized ? () => setMinimized(false) : undefined}
        >
          <h2 className="text-[13.5px] font-semibold text-foreground">New Message</h2>
          <div className="flex items-center gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }}
              className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-foreground transition-colors"
              aria-label={minimized ? "Restore" : "Minimise"}
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${minimized ? "rotate-180" : ""}`} />
            </button>
            <button
              onClick={expandToFullPage}
              className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-foreground transition-colors"
              aria-label="Expand to full page"
              title="Open full compose"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Body — height capped so it never overflows viewport */}
        {!minimized && (
          <div style={{ maxHeight: "calc(100vh - 120px)", overflowY: "auto" }}>
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
