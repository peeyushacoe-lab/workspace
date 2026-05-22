"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, History, Mail, RefreshCw } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/Shell";
import type { UserRole } from "@/generated/prisma/enums";

// Which roles can be created by a given creator role
const CREATOR_PERMISSIONS: Record<string, string[]> = {
  ADMIN:       ["CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER", "DEVELOPER", "CYBER_SECURITY", "QA", "MARKETING", "RESEARCH", "FINANCE", "OPERATIONS", "SUPPORT"],
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
};

const ROLE_GROUPS = [
  { label: "Leadership", roles: ["CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] },
  { label: "Teams", roles: ["DEVELOPER", "CYBER_SECURITY", "QA", "MARKETING", "RESEARCH", "FINANCE", "OPERATIONS", "SUPPORT"] },
];

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-[#ff4d6d]/10 text-[#ff4d6d]",
  CEO: "bg-purple-500/10 text-purple-300",
  CISO: "bg-[#00d2ff]/10 text-[#00d2ff]",
  R_AND_D: "bg-indigo-500/10 text-indigo-300",
  COO: "bg-violet-500/10 text-violet-300",
  OPS_MANAGER: "bg-orange-500/10 text-orange-300",
  DEVELOPER: "bg-[#00d2ff]/10 text-[#a5e7ff]",
  CYBER_SECURITY: "bg-[#ff4d6d]/10 text-[#ff4d6d]",
  QA: "bg-yellow-500/10 text-yellow-300",
  MARKETING: "bg-[#00feb2]/10 text-[#00feb2]",
  RESEARCH: "bg-teal-500/10 text-teal-300",
  FINANCE: "bg-[#00feb2]/10 text-[#00feb2]",
  OPERATIONS: "bg-amber-500/10 text-amber-300",
  SUPPORT: "bg-sky-500/10 text-sky-300",
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
  signature?: { fullName: string; title: string } | null;
}

interface CurrentUser {
  id: string;
  role: string;
  fullName: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({
    workEmail: "",
    personalEmail: "",
    fullName: "",
    role: "",
  });

  useEffect(() => {
    fetchCurrentUser();
    fetchUsers();
  }, []);

  const fetchCurrentUser = async () => {
    const res = await fetch("/api/auth/me");
    if (res.ok) setCurrentUser(await res.json());
  };

  const fetchUsers = async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  };

  const creatableRoles = currentUser ? (CREATOR_PERMISSIONS[currentUser.role] ?? []) : [];

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
        setForm({ workEmail: "", personalEmail: "", fullName: "", role: "" });
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
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
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
                        <p className="text-xs text-amber-600 mt-1">
                          This is a key role — only one {ROLE_LABELS[form.role]} can exist at a time.
                        </p>
                      )}
                    </div>
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
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(user => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.fullName}</TableCell>
                    <TableCell className="text-muted text-sm">{user.email}</TableCell>
                    <TableCell>
                      <Badge className={ROLE_COLORS[user.role] ?? "bg-[#f1f5f9] text-[#475569]"}>
                        {ROLE_LABELS[user.role] ?? user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.mustResetPassword ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                          Invite pending
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted text-sm">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1.5">
                        <Link href={`/users/${user.id}/logins`}>
                          <Button variant="outline" size="sm" title="Login history">
                            <History className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                        {user.id !== currentUser?.id && user.role !== "ADMIN" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(user.id, user.fullName)}
                            className="text-red-600 hover:text-red-700 hover:border-red-300"
                            title="Delete user"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted py-12">
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
