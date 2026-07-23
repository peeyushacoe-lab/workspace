"use client";

import { useState, useEffect, Fragment } from "react";
import { avatarGradient } from "@/lib/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, History, Mail, RefreshCw, Shield, X, ChevronDown, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/Shell";
import type { UserRole } from "@/generated/prisma/enums";

const GRANTABLE_ACCESS = [
  "HR", "Finance", "Legal", "Marketing", "Security Operations",
  "Operations", "Executive", "IT", "R&D", "Mentor",
] as const;
type GrantableAccess = (typeof GRANTABLE_ACCESS)[number];

const CREATOR_PERMISSIONS: Record<string, string[]> = {
  ADMIN:       ["CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER", "DEVELOPER", "CYBER_SECURITY", "QA", "MARKETING", "RESEARCH", "FINANCE", "OPERATIONS", "SUPPORT", "HR", "INTERNSHIP"],
  CEO:         ["MARKETING", "FINANCE"],
  CISO:        ["CYBER_SECURITY"],
  R_AND_D:     ["DEVELOPER", "QA", "RESEARCH"],
  COO:         ["OPERATIONS", "FINANCE"],
  OPS_MANAGER: ["SUPPORT", "OPERATIONS"],
};

const KEY_ROLES = new Set(["CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"]);

const ROLE_LABELS: Record<string, string> = {
  CEO: "CEO", CISO: "CISO", R_AND_D: "R&D Head", COO: "COO",
  OPS_MANAGER: "Operations Manager", DEVELOPER: "Developer",
  CYBER_SECURITY: "Cyber Security", QA: "QA Engineer",
  MARKETING: "Marketing", RESEARCH: "Research",
  FINANCE: "Finance", OPERATIONS: "Operations", SUPPORT: "Support",
  HR: "HR", INTERNSHIP: "Intern",
};

