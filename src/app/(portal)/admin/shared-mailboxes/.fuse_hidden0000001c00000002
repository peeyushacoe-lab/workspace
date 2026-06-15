"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Mail, Plus, Trash2, Users, X, ChevronDown, ChevronRight,
  Loader2, Search, UserMinus, UserPlus, CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type Member = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  displayName?: string | null;
  avatarUrl?: string;
};

type MailboxAccess = {
  id: string;
  userId: string;
  role: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: string;
    displayName?: string | null;
  };
};

type SharedMailbox = {
  id: string;
  email: string;
  displayName: string;
  isShared: boolean;
  createdAt: string;
  accessLogs: MailboxAccess[];
  redisMemberIds: string[];
};

// ─── Utility ─────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = [
  "bg-cyan-700",
  "bg-indigo-700",
  "bg-violet-700",
  "bg-emerald-700",
  "bg-rose-700",
  "bg-amber-700",
];

function avatarColor(id: string): string {
  const sum = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length] ?? "bg-cyan-700";
}

// ─── Avatar Stack ─────────────────────────────────────────────────────────────

function AvatarStack({ members, max = 3 }: { members: { id: string; fullName: string }[]; max?: number }) {
  const visible = members.slice(0, max);
  const overflow = members.length - max;
  return (
    <div className="flex items-center -space-x-2">
      {visible.map((m) => (
        <div
          key={m.id}
          title={m.fullName}
          className={`w-7 h-7 rounded-full border-2 border-[#1b1f2e] flex items-center justify-center text-[10px] font-semibold text-white ${avatarColor(m.id)}`}
        >
          {initials(m.fullName)}
        </div>
      ))}
      {overflow > 0 && (
        <div className="w-7 h-7 rounded-full border-2 border-[#1b1f2e] bg-[#2a3044] flex items-center justify-center text-[10px] font-medium text-[#5f6368]">
          +{overflow}
        </div>
      )}
    </div>
  );
}

// ─── Member Management Panel ──────────────────────────────────────────────────

