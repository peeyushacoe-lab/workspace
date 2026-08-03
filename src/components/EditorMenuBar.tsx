"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";

/**
 * The named menu bar shared by Sage Docs, Sheets and Slides.
 *
 * Every desktop editor since 1984 has one, for a reason icon toolbars can't
 * match: a menu is the only place a command can be *named*. Docs shipped with
 * import and export hidden behind an unlabelled download glyph, which for
 * discovery purposes is identical to not shipping them at all.
 *
 * Menus are data, not JSX, so the three apps can't drift into three different
 * interaction models — the open/close, hover-to-switch and Escape behaviour is
 * defined once here.
 */

export type MenuEntry =
  | {
      kind: "item";
      label: string;
      onSelect: () => void;
      /** Right-aligned shortcut. Only set this if the shortcut is actually
       *  wired — a menu that advertises a key that does nothing is worse than
       *  one that says nothing. */
      hint?: string;
      checked?: boolean;
      danger?: boolean;
      disabled?: boolean;
    }
  /** A file picker rendered as a menu row, for Import. */
  | { kind: "file"; label: string; accept: string; onFile: (e: React.ChangeEvent<HTMLInputElement>) => void }
  | { kind: "sep" }
  | { kind: "label"; label: string };

export type EditorMenu = { id: string; label: string; entries: MenuEntry[] };

export function EditorMenuBar({ menus, width = 264 }: { menus: EditorMenu[]; width?: number }) {
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    // A click anywhere outside the bar dismisses. The bar itself stops
    // propagation, so this only ever fires for genuine outside clicks.
    const onDown = () => setOpen(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onDown);
    };
  }, [open]);

  return (
    <div
      className="flex items-center gap-0.5 border-b border-border bg-surface px-3 py-1"
      onClick={e => e.stopPropagation()}
    >
      {menus.map(menu => (
        <div key={menu.id} className="relative">
          <button
            onClick={() => setOpen(o => (o === menu.id ? null : menu.id))}
            // Once any menu is open, hovering a sibling switches to it without
            // a second click — standard menu-bar behaviour.
            onMouseEnter={() => setOpen(o => (o ? menu.id : o))}
            aria-haspopup="menu"
            aria-expanded={open === menu.id}
            className={`rounded-md px-2.5 py-1 text-[13px] transition-colors ${
              open === menu.id
                ? "bg-hover text-foreground"
                : "text-muted hover:bg-hover hover:text-foreground"
            }`}
          >
            {menu.label}
          </button>

          {open === menu.id && (
            <div
              role="menu"
              style={{ width }}
              className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-border bg-surface py-1 shadow-pop"
            >
              {menu.entries.map((entry, i) => {
                if (entry.kind === "sep") {
                  return <div key={i} className="my-1 h-px bg-border-soft" />;
                }
                if (entry.kind === "label") {
                  return (
                    <p key={i} className="px-3 pb-0.5 pt-1.5 text-[11px] font-medium text-subtle">
                      {entry.label}
                    </p>
                  );
                }
                if (entry.kind === "file") {
                  return (
                    <label
                      key={i}
                      className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px]
                                 text-foreground transition-colors hover:bg-hover"
                    >
                      {entry.label}
                      <input
                        type="file"
                        accept={entry.accept}
                        className="hidden"
                        onChange={e => { entry.onFile(e); setOpen(null); }}
                      />
                    </label>
                  );
                }
                return (
                  <button
                    key={i}
                    role="menuitem"
                    disabled={entry.disabled}
                    onClick={() => { setOpen(null); entry.onSelect(); }}
                    className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors
                                disabled:cursor-not-allowed disabled:opacity-40 ${
                      entry.danger ? "text-crit hover:bg-crit-soft" : "text-foreground hover:bg-hover"
                    }`}
                  >
                    {entry.label}
                    {entry.checked && <Check className="ml-auto h-3.5 w-3.5 text-accent" />}
                    {entry.hint && !entry.checked && (
                      <span className="ml-auto pl-4 text-[11px] text-subtle">{entry.hint}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