const ROLE_GROUPS = [
  { label: "Leadership", roles: ["CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] },
  { label: "Teams", roles: ["DEVELOPER", "CYBER_SECURITY", "QA", "MARKETING", "RESEARCH", "FINANCE", "OPERATIONS", "SUPPORT"] },
  { label: "HR", roles: ["HR"] },
  { label: "Interns", roles: ["INTERNSHIP"] },
];

// Categories used to bifurcate the user list into sections.
const USER_SECTIONS: { label: string; roles: string[] }[] = [
  { label: "Leadership", roles: ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] },
  { label: "Core Team", roles: ["DEVELOPER", "CYBER_SECURITY", "QA", "MARKETING", "RESEARCH", "FINANCE", "OPERATIONS"] },
  { label: "Support", roles: ["SUPPORT"] },
  { label: "HR", roles: ["HR"] },
  { label: "Interns", roles: ["INTERNSHIP"] },
];

function buildUserSections<T extends { role: string }>(list: T[]): { label: string; users: T[] }[] {
  const known = new Set(USER_SECTIONS.flatMap((s) => s.roles));
  const sections = USER_SECTIONS.map((s) => ({ label: s.label, users: list.filter((u) => s.roles.includes(u.role)) }));
  const other = list.filter((u) => !known.has(u.role));
  if (other.length) sections.push({ label: "Other", users: other });
  return sections.filter((s) => s.users.length > 0);
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-[#ea4335]/10 text-[#ea4335]",
  CEO: "bg-purple-500/10 text-purple-300",
  CISO: "bg-[#00C2FF]/10 text-[#00C2FF]",
  R_AND_D: "bg-indigo-500/10 text-indigo-300",
  COO: "bg-violet-500/10 text-violet-300",
  OPS_MANAGER: "bg-orange-500/10 text-orange-300",
  DEVELOPER: "bg-[#00C2FF]/10 text-[#00C2FF]",
  CYBER_SECURITY: "bg-[#ea4335]/10 text-[#ea4335]",
  QA: "bg-yellow-500/10 text-yellow-300",
  MARKETING: "bg-[#0f9d58]/10 text-[#0f9d58]",
  RESEARCH: "bg-teal-500/10 text-teal-300",
  FINANCE: "bg-[#0f9d58]/10 text-[#0f9d58]",
  OPERATIONS: "bg-amber-500/10 text-amber-300",
  SUPPORT: "bg-sky-500/10 text-sky-300",
  HR: "bg-pink-500/10 text-pink-300",
  INTERNSHIP: "bg-[#00C2FF]/10 text-[#00C2FF]",
};

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  mustResetPassword: boolean;
  personalEmail: string | null;
  createdAt: string;
  grantedRoles: string[];
}

interface CurrentUser {
  id: string;
  role: string;
  fullName: string;
}

// ── Inline access-role components ─────────────────────────────────────────

function GrantDropdown({
  currentRoles,
  disabled,
  onGrant,
}: {
  currentRoles: string[];
  disabled: boolean;
  onGrant: (role: GrantableAccess) => void;
}) {
  const [open, setOpen] = useState(false);
  const available = GRANTABLE_ACCESS.filter((r) => !currentRoles.includes(r));
  if (available.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1 text-[10px] text-[#5A6275] hover:text-[#00C2FF] border border-dashed border-[rgba(255,255,255,0.11)] hover:border-[#00C2FF]/40 px-1.5 py-0.5 rounded-full transition-colors disabled:opacity-40"
      >
        <Plus className="w-2.5 h-2.5" /> Grant
        <ChevronDown className="w-2.5 h-2.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 w-44 bg-[#12151D] border border-[#262A35] rounded-xl shadow-xl overflow-hidden">
            {available.map((role) => (
              <button
                key={role}
                onClick={() => { onGrant(role); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] transition-colors"
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

interface CustomRole {
  id: string;
  name: string;
  description?: string | null;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [savingAccess, setSavingAccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    workEmail: "", personalEmail: "", fullName: "", role: "", customRole: "",
  });

  useEffect(() => {
    fetchCurrentUser();
    fetchUsers();
    fetch("/api/admin/roles")
      .then(r => r.ok ? r.json() : [])
      .then((roles: CustomRole[]) => setCustomRoles(roles))
      .catch(() => {});
  }, []);

  const fetchCurrentUser = async () => {
    const res = await fetch("/api/auth/me");
    if (res.ok) setCurrentUser(await res.json());
  };

  const fetchUsers = async () => {
    setLoading(true);
    const [usersRes, rbacRes] = await Promise.all([
      fetch("/api/users"),
      fetch("/api/admin/rbac"),
    ]);

    const usersData: Omit<UserRow, "grantedRoles">[] = usersRes.ok ? await usersRes.json() : [];
    const rbacData: { id: string; grantedRoles: string[] }[] = rbacRes.ok ? await rbacRes.json() : [];
    const rbacMap = new Map(rbacData.map((u) => [u.id, u.grantedRoles]));

    setUsers(usersData.map((u) => ({ ...u, grantedRoles: rbacMap.get(u.id) ?? [] })));
    setLoading(false);
  };

  const isCisoOrAdmin = currentUser?.role === "CISO" || currentUser?.role === "ADMIN";
  const creatableRoles = currentUser ? (CREATOR_PERMISSIONS[currentUser.role] ?? []) : [];

  const applyAccess = async (userId: string, role: string, action: "grant" | "revoke") => {
    setSavingAccess(userId);
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
      toast.success(action === "grant" ? `${role} access granted` : `${role} access revoked`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update access");
    } finally {
      setSavingAccess(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setCreating(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setIsCreateOpen(false);
        setForm({ workEmail: "", personalEmail: "", fullName: "", role: "", customRole: "" });
        fetchUsers();
      } else {
        setFormError(data.error ?? "Failed to create user");
      }
    } catch {
      setFormError("An error occurred. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (userId: string, userName: string) => {
    if (!confirm(`Delete "${userName}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
    if (res.ok) {
      fetchUsers();
    } else {
      const data = await res.json();
      alert(data.error ?? "Failed to delete user");
    }
  };

  const [resendingInvite, setResendingInvite] = useState<string | null>(null);
  const handleResendInvite = async (userId: string, userName: string, alreadySetup = false) => {
    // Warn before resetting an active user — this invalidates their current password
    if (alreadySetup && !confirm(`This will reset ${userName}'s password and send a new temporary password to their personal email.\n\nThey will need to log in with the new temporary password and set a new one.\n\nContinue?`)) {
      return;
    }
    setResendingInvite(userId);
    try {
      const res = await fetch(`/api/users/${userId}/resend-invite`, { method: "POST" });
      const data = await res.json() as { error?: string };
      if (res.ok) {
        toast.success(alreadySetup
          ? `Password reset email sent to ${userName}'s personal email`
          : `Invite resent to ${userName}`);
      } else {
        toast.error(data.error ?? "Failed to send reset email");
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setResendingInvite(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Team Management"
        title="Manage User Accounts"
        description="Invite team members and manage role-based access."
      />

      <div className="space-y-6 px-6 py-8 lg:px-10">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold">Team ({users.length})</h2>
            <p className="text-sm text-muted mt-0.5">Invite members by sending them a temporary password via email.</p>
          </div>

          {creatableRoles.length > 0 && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Invite User
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Invite a Team Member</DialogTitle>
                  <DialogDescription>
                    We&apos;ll send a temporary password to their personal email. They&apos;ll set a new password on first login.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreate}>
                  <div className="space-y-4 py-4">
                    {formError && (
                      <div className="p-3 bg-[#ea4335]/10 border border-[#ea4335]/30 rounded-lg text-sm text-[#ea4335]">
                        {formError}
                      </div>
                    )}
                    <div>
                      <Label htmlFor="fullName">Full Name</Label>
                      <Input
                        id="fullName"
                        value={form.fullName}
                        onChange={e => setForm({ ...form, fullName: e.target.value })}
                        placeholder="e.g. Jane Smith"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="workEmail">Work Email (CyberSage)</Label>
                      <Input
                        id="workEmail"
                        type="email"
                        value={form.workEmail}
                        onChange={e => setForm({ ...form, workEmail: e.target.value })}
                        placeholder="e.g. jane@cybersage.uk"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="personalEmail">Personal Email (for invite)</Label>
                      <Input
                        id="personalEmail"
                        type="email"
                        value={form.personalEmail}
                        onChange={e => setForm({ ...form, personalEmail: e.target.value })}
                        placeholder="e.g. jane@gmail.com"
                        required
                      />
                      <p className="text-xs text-muted mt-1">We&apos;ll send login credentials here.</p>
                    </div>
                    <div>
                      <Label htmlFor="role">Role</Label>
                      <Select
                        value={form.role}
                        onValueChange={v => setForm({ ...form, role: v })}
                        required
                      >
                        <SelectTrigger id="role">
                          <SelectValue placeholder="Select a role…" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_GROUPS.map(group => {
                            const available = group.roles.filter(r => creatableRoles.includes(r));
                            if (available.length === 0) return null;
                            return (
                              <SelectGroup key={group.label}>
                                <SelectLabel>{group.label}</SelectLabel>
                                {available.map(r => (
                                  <SelectItem key={r} value={r}>
                                    {ROLE_LABELS[r] ?? r}
                                    {KEY_ROLES.has(r) && (
                                      <span className="ml-2 text-xs text-muted">(one-time)</span>
                                    )}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {form.role && KEY_ROLES.has(form.role) && (
                        <p className="text-xs text-[#F59E0B] mt-1">
                          This is a key role — only one {ROLE_LABELS[form.role]} can exist at a time.
                        </p>
                      )}
                    </div>
                    {customRoles.length > 0 && (
                      <div>
                        <Label htmlFor="customRole">Custom Role <span className="text-muted font-normal">(optional)</span></Label>
                        <Select
                          value={form.customRole}
                          onValueChange={v => setForm({ ...form, customRole: v === "__none__" ? "" : v })}
                        >
                          <SelectTrigger id="customRole">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {customRoles.map(r => (
                              <SelectItem key={r.id} value={r.name}>
                                {r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted mt-1">Shown as the user&apos;s display role.</p>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={creating || !form.role}>
                      {creating ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Sending Invite…
                        </>
                      ) : (
                        <>
                          <Mail className="h-4 w-4 mr-2" />
                          Send Invite
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Work Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  {isCisoOrAdmin && (
                    <TableHead>
                      <div className="flex items-center gap-1.5">
                        <Shield className="w-3 h-3 text-[#00C2FF]" />
                        Access Roles
                      </div>
                    </TableHead>
                  )}
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buildUserSections(users).map(section => (
                  <Fragment key={section.label}>
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={isCisoOrAdmin ? 7 : 6} className="bg-[#0D1017] py-2 text-[11px] font-semibold uppercase tracking-wide text-[#5A6275]">
                        {section.label} · {section.users.length}
                      </TableCell>
                    </TableRow>
                    {section.users.map(user => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0" style={{ background: avatarGradient(user.email) }}>
                          {user.fullName.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-[#E6E9F0]">{user.fullName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[#8A92A6] text-sm font-mono">{user.email}</TableCell>
                    <TableCell>
                      <Badge className={ROLE_COLORS[user.role] ?? "bg-[#1B1F2A] text-[#8A92A6]"}>
                        {ROLE_LABELS[user.role] ?? user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.mustResetPassword ? (
                        <Badge variant="outline" className="text-[#F59E0B] border-[#F59E0B]/30 bg-[#F59E0B]/10">
                          Invite pending
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[#0f9d58] border-[#0f9d58]/30 bg-[#0f9d58]/10">
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-[#8A92A6] text-sm font-mono">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>

                    {/* Access roles column — CISO + ADMIN only */}
                    {isCisoOrAdmin && (
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          {user.grantedRoles.map((role) => (
                            <button
                              key={role}
                              onClick={() => void applyAccess(user.id, role, "revoke")}
                              disabled={savingAccess === user.id}
                              title={`Click to revoke ${role}`}
                              className="group flex items-center gap-0.5 bg-[#00C2FF]/10 text-[#00C2FF] border border-[#00C2FF]/20 px-1.5 py-0.5 rounded-full text-[10px] font-semibold hover:bg-[#ea4335]/10 hover:text-[#ea4335] hover:border-[#ea4335]/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {role}
                              <X className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          ))}
                          {savingAccess === user.id ? (
                            <Loader2 className="w-3 h-3 animate-spin text-[#8A92A6]" />
                          ) : (
                            <GrantDropdown
                              currentRoles={user.grantedRoles}
                              disabled={savingAccess === user.id}
                              onGrant={(role) => void applyAccess(user.id, role, "grant")}
                            />
                          )}
                        </div>
                      </TableCell>
                    )}

                    <TableCell>
                      <div className="flex gap-1.5">
                        <Link href={`/users/${user.id}/logins`}>
                          <Button variant="outline" size="sm" title="Login history">
                            <History className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                        {/* Send/resend invite — always available so admin can reset forgotten passwords */}
                        {user.id !== currentUser?.id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleResendInvite(user.id, user.fullName, !user.mustResetPassword)}
                            disabled={resendingInvite === user.id}
                            title={user.mustResetPassword ? "Resend invite email" : "Send password reset to personal email"}
                          >
                            {resendingInvite === user.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Mail className="w-3.5 h-3.5" />}
                          </Button>
                        )}
                        {user.id !== currentUser?.id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(user.id, user.fullName)}
                            className="text-red-400 hover:text-red-400 hover:border-red-500/30"
                            title="Delete user"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                    ))}
                  </Fragment>
                ))}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isCisoOrAdmin ? 7 : 6} className="text-center text-muted py-12">
                      No team members yet. Use &ldquo;Invite User&rdquo; to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
