"use client";

import { useEffect, useState } from "react";
import { X, UserPlus, Trash2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

type ShareEntry = {
  userId: string;
  role: string;
  name?: string;
  email?: string;
};

type Props = {
  docId: string;
  docType: "sheet" | "pres";
  onClose: () => void;
};

export function DocShareModal({ docId, docType, onClose }: Props) {
  const apiBase = docType === "sheet" ? `/api/sheets/${docId}/share` : `/api/slides/${docId}/share`;
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [_ownerId, setOwnerId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("editor");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch(apiBase)
      .then((r) => r.json())
      .then((d: { shares: ShareEntry[]; ownerId: string }) => {
        setShares(d.shares ?? []);
        setOwnerId(d.ownerId ?? "");
      })
      .catch(() => toast.error("Failed to load share settings"))
      .finally(() => setLoading(false));
  }, [apiBase]);

  async function addShare() {
    if (!email.trim()) return;
    setAdding(true);
    try {
      const r = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const d = await r.json() as ShareEntry & { error?: string };
      if (!r.ok) { toast.error(d.error ?? "Failed to share"); return; }
      setShares((prev) => [...prev.filter((s) => s.userId !== d.userId), d]);
      setEmail("");
      toast.success(`Shared with ${d.name ?? d.email}`);
    } finally { setAdding(false); }
  }

  async function removeShare(userId: string) {
    await fetch(apiBase, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setShares((prev) => prev.filter((s) => s.userId !== userId));
    toast.success("Access removed");
  }

  async function updateRole(userId: string, newRole: "viewer" | "editor") {
    await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: newRole }),
    });
    setShares((prev) => prev.map((s) => s.userId === userId ? { ...s, role: newRole } : s));
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-[#e8eaed]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8eaed]">
          <h2 className="text-sm font-semibold text-[#202124]">Share {docType === "sheet" ? "Spreadsheet" : "Presentation"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[#f1f3f4] text-[#5f6368]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Add person */}
        <div className="px-5 py-4 border-b border-[#e8eaed]">
          <label className="text-xs font-medium text-[#5f6368] mb-1.5 block">Add people</label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#80868b]" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addShare()}
                placeholder="Email address"
                className="w-full pl-8 pr-3 py-2 text-sm bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-[#202124] placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60 focus:ring-2 focus:ring-[#1a56db]/20"
              />
            </div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "viewer" | "editor")}
              className="px-2 py-2 text-xs bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-[#202124] focus:outline-none"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              onClick={addShare}
              disabled={adding || !email.trim()}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-[#1a56db] text-white hover:bg-[#1648c7] disabled:opacity-50 transition-colors flex items-center gap-1"
            >
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              Share
            </button>
          </div>
        </div>

        {/* People list */}
        <div className="px-5 py-3 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[#1a56db]" /></div>
          ) : shares.length === 0 ? (
            <p className="text-xs text-[#80868b] text-center py-4">Only you have access</p>
          ) : (
            <ul className="space-y-2">
              {shares.map((s) => (
                <li key={s.userId} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#1a56db] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {(s.name ?? s.email ?? "?")[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#202124] truncate">{s.name ?? s.email}</p>
                    {s.name && <p className="text-[11px] text-[#80868b] truncate">{s.email}</p>}
                  </div>
                  <select
                    value={s.role}
                    onChange={(e) => updateRole(s.userId, e.target.value as "viewer" | "editor")}
                    className="text-xs bg-transparent border border-[#e8eaed] rounded px-1.5 py-1 text-[#5f6368] focus:outline-none"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button onClick={() => removeShare(s.userId)}
                    className="p-1 rounded hover:bg-[#f1f3f4] text-[#80868b] hover:text-[#ea4335] transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t border-[#e8eaed]">
          <p className="text-[11px] text-[#80868b]">
            <span className="font-medium">Editors</span> can edit and share.{" "}
            <span className="font-medium">Viewers</span> can only read.
          </p>
        </div>
      </div>
    </div>
  );
}
