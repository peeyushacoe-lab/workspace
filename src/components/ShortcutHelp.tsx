"use client";

import { useEffect, useState } from "react";
import { Keyboard, X } from "lucide-react";

/**
 * Keyboard-shortcut reference, opened with ⌘/ (Ctrl+/) — the convention Google
 * Docs, Slack, GitHub and Linear all share.
 *
 * Every editor already implements its shortcuts; none of them were discoverable.
 */

export type ShortcutGroup = { title: string; items: [keys: string, action: string][] };

/** Shortcuts common to every editor. */
const UNIVERSAL: ShortcutGroup = {
  title: "General",
  items: [
    ["⌘ /", "Show this list"],
    ["⌘ S", "Save (autosave is always on)"],
    ["⌘ Z", "Undo"],
    ["⌘ ⇧ Z", "Redo"],
    ["⌘ F", "Find"],
    ["⌘ P", "Print"],
    ["Esc", "Close panel or menu"],
  ],
};

export const DOCS_SHORTCUTS: ShortcutGroup[] = [
  UNIVERSAL,
  {
    title: "Formatting",
    items: [
      ["⌘ B", "Bold"],
      ["⌘ I", "Italic"],
      ["⌘ U", "Underline"],
      ["⌘ ⇧ X", "Strikethrough"],
      ["⌘ K", "Insert link"],
      ["⌘ ⇧ 7", "Numbered list"],
      ["⌘ ⇧ 8", "Bulleted list"],
      ["⌘ \\", "Clear formatting"],
    ],
  },
  {
    title: "Editing",
    items: [
      ["⌘ H", "Find and replace"],
      ["Tab", "Increase indent"],
      ["⇧ Tab", "Decrease indent"],
      ["⌘ ↵", "Post a comment"],
    ],
  },
];

export const SHEETS_SHORTCUTS: ShortcutGroup[] = [
  UNIVERSAL,
  {
    title: "Navigation",
    items: [
      ["Arrows", "Move selection"],
      ["Tab", "Move right"],
      ["↵", "Move down / confirm edit"],
      ["⇧ + Arrows", "Extend selection"],
      ["Esc", "Cancel edit"],
    ],
  },
  {
    title: "Editing",
    items: [
      ["⌘ B / I / U", "Bold / italic / underline"],
      ["⌘ C / X / V", "Copy / cut / paste (TSV, Excel-compatible)"],
      ["⌘ H", "Find and replace"],
      ["Type to edit", "Start typing to replace a cell"],
      ["Drag fill handle", "Continue a series"],
      ["Right-click", "Row/column and formatting menu"],
    ],
  },
];

export const SLIDES_SHORTCUTS: ShortcutGroup[] = [
  UNIVERSAL,
  {
    title: "Presenting",
    items: [
      ["→ / Space", "Next slide"],
      ["←", "Previous slide"],
      ["Esc", "Exit presenter mode"],
    ],
  },
  {
    title: "Editing",
    items: [
      ["⌘ F", "Find and replace across slides"],
      ["Delete", "Remove the selected element"],
      ["Drag", "Move an element"],
      ["Drag corner", "Resize an element"],
    ],
  },
];

/**
 * Registers the ⌘/ listener and renders the dialog.
 * Drop one of these into any editor with the matching shortcut set.
 */
export function ShortcutHelp({ groups }: { groups: ShortcutGroup[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setOpen(v => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay backdrop-blur-sm p-4"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] overflow-y-auto bg-surface border border-border
                   rounded-panel shadow-pop"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border-soft sticky top-0 bg-surface">
          <Keyboard className="w-4 h-4 text-muted" />
          <h2 className="text-sm font-semibold text-foreground tracking-tight">Keyboard shortcuts</h2>
          <button
            onClick={() => setOpen(false)}
            className="ml-auto p-1.5 rounded-md text-subtle hover:text-foreground hover:bg-hover transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5 p-5">
          {groups.map(group => (
            <section key={group.title}>
              <h3 className="text-xs font-medium text-muted mb-2">{group.title}</h3>
              <ul className="space-y-1.5">
                {group.items.map(([keys, action]) => (
                  <li key={keys} className="flex items-baseline justify-between gap-3">
                    <span className="text-xs text-foreground">{action}</span>
                    <kbd
                      className="flex-shrink-0 px-1.5 py-0.5 rounded border border-border bg-surface-sunken
                                 text-[10px] font-medium text-muted whitespace-nowrap"
                    >
                      {keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="px-5 pb-4 text-[10px] text-subtle">
          On Windows and Linux, use Ctrl in place of ⌘.
        </p>
      </div>
    </div>
  );
}
