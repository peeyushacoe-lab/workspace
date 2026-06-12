"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Search, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type CommandItem = {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  group?: string;
  onSelect: () => void;
};

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
  placeholder?: string;
}

export function CommandPalette({
  open,
  onClose,
  items,
  placeholder = "Type a command or search…",
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? items.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.description?.toLowerCase().includes(query.toLowerCase()),
      )
    : items;

  // Group items
  const grouped = filtered.reduce<Record<string, CommandItem[]>>((acc, item) => {
    const group = item.group ?? "Actions";
    (acc[group] ??= []).push(item);
    return acc;
  }, {});

  const flat = Object.values(grouped).flat();

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        flat[activeIndex]?.onSelect();
        onClose();
      }
    },
    [open, flat, activeIndex, onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-start justify-center pt-[20vh] px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/60 " aria-hidden />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-white/[0.1] bg-white shadow-[0_8px_32px_rgba(0,0,0,0.7)] overflow-hidden">
        {/* Search bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.07]">
          <Search className="h-4 w-4 text-[#5f6368] flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm text-[#202124] placeholder:text-[#5f6368]/60 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-[#5f6368] hover:text-[#202124]">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <kbd className="text-[10px] text-[#5f6368]/60 border border-white/[0.1] rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1.5">
          {flat.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[#5f6368]">No results found</p>
          ) : (
            Object.entries(grouped).map(([group, groupItems]) => {
              const groupStart = flat.indexOf(groupItems[0]!);
              return (
                <div key={group}>
                  <p className="px-4 py-1.5 text-[10px] font-semibold text-[#5f6368]/50">
                    {group}
                  </p>
                  {groupItems.map((item) => {
                    const idx = flat.indexOf(item);
                    return (
                      <button
                        key={item.id}
                        data-index={idx}
                        onClick={() => { item.onSelect(); onClose(); }}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                          idx === activeIndex
                            ? "bg-[#1a56db]/10 text-[#202124]"
                            : "text-[#5f6368] hover:bg-[#f1f3f4]",
                        )}
                      >
                        {item.icon && (
                          <span className={cn("h-4 w-4 flex-shrink-0", idx === activeIndex ? "text-[#1a56db]" : "")}>
                            {item.icon}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium truncate block">{item.label}</span>
                          {item.description && (
                            <span className="text-[11px] text-[#5f6368]/60 truncate block">
                              {item.description}
                            </span>
                          )}
                        </div>
                        {item.shortcut && (
                          <kbd className="text-[10px] text-[#5f6368]/50 border border-white/[0.1] rounded px-1.5 py-0.5 flex-shrink-0">
                            {item.shortcut}
                          </kbd>
                        )}
                        {idx === activeIndex && (
                          <ArrowRight className="h-3 w-3 text-[#1a56db] flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-white/[0.07] flex items-center gap-4 text-[10px] text-[#5f6368]/50">
          <span><kbd className="border border-white/[0.1] rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="border border-white/[0.1] rounded px-1">↵</kbd> select</span>
          <span><kbd className="border border-white/[0.1] rounded px-1">ESC</kbd> close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
