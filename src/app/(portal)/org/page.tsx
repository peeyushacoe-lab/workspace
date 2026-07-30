"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Building2, Users, Save, Loader2, Plus, Shield, Trash2,
  LayoutGrid, KeyRound, Network, UserCog, Check, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Shell";
import { avatarGradient } from "@/lib/avatar";

// ─── Shared style tokens (dark Nexus theme) ───────────────────────────────────
const CARD = "bg-surface border border-border rounded-xl";
const INPUT =
  "w-full bg-surface-sunken border border-border-strong rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-accent/40 placeholder-subtle";
const BTN =
  "flex items-center gap-2 bg-accent hover:bg-accent-hover text-accent-foreground text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const GHOST =
  "flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-foreground hover:bg-surface-sunken px-2.5 py-1.5 rounded-md transition-colors";
const LABEL = "text-xs text-subtle mb-1 block";

// ─── Types ─────────────────────────────────────────────────────────────────────
type OrgData = {
  id: string; name: string; slug: string; plan: string; maxUsers: number;
  brandColor: string | null; billingEmail: string | null; logoUrl: string | null;
  _count: { users: number };
};
type Member = { id: string; fullName: string; email: string; role: string; avatarUrl: string | null };
type Analytics = {
  headcount: number; activeHeadcount: number; departments: number; teams: number;
  byRole: { role: string; count: number }[];
};
type Department = {
  id: string; name: string; slug: string; managerId: string | null;
  managerName: string | null; teamCount: number;
};
type Team = {
  id: string; name: string; slug: string; icon: string | null; color: string | null;
  isSystem: boolean; managerId: string | null;
  department: { id: string; name: string } | null; memberCount: number;
};
type Role = {
  id: string; key: string; name: string; description: string | null; color: string | null;
  isSystem: boolean; isSingleton: boolean; rank: number; holders: number; permissions: string[];
};
type PermEntry = { key: string; label: string; description: string; category: string; isDangerous?: boolean };
type PermCatalog = Record<string, PermEntry[]>;

type TabKey = "overview" | "roles" | "departments" | "teams" | "members" | "general";

const TABS: { key: TabKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "roles", label: "Roles & Permissions", icon: KeyRound },
  { key: "departments", label: "Departments", icon: Network },
  { key: "teams", label: "Teams", icon: Users },
  { key: "members", label: "Members", icon: UserCog },
  { key: "general", label: "General", icon: Building2 },
];

// ─── Small helpers ─────────────────────────────────────────────────────────────
function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0"
      style={{ background: avatarGradient(name), width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </div>
  );
}

