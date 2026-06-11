import { useState, useEffect } from "react";
import { createChannel, getWorkspaceMembers, type WorkspaceMember } from "@/api/client";

export function NewChannelModal({
  onClose, onCreated, defaultDM,
}: {
  onClose: () => void;
  onCreated: (channelId: string) => void;
  defaultDM?: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isDM, setIsDM] = useState(defaultDM ?? false);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getWorkspaceMembers().then(setMembers).catch(() => {});
  }, []);

  function toggleMember(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (isDM && next.size >= 1) return next;
        next.add(id);
      }
      return next;
    });
  }

  async function handleCreate() {
    if (isDM && selectedIds.size === 0) {
      setError("Pick someone to message.");
      return;
    }
    if (!isDM && !name.trim()) {
      setError("Channel name is required.");
      return;
    }

    setCreating(true);
    setError("");
    try {
      const selected = members.find(m => selectedIds.has(m.id));
      const ch = await createChannel({
        name: isDM ? `DM: ${selected?.fullName ?? "Direct"}` : name.trim(),
        description: description || undefined,
        type: isDM ? "DM" : "CHANNEL",
        isPrivate: isDM ? true : isPrivate,
        memberIds: Array.from(selectedIds),
      });
      onCreated(ch.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  const filteredMembers = members.filter(m =>
    m.fullName.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.email.toLowerCase().includes(memberSearch.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 no-select">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !creating && onClose()} />

      <div className="relative w-full max-w-[480px] max-h-[80vh] rounded-xl border border-brand-border bg-bg-card shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-brand-border px-4">
          <h3 className="text-sm font-semibold text-text-primary">
            {isDM ? "Start a direct message" : "Create a channel"}
          </h3>
          <button onClick={onClose} disabled={creating} className="text-text-muted hover:text-text-primary transition-fast">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Type toggle */}
        <div className="flex-shrink-0 flex border-b border-brand-border">
          <button
            onClick={() => setIsDM(false)}
            className={`flex-1 py-2 text-xs font-medium transition-fast ${
              !isDM ? "text-brand border-b-2 border-brand bg-brand-dim/30" : "text-text-muted hover:text-text-secondary"
            }`}
          >
            Channel
          </button>
          <button
            onClick={() => setIsDM(true)}
            className={`flex-1 py-2 text-xs font-medium transition-fast ${
              isDM ? "text-brand border-b-2 border-brand bg-brand-dim/30" : "text-text-muted hover:text-text-secondary"
            }`}
          >
            Direct Message
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!isDM && (
            <>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-text-muted mb-1">Name</label>
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value.replace(/^#/, "").replace(/\s+/g, "-").toLowerCase())}
                  placeholder="e.g. product-design"
                  className="w-full rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary placeholder-text-muted/50 outline-none focus:border-brand/40"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-text-muted mb-1">Description (optional)</label>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What is this channel for?"
                  className="w-full rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary placeholder-text-muted/50 outline-none focus:border-brand/40"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} className="accent-brand" />
                Private — only invited members can join
              </label>
            </>
          )}

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-text-muted mb-1">
              {isDM ? "Pick a person" : `Add members (${selectedIds.size} selected)`}
            </label>
            <input
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              placeholder="Search workspace"
              className="w-full rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary placeholder-text-muted/50 outline-none focus:border-brand/40 mb-2"
            />
            <div className="max-h-[200px] overflow-y-auto space-y-0.5 rounded-md border border-brand-border bg-bg-deep">
              {filteredMembers.length === 0 && (
                <p className="px-3 py-4 text-xs text-text-muted text-center">No members found</p>
              )}
              {filteredMembers.map(m => (
                <button
                  key={m.id}
                  onClick={() => toggleMember(m.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-bg-hover transition-fast ${
                    selectedIds.has(m.id) ? "bg-brand-dim/50" : ""
                  }`}
                >
                  <div className="h-7 w-7 flex-shrink-0 rounded-full bg-brand-dim border border-brand-border flex items-center justify-center text-xs font-bold text-brand">
                    {m.fullName[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-text-primary truncate leading-tight">{m.fullName}</p>
                    <p className="text-[11px] text-text-muted truncate leading-tight">{m.email}</p>
                  </div>
                  {selectedIds.has(m.id) && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00d2ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-end gap-2 border-t border-brand-border px-4 py-3">
          <button onClick={onClose} disabled={creating} className="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-hover transition-fast disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="rounded-md px-4 py-1.5 text-xs font-semibold text-bg-deep transition-smooth disabled:opacity-50"
            style={{
              background: creating ? "rgba(0,210,255,0.5)" : "linear-gradient(135deg, #00d2ff 0%, #0098c7 100%)",
            }}
          >
            {creating ? "Creating…" : (isDM ? "Start DM" : "Create channel")}
          </button>
        </div>
      </div>
    </div>
  );
}
