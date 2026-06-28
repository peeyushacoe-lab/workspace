"use client";

import { useEffect, useRef, useState } from "react";
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
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#00C2FF] to-[#0098E6] text-[#06121A] hover:brightness-110 shadow-[0_6px_16px_-6px_rgba(0,194,255,0.5)] transition-all"
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
        className="mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-2xl bg-gradient-to-br from-[#00C2FF] to-[#0098E6] hover:brightness-110 px-4 py-2.5 text-[13.5px] font-semibold text-[#06121A] shadow-[0_6px_16px_-6px_rgba(0,194,255,0.5)] transition-all"
      >
        <SquarePen className="h-4 w-4 flex-shrink-0" />
        <span>Compose</span>
        <span className="ml-auto text-[10px] font-normal text-[#06121A]/60 hidden xl:inline">⌃⇧C</span>
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

  // ── Drag state ────────────────────────────────────────────────────────────
  // Default: bottom-right corner (matches old fixed position)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const windowRef = useRef<HTMLDivElement>(null);

  // Initialise position to bottom-right on first render
  useEffect(() => {
    const w = 580;
    const h = 0; // height unknown yet, we pin from bottom
    setPos({
      x: window.innerWidth - w - 24,
      y: window.innerHeight - 480 - 24, // approx composer height
    });
  }, []);

  // Clamp helper — keeps window inside viewport
  const clamp = (x: number, y: number) => {
    const el = windowRef.current;
    const W = el?.offsetWidth  ?? 580;
    const H = el?.offsetHeight ?? 480;
    return {
      x: Math.max(0, Math.min(x, window.innerWidth  - W)),
      y: Math.max(0, Math.min(y, window.innerHeight - H)),
    };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only drag from the header, not from its buttons
    if ((e.target as HTMLElement).closest("button")) return;
    dragging.current = true;
    const rect = windowRef.current?.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top  ?? 0),
    };
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos(clamp(
        e.clientX - dragOffset.current.x,
        e.clientY - dragOffset.current.y,
      ));
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, []);

  const expandToFullPage = () => {
    onClose();
    router.push("/compose");
  };

  // While position is being calculated, render offscreen
  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : { right: 24, bottom: 24 };

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
        ref={windowRef}
        style={style}
        className={`fixed z-[200] transition-shadow duration-200 ${
          minimized
            ? "w-72 rounded-t-2xl shadow-lg"
            : "w-[580px] max-w-[calc(100vw-3rem)] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.5)] border border-[#262A35]"
        } bg-[#12151D] overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — drag handle */}
        <div
          onMouseDown={onMouseDown}
          className={`flex items-center justify-between px-5 py-3.5 select-none ${
            minimized
              ? "bg-[#1B1F2A] rounded-t-2xl cursor-pointer"
              : "bg-[#1B1F2A] cursor-grab active:cursor-grabbing"
          }`}
          onClick={minimized ? () => setMinimized(false) : undefined}
        >
          <h2 className="text-[13.5px] font-semibold text-white">New Message</h2>
          <div className="flex items-center gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }}
              className="rounded-md p-1.5 text-white/60 hover:bg-[#12151D]/10 hover:text-white transition-colors"
              aria-label={minimized ? "Restore" : "Minimise"}
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${minimized ? "rotate-180" : ""}`} />
            </button>
            <button
              onClick={expandToFullPage}
              className="rounded-md p-1.5 text-white/60 hover:bg-[#12151D]/10 hover:text-white transition-colors"
              aria-label="Expand to full page"
              title="Open full compose"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-white/60 hover:bg-[#12151D]/10 hover:text-white transition-colors"
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
