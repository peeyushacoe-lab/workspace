"use client";

import { useState, useEffect } from "react";
import { Shield, Search, X, ChevronDown, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Shell";
import type { UserRole } from "@/generated/prisma/enums";
import { roleLabels } from "@/lib/auth";

const GRANTABLE_ACCESS = [
  "HR",
  "Finance",
  "Legal",
  "Marketing",
  "Security Operations",
  "Operations",
  "Executive",
  "IT",
  "R&D",
] as const;

type GrantableAccess = (typeof GRANTABLE_ACCESS)[number];

type UserWithRoles = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  avatarUrl: string | null;
  grantedRoles: string[];
};

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const sz = size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm";
  return (
    <div className={`${sz} rounded-full bg-gradient-to-br from-[#00d2ff]/20 to-[#7dd8f5]/10 border border-[rgba(0,210,255,0.2)] flex items-center justify-center font-semibold text-[#00d2ff] flex-shrink-0`}>
      {initials}
    </div>
  );
}

function RoleBadge({ role, onRevoke, disabled }: { role: string; onRevoke: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onRevoke}
      disabled={disabled}
      title={`Click to revoke ${role} access`}
      className="group flex items-center gap-1 bg-[#00d2ff]/10 text-[#7dd8f5] border border-[#00d2ff]/20 px-2.5 py-1 rounded-full text-xs font-semibold hover:bg-[#ff4d6d]/10 hover:text-[#ff9db0] hover:border-[#ff4d6d]/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {role}
      <X className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

function GrantDropdown({
  currentRoles,
  onGrant,
  disabled,
}: {
  currentRoles: string[];
  onGrant: (role: GrantableAccess) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const available = GRANTABLE_ACCESS.filter((r) => !currentRoles.includes(r));

  if (available.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1 text-xs text-[#5d6579] hover:text-[#00d2ff] border border-dashed border-[rgba(255,255,255,0.11)] hover:border-[#00d2ff]/40 px-2 py-1 rounded-full transition-colors disabled:opacity-40"
      >
        + Grant access
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 w-48 bg-[#1b1f2e] border border-[rgba(255,255,255,0.08)] rounded-xl shadow-xl overflow-hidden">
            {available.map((role) => (
              <button
                key={role}
                onClick={() => { onGrant(role); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-[#9aa3b8] hover:bg-[#262939] hover:text-[#dfe1f6] transition-colors"
              >
                {role}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function AccessPage() {
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null); // userId being saved

  useEffect(() => {
    fetch("/api/admin/rbac")
      .then((r) => r.json())
      .then((data: UserWithRoles[]) => setUsers(data))
      .catch(() => toast.error("Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  const applyChange = async (userId: string, role: string, action: "grant" | "revoke") => {
    setSaving(userId);
    try {
      const res = await fetch("/api/admin/rbac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role, action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed");
      }
      const { grantedRoles } = await res.json() as { grantedRoles: string[] };
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, grantedRoles } : u));
      if (action === "grant") {
        toast.success(`${role} access granted — email notification sent`);
      } else {
        toast.success(`${role} access revoked`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update access");
    } finally {
      setSaving(null);
    }
  };

  const filtered = users.filter(
    (u) =>
      !query ||
      u.fullName.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase()) ||
      u.role.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0f1321] text-[#dfe1f6]">
      <PageHeader
        eyebrow="Security · CISO"
        title="Role-Based Access Control"
        description="Grant additional access categories to team members. Users receive an email when access is granted."
      />

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Info banner */}
        <div className="flex items-start gap-3 bg-[#00d2ff]/5 border border-[#00d2ff]/15 rounded-xl px-4 py-3">
          <Shield className="w-4 h-4 text-[#00d2ff] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[#9aa3b8] leading-relaxed">
            Granted roles give users additional access beyond their primary role. Users receive an email when access is granted.
            Click a role badge to revoke it. Use the <strong className="text-[#dfe1f6]">+ Grant access</strong> button to add new access categories.
          </p>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-[#1b1f2e] border border-[rgba(255,255,255,0.08)] rounded-xl px-4 py-2.5">
          <Search className="w-4 h-4 text-[#5d6579]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, or role…"
            className="flex-1 bg-transparent text-sm text-[#dfe1f6] placeholder-[#5d6579] outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-[#5d6579] hover:text-[#9aa3b8]">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Access categories legend */}
        <div className="bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-xl p-4">
          <p className="text-xs font-semibold text-[#5d6579] mb-3">Available Access Categories</p>
          <div className="flex flex-wrap gap-2">
            {GRANTABLE_ACCESS.map((r) => (
              <span key={r} className="text-xs text-[#9aa3b8] bg-[#262939] border border-[rgba(255,255,255,0.06)] px-2.5 py-1 rounded-full">
                {r}
              </span>
            ))}
          </div>
        </div>

        {/* User list */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[#9aa3b8]" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-[#5d6579] text-sm py-8">No users found</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((user) => (
              <div
                key={user.id}
                className="bg-[#1b1f2e] border border-[rgba(255,255,255,0.06)] rounded-xl px-5 py-4 flex items-start gap-4 hover:border-[rgba(255,255,255,0.11)] transition-colors"
              >
                <Avatar name={user.fullName} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-sm text-[#dfe1f6]">{user.fullName}</span>
                    <span className="text-[10px] text-[#5d6579] bg-[#262939] border border-[rgba(255,255,255,0.06)] px-1.5 py-0.5 rounded-full">
                      {roleLabels[user.role] ?? user.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[#5d6579] text-xs mb-3">
                    <Mail className="w-3 h-3" />
                    <span>{user.email}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {user.grantedRoles.length > 0 ? (
                      user.grantedRoles.map((role) => (
                        <RoleBadge
                          key={role}
                          role={role}
                          disabled={saving === user.id}
                          onRevoke={() => void applyChange(user.id, role, "revoke")}
                        />
                      ))
                    ) : (
                      <span className="text-xs text-[#5d6579] italic">No additional access granted</span>
                    )}
                    <GrantDropdown
                      currentRoles={user.grantedRoles}
                      disabled={saving === user.id}
                      onGrant={(role) => void applyChange(user.id, role, "grant")}
                    />
                    {saving === user.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#9aa3b8]" />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
