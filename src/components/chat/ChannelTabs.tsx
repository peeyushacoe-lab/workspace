"use client";

import { useState } from "react";
import {
  FolderOpen, FileText, FileSpreadsheet, Presentation, Columns, Link as LinkIcon,
  Plus, MessageSquare, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabButton, Menu, MenuItem } from "@/components/connect/ui";

/**
 * The tab strip across the top of a channel.
 *
 * This is the structural thing Microsoft Teams has that Nexus did not: a
 * channel with only a message list is a group chat, whereas a channel with
 * Files, a spec Doc, a budget Sheet and a task board pinned above it is the
 * place one piece of work lives.
 *
 * Nexus is better placed to build this than Microsoft was. Teams embeds
 * SharePoint and Planner through an iframe SDK, with the latency and the
 * styling mismatch that implies. Docs, Sheets, Slides, Tasks and Drive are all
 * first-class apps here, so a tab renders natively.
 *
 * See docs/rfc-003-teams-and-channels.md.
 */

export type ChannelTabKind = "FILES" | "DOC" | "SHEET" | "SLIDE" | "BOARD" | "LINK";

export type ChannelTab = {
  id: string;
  kind: ChannelTabKind;
  label: string;
  /** Record id for DOC/SHEET/SLIDE/BOARD, absolute URL for LINK, null for FILES. */
  target: string | null;
  position: number;
};

/** Icon and accent per kind. Colour carries the app identity the tab points at,
 *  so a Sheets tab is green in the strip exactly as it is everywhere else. */
const KIND: Record<ChannelTabKind, { icon: typeof FileText; label: string; accent: string }> = {
  FILES: { icon: FolderOpen,      label: "Files",  accent: "var(--accent)" },
  DOC:   { icon: FileText,        label: "Doc",    accent: "var(--accent)" },
  SHEET: { icon: FileSpreadsheet, label: "Sheet",  accent: "var(--ok)" },
  SLIDE: { icon: Presentation,    label: "Slides", accent: "var(--warn)" },
  BOARD: { icon: Columns,         label: "Board",  accent: "var(--violet)" },
  LINK:  { icon: LinkIcon,        label: "Link",   accent: "var(--violet)" },
};

export function ChannelTabs({
  channelId,
  tabs,
  activeTabId,
  onSelect,
  onChanged,
  canManage = true,
}: {
  channelId: string;
  tabs: ChannelTab[];
  /** null = the conversation itself, which is always the first tab. */
  activeTabId: string | null;
  onSelect: (tabId: string | null) => void;
  /** Called after a tab is added or removed so the parent can refetch. */
  onChanged: () => void;
  canManage?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const addTab = async (kind: ChannelTabKind) => {
    // LINK and the document kinds need a target. Prompting is deliberately
    // crude for now — a real picker belongs here, but a tab you can't create
    // is worse than one created through a prompt.
    let target: string | null = null;
    let label = KIND[kind].label;
    if (kind === "LINK") {
      const url = window.prompt("URL to pin:");
      if (!url) return;
      target = url;
      label = window.prompt("Tab name:", "Link") || "Link";
    } else if (kind !== "FILES") {
      const id = window.prompt(`${KIND[kind].label} id to pin:`);
      if (!id) return;
      target = id;
      label = window.prompt("Tab name:", KIND[kind].label) || KIND[kind].label;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/channels/${channelId}/tabs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, label, target }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setAdding(false);
      onChanged();
      toast.success(`${label} pinned to this channel`);
    } catch {
      toast.error("Could not pin that tab");
    } finally {
      setBusy(false);
    }
  };

  const removeTab = async (tab: ChannelTab) => {
    // Optimistically move off the tab being removed so the pane never renders
    // against a tab that no longer exists.
    if (activeTabId === tab.id) onSelect(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/tabs?tabId=${encodeURIComponent(tab.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(String(res.status));
      onChanged();
    } catch {
      toast.error("Could not remove that tab");
      onChanged();
    }
  };

  const sorted = [...tabs].sort((a, b) => a.position - b.position);

  return (
    <Tabs className="border-b border-border bg-surface px-3">
      {/* The conversation is always first and cannot be removed — a channel
          without its own messages is not a channel. */}
      <TabButton
        icon={MessageSquare}
        label="Conversation"
        accent="var(--accent)"
        active={activeTabId === null}
        onClick={() => onSelect(null)}
      />

      {sorted.map(tab => {
        const meta = KIND[tab.kind];
        return (
          <TabButton
            key={tab.id}
            icon={meta.icon}
            label={tab.label}
            accent={meta.accent}
            active={activeTabId === tab.id}
            onClick={() => onSelect(tab.id)}
            onRemove={canManage ? () => void removeTab(tab) : undefined}
          />
        );
      })}

      {canManage && (
        <div className="relative">
          <button
            onClick={() => setAdding(v => !v)}
            aria-haspopup="menu"
            aria-expanded={adding}
            aria-label="Pin a tab to this channel"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted
                       transition-colors hover:bg-hover hover:text-foreground"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>

          {adding && (
            // Previously click-outside was explicitly unhandled here ("the
            // parent's own dismiss" — there wasn't one), so the picker only
            // closed via Escape or picking an item. Menu wires both.
            <Menu onClose={() => setAdding(false)} className="absolute left-0 top-full mt-1 w-56">
              <p className="px-3 pb-1 pt-1.5 text-[11px] font-medium text-subtle">Pin to this channel</p>
              {(Object.keys(KIND) as ChannelTabKind[]).map(kind => (
                <MenuItem
                  key={kind}
                  icon={KIND[kind].icon}
                  label={KIND[kind].label}
                  iconColor={KIND[kind].accent}
                  disabled={busy}
                  onClick={() => void addTab(kind)}
                />
              ))}
            </Menu>
          )}
        </div>
      )}
    </Tabs>
  );
}