async function jsonOrThrow(res: Response) {
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

// ─── Overview tab ────────────────────────────────────────────────────────────
function OverviewTab() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/organizations/analytics")
      .then(jsonOrThrow)
      .then((d: Analytics) => setData(d))
      .catch(() => toast.error("Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PanelLoader />;
  if (!data) return <p className="text-sm text-subtle">No analytics available.</p>;

  const kpis = [
    { label: "Total headcount", value: data.headcount },
    { label: "Active", value: data.activeHeadcount },
    { label: "Departments", value: data.departments },
    { label: "Teams", value: data.teams },
  ];
  const maxRole = Math.max(1, ...data.byRole.map((r) => r.count));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className={`${CARD} p-4`}>
            <p className="text-xs text-subtle">{k.label}</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{k.value}</p>
          </div>
        ))}
      </div>
      <div className={`${CARD} p-5`}>
        <p className="text-xs font-semibold text-subtle mb-4">Headcount by role</p>
        <div className="space-y-2">
          {data.byRole.map((r) => (
            <div key={r.role} className="flex items-center gap-3">
              <span className="text-xs text-muted w-32 font-mono truncate">{r.role}</span>
              <div className="flex-1 h-2 bg-surface-sunken rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full" style={{ width: `${(r.count / maxRole) * 100}%` }} />
              </div>
              <span className="text-xs text-subtle w-8 text-right">{r.count}</span>
            </div>
          ))}
          {data.byRole.length === 0 && <p className="text-xs text-subtle italic">No users yet.</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Roles & Permissions tab ──────────────────────────────────────────────────
function RolesTab({ members }: { members: Member[] }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<PermCatalog>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesData, permData] = await Promise.all([
        fetch("/api/admin/rbac/roles").then(jsonOrThrow),
        fetch("/api/admin/rbac/permissions").then(jsonOrThrow),
      ]);
      setRoles(rolesData as Role[]);
      setCatalog((permData as { categories: PermCatalog }).categories);
    } catch {
      toast.error("Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selected = roles.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    if (selected) setDraft(new Set(selected.permissions));
  }, [selected]);

  const toggle = (key: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const savePerms = async () => {
    if (!selected || selected.isSystem) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/rbac/roles/${selected.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: [...draft] }),
      }).then(jsonOrThrow);
      toast.success("Permissions saved");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const createRole = async () => {
    if (!newName.trim()) return;
    try {
      const r = await fetch("/api/admin/rbac/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      }).then(jsonOrThrow);
      toast.success(`Role "${newName}" created`);
      setNewName("");
      await load();
      setSelectedId((r as { id: string }).id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create role");
    }
  };

  const deleteRole = async (role: Role) => {
    if (role.isSystem) return;
    if (!confirm(`Delete role "${role.name}"? ${role.holders} member(s) will lose it.`)) return;
    try {
      await fetch(`/api/admin/rbac/roles/${role.id}`, { method: "DELETE" }).then(jsonOrThrow);
      toast.success("Role deleted");
      if (selectedId === role.id) setSelectedId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  if (loading) return <PanelLoader />;

  const dirty = selected && !selected.isSystem &&
    (draft.size !== selected.permissions.length || [...draft].some((k) => !selected.permissions.includes(k)));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
      {/* Role list */}
      <div className="space-y-3">
        <div className={`${CARD} p-2`}>
          {roles.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                selectedId === r.id ? "bg-accent/10 text-accent" : "text-foreground hover:bg-surface-sunken"
              }`}
            >
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color ?? "var(--subtle)" }} />
              <span className="flex-1 text-sm truncate">{r.name}</span>
              {r.isSystem && <Shield className="w-3 h-3 text-subtle" />}
              <span className="text-[10px] text-subtle">{r.holders}</span>
            </button>
          ))}
        </div>
        <div className={`${CARD} p-3 space-y-2`}>
          <p className={LABEL}>New custom role</p>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Auditor" className={INPUT}
            onKeyDown={(e) => { if (e.key === "Enter") void createRole(); }} />
          <button onClick={createRole} disabled={!newName.trim()} className={`${BTN} w-full justify-center`}>
            <Plus className="w-4 h-4" /> Create role
          </button>
        </div>
      </div>

      {/* Permission editor */}
      <div className={`${CARD} p-5`}>
        {!selected ? (
          <p className="text-sm text-subtle">Select a role to view its permissions.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                  {selected.name}
                  {selected.isSystem && (
                    <span className="text-[10px] text-muted bg-surface-sunken border border-border px-1.5 py-0.5 rounded-full flex items-center gap-1">
                      <Shield className="w-3 h-3" /> System
                    </span>
                  )}
                </h3>
                <p className="text-xs text-subtle mt-0.5">
                  {selected.isSystem ? "Managed in code — read only." : `${draft.size} permission(s) selected`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!selected.isSystem && (
                  <button onClick={() => deleteRole(selected)} className={GHOST}>
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                )}
                {!selected.isSystem && (
                  <button onClick={savePerms} disabled={saving || !dirty} className={BTN}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-5">
              {Object.entries(catalog).map(([category, perms]) => (
                <div key={category}>
                  <p className="text-xs font-semibold text-subtle mb-2">{category}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {perms.map((p) => {
                      const on = draft.has(p.key);
                      const disabled = selected.isSystem;
                      return (
                        <button
                          key={p.key}
                          disabled={disabled}
                          onClick={() => toggle(p.key)}
                          className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors ${
                            on ? "border-accent/40 bg-accent/5" : "border-border hover:border-border-strong"
                          } ${disabled ? "opacity-70 cursor-default" : ""}`}
                        >
                          <span className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
                            on ? "bg-accent text-accent-foreground" : "border border-border-strong"
                          }`}>
                            {on && <Check className="w-3 h-3" />}
                          </span>
                          <span className="min-w-0">
                            <span className="text-[13px] text-foreground flex items-center gap-1.5">
                              {p.label}
                              {p.isDangerous && <span className="text-[9px] text-warn uppercase">danger</span>}
                            </span>
                            <span className="block text-[11px] text-subtle font-mono">{p.key}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Assign roles to people */}
      <div className="lg:col-span-2">
        <AssignRolesPanel members={members} roles={roles} />
      </div>
    </div>
  );
}

function AssignRolesPanel({ members, roles }: { members: Member[]; roles: Role[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const openMember = async (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    setLoading(true);
    try {
      const data = await fetch(`/api/admin/rbac/users/${id}/roles`).then(jsonOrThrow) as { roleId: string }[];
      setAssigned(new Set(data.map((d) => d.roleId)));
    } catch {
      toast.error("Failed to load member roles");
    } finally {
      setLoading(false);
    }
  };

  const toggle = (roleId: string) => {
    setAssigned((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId); else next.add(roleId);
      return next;
    });
  };

  const save = async () => {
    if (!openId) return;
    setSaving(true);
    try {
      await fetch(`/api/admin/rbac/users/${openId}/roles`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleIds: [...assigned] }),
      }).then(jsonOrThrow);
      toast.success("Roles updated");
      setOpenId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${CARD} p-5`}>
      <p className="text-xs font-semibold text-subtle mb-3 flex items-center gap-2">
        <UserCog className="w-3.5 h-3.5" /> Assign roles to people
      </p>
      <div className="space-y-1">
        {members.map((m) => (
          <div key={m.id} className="rounded-lg overflow-hidden">
            <button onClick={() => openMember(m.id)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-sunken rounded-lg transition-colors">
              <Avatar name={m.fullName} size={28} />
              <span className="flex-1 text-left text-sm text-foreground truncate">{m.fullName}</span>
              <span className="text-[10px] text-muted font-mono">{m.role}</span>
              <ChevronRight className={`w-4 h-4 text-subtle transition-transform ${openId === m.id ? "rotate-90" : ""}`} />
            </button>
            {openId === m.id && (
              <div className="px-3 py-3 bg-surface-sunken rounded-lg mt-1">
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-subtle" />
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {roles.map((r) => {
                        const on = assigned.has(r.id);
                        return (
                          <button key={r.id} onClick={() => toggle(r.id)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              on ? "border-accent/50 bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground"
                            }`}>
                            {r.name}
                          </button>
                        );
                      })}
                    </div>
                    <button onClick={save} disabled={saving} className={BTN}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save assignments
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Departments tab ──────────────────────────────────────────────────────────
function DepartmentsTab({ members }: { members: Member[] }) {
  const [depts, setDepts] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [managerId, setManagerId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setDepts(await fetch("/api/organizations/departments").then(jsonOrThrow)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    try {
      await fetch("/api/organizations/departments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), managerId: managerId || null }),
      }).then(jsonOrThrow);
      toast.success("Department created"); setName(""); setManagerId(""); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const remove = async (d: Department) => {
    if (!confirm(`Delete department "${d.name}"?`)) return;
    try { await fetch(`/api/organizations/departments/${d.id}`, { method: "DELETE" }).then(jsonOrThrow); toast.success("Deleted"); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
      <div className={`${CARD} p-2`}>
        {loading ? <PanelLoader /> : depts.length === 0 ? (
          <p className="text-sm text-subtle p-4">No departments yet.</p>
        ) : depts.map((d) => (
          <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-sunken transition-colors">
            <Network className="w-4 h-4 text-accent flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground truncate">{d.name}</p>
              <p className="text-xs text-subtle">
                {d.teamCount} team(s){d.managerName ? ` · led by ${d.managerName}` : ""}
              </p>
            </div>
            <button onClick={() => remove(d)} className="text-subtle hover:text-warn"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      <div className={`${CARD} p-4 space-y-3 h-fit`}>
        <p className="text-xs font-semibold text-subtle">New department</p>
        <div><label className={LABEL}>Name</label><input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="e.g. Security" /></div>
        <div>
          <label className={LABEL}>Manager (optional)</label>
          <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className={INPUT}>
            <option value="">— none —</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
          </select>
        </div>
        <button onClick={create} disabled={!name.trim()} className={`${BTN} w-full justify-center`}><Plus className="w-4 h-4" /> Create</button>
      </div>
    </div>
  );
}

// ─── Teams tab ────────────────────────────────────────────────────────────────
function TeamsTab({ members }: { members: Member[] }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [depts, setDepts] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [manageId, setManageId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<{ id: string; fullName: string; isLead: boolean }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, d] = await Promise.all([
        fetch("/api/organizations/teams").then(jsonOrThrow),
        fetch("/api/organizations/departments").then(jsonOrThrow),
      ]);
      setTeams(t); setDepts(d);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    try {
      await fetch("/api/organizations/teams", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), departmentId: departmentId || null }),
      }).then(jsonOrThrow);
      toast.success("Team created"); setName(""); setDepartmentId(""); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const remove = async (t: Team) => {
    if (!confirm(`Delete team "${t.name}"?`)) return;
    try { await fetch(`/api/organizations/teams/${t.id}`, { method: "DELETE" }).then(jsonOrThrow); toast.success("Deleted"); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const openMembers = async (id: string) => {
    if (manageId === id) { setManageId(null); return; }
    setManageId(id);
    try { setTeamMembers(await fetch(`/api/organizations/teams/${id}/members`).then(jsonOrThrow)); }
    catch { toast.error("Failed to load members"); }
  };

  const toggleMember = async (teamId: string, userId: string, isMember: boolean) => {
    try {
      await fetch(`/api/organizations/teams/${teamId}/members`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: isMember ? "remove" : "add" }),
      }).then(jsonOrThrow);
      setTeamMembers(await fetch(`/api/organizations/teams/${teamId}/members`).then(jsonOrThrow));
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const memberIds = new Set(teamMembers.map((m) => m.id));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
      <div className="space-y-3">
        {loading ? <PanelLoader /> : teams.map((t) => (
          <div key={t.id} className={`${CARD} p-3`}>
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: t.color ?? "var(--accent)" }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate flex items-center gap-2">
                  {t.name}{t.isSystem && <Shield className="w-3 h-3 text-subtle" />}
                </p>
                <p className="text-xs text-subtle">
                  {t.memberCount} member(s){t.department ? ` · ${t.department.name}` : ""}
                </p>
              </div>
              <button onClick={() => openMembers(t.id)} className={GHOST}>Members</button>
              {!t.isSystem && <button onClick={() => remove(t)} className="text-subtle hover:text-warn"><Trash2 className="w-4 h-4" /></button>}
            </div>
            {manageId === t.id && (
              <div className="mt-3 pt-3 border-t border-border space-y-1 max-h-64 overflow-y-auto">
                {members.map((m) => {
                  const on = memberIds.has(m.id);
                  return (
                    <button key={m.id} onClick={() => toggleMember(t.id, m.id, on)}
                      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-sunken transition-colors">
                      <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${on ? "bg-accent text-accent-foreground" : "border border-border-strong"}`}>
                        {on && <Check className="w-3 h-3" />}
                      </span>
                      <Avatar name={m.fullName} size={24} />
                      <span className="text-[13px] text-foreground truncate">{m.fullName}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {!loading && teams.length === 0 && <p className="text-sm text-subtle">No teams yet.</p>}
      </div>
      <div className={`${CARD} p-4 space-y-3 h-fit`}>
        <p className="text-xs font-semibold text-subtle">New team</p>
        <div><label className={LABEL}>Name</label><input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="e.g. SOC Team" /></div>
        <div>
          <label className={LABEL}>Department (optional)</label>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={INPUT}>
            <option value="">— none —</option>
            {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <button onClick={create} disabled={!name.trim()} className={`${BTN} w-full justify-center`}><Plus className="w-4 h-4" /> Create</button>
      </div>
    </div>
  );
}

// ─── Members tab ──────────────────────────────────────────────────────────────
function MembersTab({ members }: { members: Member[] }) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  const invite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await fetch("/api/organizations/invite", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      }).then(jsonOrThrow);
      toast.success(`Invitation sent to ${inviteEmail}`); setInviteEmail("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to invite"); }
    finally { setInviting(false); }
  };

  return (
    <div className="space-y-6">
      <div className={`${CARD} p-4`}>
        <p className="text-xs font-semibold text-subtle mb-3">Invite member</p>
        <div className="flex gap-2">
          <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void invite(); }}
            placeholder="colleague@example.com" className={`${INPUT} font-mono`} />
          <button onClick={invite} disabled={inviting || !inviteEmail.trim()} className={BTN}>
            {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Invite
          </button>
        </div>
      </div>
      <div className={`${CARD} p-4`}>
        <p className="text-xs font-semibold text-subtle mb-3">Members ({members.length})</p>
        <div className="space-y-1">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-sunken transition-colors">
              <Avatar name={m.fullName} size={32} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{m.fullName}</p>
                <p className="text-xs text-subtle font-mono truncate">{m.email}</p>
              </div>
              <span className="text-[10px] text-muted bg-surface-sunken border border-border px-1.5 py-0.5 rounded-full font-mono">{m.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── General tab ──────────────────────────────────────────────────────────────
function GeneralTab({ org, onSaved }: { org: OrgData; onSaved: (o: OrgData) => void }) {
  const [name, setName] = useState(org.name);
  const [brandColor, setBrandColor] = useState(org.brandColor ?? "#4f46e5");
  const [billingEmail, setBillingEmail] = useState(org.billingEmail ?? "");
  const [logoUrl, setLogoUrl] = useState(org.logoUrl ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await fetch("/api/organizations/current", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, brandColor, billingEmail, logoUrl }),
      }).then(jsonOrThrow) as OrgData;
      onSaved({ ...org, ...updated });
      toast.success("Saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to save"); }
    finally { setSaving(false); }
  };

  return (
    <div className={`${CARD} p-5 max-w-xl space-y-4`}>
      <div><label className={LABEL}>Organization name</label><input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} /></div>
      <div><label className={LABEL}>Logo URL</label><input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className={`${INPUT} font-mono`} placeholder="https://..." /></div>
      <div><label className={LABEL}>Billing email</label><input type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} className={`${INPUT} font-mono`} /></div>
      <div>
        <label className={LABEL}>Brand color</label>
        <div className="flex items-center gap-2">
          <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
          <input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className={`${INPUT} font-mono`} />
        </div>
      </div>
      <button onClick={save} disabled={saving} className={BTN}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save changes
      </button>
    </div>
  );
}

// ─── Shared loader ────────────────────────────────────────────────────────────
function PanelLoader() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-subtle" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function OrgPage() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [org, setOrg] = useState<OrgData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/organizations/current").then(jsonOrThrow),
      fetch("/api/organizations/members").then(jsonOrThrow),
    ])
      .then(([o, m]: [OrgData, Member[]]) => { setOrg(o); setMembers(m); })
      .catch(() => toast.error("Failed to load organization"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-full bg-surface-sunken text-foreground">
      <PageHeader
        eyebrow="Admin · Organization"
        title="Organization"
        description="Manage structure, roles, permissions and members across your workspace."
      />

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {org && (
          <div className="flex items-center gap-3 bg-accent/5 border border-accent/15 rounded-xl px-4 py-3">
            <Building2 className="w-4 h-4 text-accent flex-shrink-0" />
            <div className="flex-1 text-xs text-muted">
              <span className="font-semibold text-foreground">{org.name}</span>
              {" · "}<span className="text-accent font-semibold">{org.plan}</span>
              {" plan · "}{org._count.users} / {org.maxUsers} users
              {" · "}<code className="text-accent font-mono">{org.slug}</code>
            </div>
          </div>
        )}

        {/* Tab nav */}
        <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-sm border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  tab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <PanelLoader />
        ) : !org ? (
          <p className="text-sm text-subtle">No organization found for this account.</p>
        ) : (
          <div>
            {tab === "overview" && <OverviewTab />}
            {tab === "roles" && <RolesTab members={members} />}
            {tab === "departments" && <DepartmentsTab members={members} />}
            {tab === "teams" && <TeamsTab members={members} />}
            {tab === "members" && <MembersTab members={members} />}
            {tab === "general" && <GeneralTab org={org} onSaved={setOrg} />}
          </div>
        )}
      </div>
    </div>
  );
}
