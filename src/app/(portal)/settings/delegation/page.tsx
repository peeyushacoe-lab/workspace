"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Plus,
  Trash2,
  Loader2,
  Mail,
  X,
  UserCheck,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────────

type GrantedEntry = {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  user: {
    fullName: string;
    email: string;
    role: string;
  };
};

type ReceivedEntry = {
  id: string;
  mailboxId: string;
  role: string;
  createdAt: string;
  mailbox: {
    email: string;
    displayName: string;
    user: { fullName: string } | null;
  };
};

type DelegationData = {
  granted: GrantedEntry[];
  received: ReceivedEntry[];
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const inputClass =
  "bg-surface border border-border rounded-lg text-sm text-foreground placeholder-subtle focus:outline-none focus:border-accent/50 px-3 py-2 w-full transition";

const btnClass =
  "px-4 py-2 text-xs font-semibold rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors";

function RoleBadge({ role }: { role: string }) {
  const isViewer = role.toLowerCase() === "viewer";
  if (isViewer) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border text-accent bg-accent/10 border-accent/20">
        <ShieldCheck className="h-3 w-3" />
        Viewer
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border text-ok bg-ok/10 border-ok/20">
      <Mail className="h-3 w-3" />
      Sender
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Grant Form ────────────────────────────────────────────────────────────────

function GrantForm({
  onGranted,
  onCancel,
}: {
  onGranted: (entry: GrantedEntry) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "sender">("viewer");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Enter an email address");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/delegation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = (await res.json()) as GrantedEntry & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to grant access");
      }
      onGranted(data);
      toast.success(`Access granted to ${data.user.fullName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to grant access");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="bg-surface border border-border rounded-xl p-5 mb-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Grant Access</h4>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 text-muted hover:text-foreground rounded transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted mb-1 block">
            User email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@example.com"
            className={inputClass}
            required
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted mb-1 block">
            Access level
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "viewer" | "sender")}
            className="bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent/50 px-3 py-2 w-full transition"
          >
            <option value="viewer">Viewer — read only</option>
            <option value="sender">Sender — read + send</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserCheck className="h-3.5 w-3.5" />
          )}
          {saving ? "Granting…" : "Grant Access"}
        </button>
        <button type="button" onClick={onCancel} className={btnClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function DelegationPage() {
  const [data, setData] = useState<DelegationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/delegation")
      .then((r) => r.json())
      .then((d: DelegationData) => setData(d))
      .catch(() => toast.error("Failed to load delegation settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleGranted = (entry: GrantedEntry) => {
    setData((prev) => {
      if (!prev) return prev;
      // Upsert: replace if same userId already exists (role update), else prepend
      const filtered = prev.granted.filter((g) => g.userId !== entry.userId);
      return { ...prev, granted: [entry, ...filtered] };
    });
    setShowForm(false);
  };

  const handleRevoke = async (id: string, name: string) => {
    // Optimistic remove
    setData((prev) =>
      prev ? { ...prev, granted: prev.granted.filter((g) => g.id !== id) } : prev,
    );
    setRevoking(id);
    try {
      const res = await fetch(`/api/settings/delegation?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const e = (await res.json()) as { error?: string };
        throw new Error(e.error ?? "Failed to revoke");
      }
      toast.success(`Access revoked for ${name}`);
    } catch (err) {
      // Roll back optimistic remove on failure
      toast.error(err instanceof Error ? err.message : "Failed to revoke access");
      // Re-fetch to restore consistent state
      fetch("/api/settings/delegation")
        .then((r) => r.json())
        .then((d: DelegationData) => setData(d))
        .catch(() => {});
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="bg-surface min-h-full">
      <PageHeader
        eyebrow="Mailbox Settings"
        title="Delegated Mail Access"
        description="Grant colleagues read or send access to your mailbox, and see mailboxes that have been shared with you."
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {/* ── My Delegations (Granted) ─────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">My Delegations</h2>
              <p className="text-xs text-muted mt-0.5">
                Access you have granted to other users on your mailbox
              </p>
            </div>
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className={btnClass + " inline-flex items-center gap-1.5"}
              >
                <Plus className="h-3.5 w-3.5" />
                Grant Access
              </button>
            )}
          </div>

          {showForm && (
            <GrantForm onGranted={handleGranted} onCancel={() => setShowForm(false)} />
          )}

          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-accent" />
              </div>
            ) : !data || data.granted.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center px-6">
                <Users className="h-10 w-10 text-subtle mb-3" />
                <p className="text-sm text-muted mb-1">No delegations yet</p>
                <p className="text-xs text-subtle">
                  Click &ldquo;Grant Access&rdquo; to share your mailbox with a colleague.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-subtle">
                        Name
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-subtle">
                        Email
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-subtle">
                        Role
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-subtle">
                        Granted
                      </th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.granted.map((entry, i) => (
                      <tr
                        key={entry.id}
                        className={`border-b border-border hover:bg-surface-sunken transition-colors last:border-0 ${i % 2 === 0 ? "" : "bg-surface/50"}`}
                      >
                        <td className="px-5 py-3.5">
                          <span className="font-medium text-foreground">
                            {entry.user.fullName}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-muted">{entry.user.email}</td>
                        <td className="px-5 py-3.5">
                          <RoleBadge role={entry.role} />
                        </td>
                        <td className="px-5 py-3.5 text-muted whitespace-nowrap">
                          {formatDate(entry.createdAt)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            onClick={() => void handleRevoke(entry.id, entry.user.fullName)}
                            disabled={revoking === entry.id}
                            title="Revoke access"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-muted border border-border hover:text-crit hover:border-crit/30 hover:bg-crit/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {revoking === entry.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ── Delegated to Me (Received) ───────────────────────────────────── */}
        <section>
          <div className="mb-4">
            <h2 className="text-base font-semibold text-foreground">Delegated to Me</h2>
            <p className="text-xs text-muted mt-0.5">
              Mailboxes that other users have shared with you — contact the owner to revoke
            </p>
          </div>

          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-accent" />
              </div>
            ) : !data || data.received.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center px-6">
                <Mail className="h-10 w-10 text-subtle mb-3" />
                <p className="text-sm text-muted mb-1">No shared mailboxes</p>
                <p className="text-xs text-subtle">
                  When a colleague shares their mailbox with you, it will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-subtle">
                        Mailbox owner
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-subtle">
                        Email
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-subtle">
                        My role
                      </th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-subtle">
                        Access since
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.received.map((entry, i) => (
                      <tr
                        key={entry.id}
                        className={`border-b border-border hover:bg-surface-sunken transition-colors last:border-0 ${i % 2 === 0 ? "" : "bg-surface/50"}`}
                      >
                        <td className="px-5 py-3.5">
                          <span className="font-medium text-foreground">
                            {entry.mailbox.user?.fullName ?? entry.mailbox.displayName}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-muted">
                          {entry.mailbox.email}
                        </td>
                        <td className="px-5 py-3.5">
                          <RoleBadge role={entry.role} />
                        </td>
                        <td className="px-5 py-3.5 text-muted whitespace-nowrap">
                          {formatDate(entry.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