function MemberPanel({
  mailbox,
  allMembers,
  onUpdated,
}: {
  mailbox: SharedMailbox;
  allMembers: Member[];
  onUpdated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // The canonical member IDs come from redisMemberIds (the Redis set is truth);
  // fall back to accessLogs if Redis is empty.
  const currentIds = new Set(
    mailbox.redisMemberIds.length > 0
      ? mailbox.redisMemberIds
      : mailbox.accessLogs.map((a) => a.userId)
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(currentIds));

  const filteredAll = allMembers.filter(
    (m) =>
      m.fullName.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/shared-mailboxes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mailbox.id, memberIds: [...selectedIds] }),
      });
      if (res.ok) {
        toast.success("Members updated");
        onUpdated();
      } else {
        toast.error("Failed to update members");
      }
    } finally {
      setSaving(false);
    }
  };

  const currentMembers = allMembers.filter((m) => currentIds.has(m.id));
  const nonMembers = allMembers.filter((m) => !currentIds.has(m.id));

  return (
    <div className="border-t border-[#e8eaed] bg-white px-5 py-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Current members */}
        <div>
          <p className="text-[11px] text-[#9aa0a6] mb-2 font-semibold">
            Current Members ({currentMembers.length})
          </p>
          {currentMembers.length === 0 ? (
            <p className="text-xs text-[#bdc1c6] italic">No members yet.</p>
          ) : (
            <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {currentMembers.map((m) => (
                <li key={m.id} className="flex items-center gap-2.5">
                  <div
                    className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-semibold text-white ${avatarColor(m.id)}`}
                  >
                    {initials(m.fullName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[#202124] truncate">{m.fullName}</p>
                    <p className="text-[10px] text-[#9aa0a6] truncate">{m.email}</p>
                  </div>
                  <button
                    onClick={() => toggle(m.id)}
                    title="Remove member"
                    className="p-1 text-[#9aa0a6] hover:text-red-400 transition-colors"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add members */}
        <div>
          <p className="text-[11px] text-[#9aa0a6] mb-2 font-semibold">
            Add Member
          </p>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9aa0a6]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users…"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-[#e8eaed] rounded-lg text-[#202124] placeholder-[#454e63] focus:outline-none focus:border-[#1a56db]/40"
            />
          </div>
          <ul className="space-y-1 max-h-44 overflow-y-auto pr-1">
            {filteredAll.filter((m) => !currentIds.has(m.id)).map((m) => (
              <li key={m.id} className="flex items-center gap-2.5">
                <div
                  className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-semibold text-white ${avatarColor(m.id)}`}
                >
                  {initials(m.fullName)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#202124] truncate">{m.fullName}</p>
                  <p className="text-[10px] text-[#9aa0a6] truncate">{m.email}</p>
                </div>
                <button
                  onClick={() => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      next.add(m.id);
                      return next;
                    });
                    // Optimistically show in current list
                    onUpdated();
                    // Actually patch immediately
                    void (async () => {
                      const merged = new Set(currentIds);
                      merged.add(m.id);
                      const res = await fetch("/api/admin/shared-mailboxes", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: mailbox.id, memberIds: [...merged] }),
                      });
                      if (res.ok) {
                        toast.success(`${m.fullName} added`);
                        onUpdated();
                      } else {
                        toast.error("Failed to add member");
                      }
                    })();
                  }}
                  title="Add member"
                  className="p-1 text-[#9aa0a6] hover:text-[#1a56db] transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
            {filteredAll.filter((m) => !currentIds.has(m.id)).length === 0 && (
              <li className="text-xs text-[#bdc1c6] italic py-1">
                {search ? "No users match your search." : "All users are already members."}
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-[#e8eaed]">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#1a56db]/10 text-[#1a56db] border border-[#1a56db]/20 hover:bg-[#1a56db]/20 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Save Members
        </button>
      </div>
    </div>
  );
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateModal({
  allMembers,
  onClose,
  onCreated,
}: {
  allMembers: Member[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const filtered = allMembers.filter(
    (m) =>
      m.fullName.toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.email.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const toggleMember = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!email.trim() || !displayName.trim()) {
      toast.error("Email and display name are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/shared-mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          displayName: displayName.trim(),
          description: description.trim() || undefined,
          memberIds: [...selectedIds],
        }),
      });
      if (res.ok) {
        toast.success("Shared mailbox created");
        onCreated();
        onClose();
      } else {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? "Failed to create mailbox");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 "
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#e8eaed] rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#e8eaed]">
          <Mail className="w-4 h-4 text-[#1a56db] flex-shrink-0" />
          <p className="flex-1 text-sm font-semibold text-[#202124]">New Shared Mailbox</p>
          <button onClick={onClose} className="p-1 text-[#9aa0a6] hover:text-[#5f6368]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Email */}
          <div>
            <label className="block text-[11px] text-[#9aa0a6] mb-1.5 font-semibold">
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="support@cybersage.uk"
              className="w-full px-3 py-2 text-sm bg-white border border-[#e8eaed] rounded-lg text-[#202124] placeholder-[#454e63] font-mono focus:outline-none focus:border-[#1a56db]/40"
            />
          </div>

          {/* Display name */}
          <div>
            <label className="block text-[11px] text-[#9aa0a6] mb-1.5 font-semibold">
              Display name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Support Team"
              className="w-full px-3 py-2 text-sm bg-white border border-[#e8eaed] rounded-lg text-[#202124] placeholder-[#454e63] focus:outline-none focus:border-[#1a56db]/40"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] text-[#9aa0a6] mb-1.5 font-semibold">
              Description <span className="normal-case text-[#bdc1c6]">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Handles inbound customer support requests."
              rows={2}
              className="w-full px-3 py-2 text-sm bg-white border border-[#e8eaed] rounded-lg text-[#202124] placeholder-[#454e63] focus:outline-none focus:border-[#1a56db]/40 resize-none"
            />
          </div>

          {/* Members */}
          <div>
            <label className="block text-[11px] text-[#9aa0a6] mb-1.5 font-semibold">
              Members ({selectedIds.size} selected)
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9aa0a6]" />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Filter users…"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-[#e8eaed] rounded-lg text-[#202124] placeholder-[#454e63] focus:outline-none focus:border-[#1a56db]/40"
              />
            </div>
            <ul className="space-y-1 max-h-44 overflow-y-auto border border-[#e8eaed] rounded-lg p-1.5 bg-white">
              {filtered.map((m) => {
                const selected = selectedIds.has(m.id);
                return (
                  <li
                    key={m.id}
                    onClick={() => toggleMember(m.id)}
                    className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${selected ? "bg-[#1a56db]/10" : "hover:bg-white"}`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-semibold text-white ${avatarColor(m.id)}`}
                    >
                      {initials(m.fullName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#202124] truncate">{m.fullName}</p>
                      <p className="text-[10px] text-[#9aa0a6] truncate">{m.email}</p>
                    </div>
                    {selected && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#1a56db] flex-shrink-0" />
                    )}
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="text-xs text-[#bdc1c6] italic py-2 text-center">No users found.</li>
              )}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-[#e8eaed]">
          <button
            onClick={() => void submit()}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#1a56db]/10 text-[#1a56db] border border-[#1a56db]/20 hover:bg-[#1a56db]/20 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Create Mailbox
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-[#9aa0a6] hover:text-[#5f6368] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mailbox Card ─────────────────────────────────────────────────────────────

function MailboxCard({
  mailbox,
  allMembers,
  onDeleted,
  onUpdated,
}: {
  mailbox: SharedMailbox;
  allMembers: Member[];
  onDeleted: () => void;
  onUpdated: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const memberIds = mailbox.redisMemberIds.length > 0
    ? mailbox.redisMemberIds
    : mailbox.accessLogs.map((a) => a.userId);

  const members = allMembers.filter((m) => memberIds.includes(m.id));

  const handleDelete = async () => {
    if (!confirm(`Remove shared mailbox ${mailbox.email}? The address will be kept but unshared.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/shared-mailboxes?id=${mailbox.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Shared mailbox removed");
        onDeleted();
      } else {
        toast.error("Failed to remove mailbox");
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white border border-[#e8eaed] rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-4 flex items-center gap-4">
        {/* Icon */}
        <div className="w-10 h-10 rounded-lg bg-[#1a56db]/10 border border-[#1a56db]/20 flex items-center justify-center flex-shrink-0">
          <Mail className="w-5 h-5 text-[#1a56db]" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono font-semibold text-[#202124] truncate">{mailbox.email}</p>
          <p className="text-xs text-[#9aa0a6] truncate mt-0.5">{mailbox.displayName}</p>
        </div>

        {/* Member stack */}
        <div className="hidden sm:flex items-center gap-3">
          {members.length > 0 ? (
            <AvatarStack members={members} max={3} />
          ) : (
            <span className="text-xs text-[#bdc1c6]">No members</span>
          )}
          <span className="text-[11px] text-[#9aa0a6]">
            {members.length} {members.length === 1 ? "member" : "members"}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#f1f3f4] text-[#5f6368] hover:text-[#202124] hover:bg-[#2e3348] transition-colors border border-[#e8eaed]"
          >
            <Users className="w-3.5 h-3.5" />
            Manage Members
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={() => void handleDelete()}
            disabled={deleting}
            title="Remove shared designation"
            className="p-2 text-[#9aa0a6] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-40"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expandable member panel */}
      {expanded && (
        <MemberPanel
          mailbox={mailbox}
          allMembers={allMembers}
          onUpdated={onUpdated}
        />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SharedMailboxesPage() {
  const [mailboxes, setMailboxes] = useState<SharedMailbox[]>([]);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const loadMailboxes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/shared-mailboxes");
      if (res.ok) setMailboxes(await res.json() as SharedMailbox[]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMembers = useCallback(async () => {
    const res = await fetch("/api/workspace/members");
    if (res.ok) setAllMembers(await res.json() as Member[]);
  }, []);

  useEffect(() => {
    void loadMailboxes();
    void loadMembers();
  }, [loadMailboxes, loadMembers]);

  return (
    <div className="min-h-screen bg-white text-[#202124]">
      <PageHeader
        eyebrow="Admin"
        title="Shared Mailboxes"
        description="Shared mailboxes let multiple team members read and respond to a shared address — support@, sales@, billing@ — without sharing passwords."
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[#1a56db]/10 text-[#1a56db] border border-[#1a56db]/20 hover:bg-[#1a56db]/20 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Shared Mailbox
          </button>
        }
      />

      <div className="px-6 pb-10 max-w-5xl">
        {/* Summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-6">
          {[
            {
              label: "Shared mailboxes",
              value: mailboxes.length,
              color: "text-[#1a56db]",
            },
            {
              label: "Total members",
              value: new Set(mailboxes.flatMap((mb) => mb.redisMemberIds)).size,
              color: "text-indigo-400",
            },
            {
              label: "Active",
              value: mailboxes.filter((mb) => mb.isShared).length,
              color: "text-emerald-400",
            },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="bg-white border border-[#e8eaed] rounded-xl p-4 flex items-center gap-3"
            >
              <div>
                <p className="text-[10px] text-[#9aa0a6]">{label}</p>
                <p className={`font-semibold text-lg ${color}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-3 text-[#9aa0a6]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading shared mailboxes…</span>
          </div>
        ) : mailboxes.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#1a56db]/10 border border-[#1a56db]/20 flex items-center justify-center">
              <Mail className="w-7 h-7 text-[#1a56db]/60" />
            </div>
            <div>
              <p className="text-[#5f6368] font-medium">No shared mailboxes yet.</p>
              <p className="text-sm text-[#9aa0a6] mt-1 max-w-sm">
                Create one for <span className="font-mono text-[#5f6368]">support@</span>,{" "}
                <span className="font-mono text-[#5f6368]">sales@</span>, or{" "}
                <span className="font-mono text-[#5f6368]">billing@</span> to let your team
                collaborate on a shared inbox.
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#1a56db]/10 text-[#1a56db] border border-[#1a56db]/20 hover:bg-[#1a56db]/20 transition-colors mt-1"
            >
              <Plus className="w-4 h-4" />
              Create Shared Mailbox
            </button>
          </div>
        ) : mailboxes.length > 5 ? (
          /* Table layout for many mailboxes */
          <div className="bg-white border border-[#e8eaed] rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[#e8eaed]">
              <Mail className="w-4 h-4 text-[#1a56db]" />
              <span className="text-sm font-medium">Shared Mailboxes</span>
              <span className="ml-auto text-xs text-[#9aa0a6]">{mailboxes.length} total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#f0f0f0] text-[#9aa0a6] text-xs">
                    <th className="text-left px-5 py-2.5 font-medium">Address</th>
                    <th className="text-left px-5 py-2.5 font-medium hidden sm:table-cell">Display Name</th>
                    <th className="text-left px-5 py-2.5 font-medium">Members</th>
                    <th className="text-right px-5 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {mailboxes.map((mb) => {
                    const memberIds = mb.redisMemberIds.length > 0
                      ? mb.redisMemberIds
                      : mb.accessLogs.map((a) => a.userId);
                    const members = allMembers.filter((m) => memberIds.includes(m.id));
                    return (
                      <tr
                        key={mb.id}
                        className="border-b border-[#f0f0f0] hover:bg-[#f1f3f4]/30"
                      >
                        <td className="px-5 py-3 font-mono text-xs text-[#202124]">{mb.email}</td>
                        <td className="px-5 py-3 text-xs text-[#5f6368] hidden sm:table-cell">{mb.displayName}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <AvatarStack members={members} max={3} />
                            <span className="text-xs text-[#9aa0a6]">{members.length}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                // Scroll to expand — simpler: just render a modal approach
                                toast.info("Use card view for member management.");
                              }}
                              className="px-2.5 py-1 text-[10px] font-semibold rounded bg-[#f1f3f4] text-[#5f6368] hover:text-[#202124] border border-[#e8eaed] transition-colors"
                            >
                              Members
                            </button>
                            <button
                              onClick={() => {
                                void (async () => {
                                  if (!confirm(`Remove shared mailbox ${mb.email}?`)) return;
                                  const res = await fetch(`/api/admin/shared-mailboxes?id=${mb.id}`, {
                                    method: "DELETE",
                                  });
                                  if (res.ok) {
                                    toast.success("Removed");
                                    void loadMailboxes();
                                  } else {
                                    toast.error("Failed");
                                  }
                                })();
                              }}
                              className="p-1 text-[#9aa0a6] hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Card layout for 5 or fewer */
          <div className="space-y-3">
            {mailboxes.map((mb) => (
              <MailboxCard
                key={mb.id}
                mailbox={mb}
                allMembers={allMembers}
                onDeleted={() => void loadMailboxes()}
                onUpdated={() => void loadMailboxes()}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          allMembers={allMembers}
          onClose={() => setShowCreate(false)}
          onCreated={() => void loadMailboxes()}
        />
      )}
    </div>
  );
}
