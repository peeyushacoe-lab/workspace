"use client";

import { peerInitials, type DocPeer } from "@/lib/use-doc-presence";

/**
 * Avatar stack of everyone else currently editing a document.
 * Shared by SheetsEditor and SlidesEditor; renders nothing when alone.
 */
export function DocPresenceBar({
  peers,
  max = 4,
  /** Optional per-peer suffix, e.g. "B7" or "Slide 3". */
  describe,
}: {
  peers: DocPeer[];
  max?: number;
  describe?: (peer: DocPeer) => string | undefined;
}) {
  if (peers.length === 0) return null;

  const shown = peers.slice(0, max);
  const overflow = peers.length - shown.length;

  return (
    <div className="flex items-center -space-x-1.5" aria-label={`${peers.length} other editor${peers.length === 1 ? "" : "s"}`}>
      {shown.map(peer => {
        const detail = describe?.(peer);
        return (
          <div
            key={peer.userId}
            title={detail ? `${peer.name} — ${detail}` : peer.name}
            className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold
                       text-white ring-2 ring-surface select-none"
            style={{ backgroundColor: peer.color }}
          >
            {peerInitials(peer.name)}
          </div>
        );
      })}
      {overflow > 0 && (
        <div
          title={peers.slice(max).map(p => p.name).join(", ")}
          className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold
                     bg-surface-sunken text-muted ring-2 ring-surface select-none"
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
