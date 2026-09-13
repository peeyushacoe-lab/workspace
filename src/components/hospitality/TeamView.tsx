"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { UserPlus, Users, Copy, Check, KeyRound, Pencil, UserX, UserCheck, RefreshCw } from "lucide-react";
import { iconSize } from "@/components/icons";
import { HOTEL_DEPARTMENTS, labelOf } from "@/lib/hospitality/catalog";
import {
  HospPage, Modal, Field, EmptyState, LoadingRows, api, readQuery, generatePassword,
  inputCls, primaryBtn, outlineBtn, ghostBtn, chipCls,
} from "./ui";
import type { HotelMember, TeamPayload } from "./useHotelTeam";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Couldn't copy — select the text instead.");
        }
      }}
      aria-label={label}
      className={ghostBtn}
    >
      {done ? <Check className={`${iconSize("sm")} text-ok`} /> : <Copy className={iconSize("sm")} />}
    </button>
  );
}

export function TeamView() {
  const [data, setData] = useState<TeamPayload | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<HotelMember | null>(null);
  const [resetting, setResetting] = useState<HotelMember | null>(null);
  const [created, setCreated] = useState<{ fullName: string; email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<TeamPayload>("/api/hospitality/team"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load the team.");
    }
  }, []);

  useEffect(() => {
    load();
    if (readQuery("add")) setAdding(true);
  }, [load]);

  const isManager = data?.isManager ?? false;
  const active = data?.members.filter((m) => m.isActive).length ?? 0;

  const toggleActive = async (m: HotelMember) => {
    const verb = m.isActive ? "Deactivate" : "Reactivate";
    if (m.isActive && !window.confirm(`Deactivate ${m.fullName}? They'll be signed out and can't sign in until reactivated.`)) return;
    try {
      await api(`/api/hospitality/team/${m.id}`, { method: "PATCH", json: { isActive: !m.isActive } });
      toast.success(`${m.fullName} ${m.isActive ? "deactivated" : "reactivated"}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Couldn't ${verb.toLowerCase()}.`);
    }
  };

  return (
    <HospPage
      title="Team"
      description="Everyone at the property with a Nexus Hospitality login."
      action={
        isManager && (
          <button onClick={() => setAdding(true)} className={primaryBtn}>
            <UserPlus className={iconSize("sm")} /> Add team member
          </button>
        )
      }
    >
      {data && (
        <p className="mb-4 text-[13px] text-muted">
          <span className="font-semibold text-foreground tabular-nums">{active}</span> active
          {data.maxUsers ? <> of <span className="tabular-nums">{data.maxUsers}</span> on your plan</> : null}
        </p>
      )}

      {data === null ? (
        <LoadingRows />
      ) : data.members.length <= 1 && !isManager ? (
        <EmptyState icon={Users} title="It's just you so far" body="Your manager adds colleagues here." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="bg-surface-sunken text-xs font-medium text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Department</th>
                <th className="px-3 py-2.5 font-medium">Access</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {data.members.map((m) => {
                const self = m.id === data.meId;
                return (
                  <tr key={m.id} className={`bg-surface ${m.isActive ? "" : "opacity-60"}`}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11.5px] font-semibold text-accent-strong">
                          {initials(m.fullName)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">{m.fullName}{self && <span className="font-normal text-subtle"> (you)</span>}</span>
                          <span className="block truncate text-[11.5px] text-subtle">{m.email}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      {labelOf(HOTEL_DEPARTMENTS, m.department)}
                      {m.jobTitle && <span className="block text-[11.5px] text-subtle">{m.jobTitle}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`${chipCls} ${m.isOwner || m.access === "manager" ? "border-accent/25 bg-accent-soft text-accent-strong" : "border-border bg-surface-sunken text-muted"}`}>
                        {m.isOwner ? "Owner" : m.access === "manager" ? "Manager" : "Staff"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`${chipCls} ${m.isActive ? "border-ok/25 bg-ok-soft text-ok" : "border-border bg-hover text-muted"}`}>
                        {m.isActive ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {isManager && (
                        <div className="flex justify-end gap-0.5">
                          <button onClick={() => setEditing(m)} className={ghostBtn} title="Edit" aria-label={`Edit ${m.fullName}`}>
                            <Pencil className={iconSize("sm")} />
                          </button>
                          {!self && (
                            <>
                              <button onClick={() => setResetting(m)} className={ghostBtn} title="Reset password" aria-label={`Reset password for ${m.fullName}`}>
                                <KeyRound className={iconSize("sm")} />
                              </button>
                              <button
                                onClick={() => toggleActive(m)}
                                className={`${ghostBtn} ${m.isActive ? "hover:text-crit" : ""}`}
                                title={m.isActive ? "Deactivate" : "Reactivate"}
                                aria-label={`${m.isActive ? "Deactivate" : "Reactivate"} ${m.fullName}`}
                              >
                                {m.isActive ? <UserX className={iconSize("sm")} /> : <UserCheck className={iconSize("sm")} />}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <AddMemberModal
          onClose={() => setAdding(false)}
          onCreated={async (c) => { setAdding(false); setCreated(c); await load(); }}
        />
      )}
      {editing && (
        <EditMemberModal
          member={editing}
          isSelf={editing.id === data?.meId}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
      {resetting && (
        <ResetPasswordModal
          member={resetting}
          onClose={() => setResetting(null)}
          onDone={(password) => { setCreated({ fullName: resetting.fullName, email: resetting.email, password }); setResetting(null); }}
        />
      )}
      {created && <CredentialsModal {...created} onClose={() => setCreated(null)} />}
    </HospPage>
  );
}

function AddMemberModal({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (c: { fullName: string; email: string; password: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({ fullName: "", email: "", department: "front_office", jobTitle: "", phone: "", access: "staff" });
  const [password, setPassword] = useState(() => generatePassword());
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/hospitality/team", { method: "POST", json: { ...form, password } });
      toast.success(`${form.fullName} added`);
      await onCreated({ fullName: form.fullName, email: form.email.trim().toLowerCase(), password });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add the team member.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Add team member"
      description="They sign in at nexus.cybersage.uk with this email and password."
      footer={
        <>
          <button onClick={onClose} className={outlineBtn}>Cancel</button>
          <button form="member-form" type="submit" disabled={saving} className={primaryBtn}>{saving ? "Adding…" : "Add team member"}</button>
        </>
      }
    >
      <form id="member-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="member-name">
          <input id="member-name" value={form.fullName} onChange={set("fullName")} className={inputCls} required />
        </Field>
        <Field label="Email" htmlFor="member-email">
          <input id="member-email" type="email" value={form.email} onChange={set("email")} className={inputCls} required />
        </Field>
        <Field label="Department" htmlFor="member-dept">
          <select id="member-dept" value={form.department} onChange={set("department")} className={inputCls}>
            {HOTEL_DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </Field>
        <Field label="Job title (optional)" htmlFor="member-title">
          <input id="member-title" value={form.jobTitle} onChange={set("jobTitle")} placeholder="e.g. Room attendant" className={inputCls} />
        </Field>
        <Field label="Phone (optional)" htmlFor="member-phone">
          <input id="member-phone" value={form.phone} onChange={set("phone")} className={inputCls} />
        </Field>
        <Field label="Access" htmlFor="member-access" hint="Managers can edit rooms, stock items and the team.">
          <select id="member-access" value={form.access} onChange={set("access")} className={inputCls}>
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Temporary password" htmlFor="member-password" hint="At least 8 characters. You'll see it once more after saving.">
            <div className="flex gap-2">
              <input id="member-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} className={`${inputCls} font-mono`} required />
              <button type="button" onClick={() => setPassword(generatePassword())} className={outlineBtn} aria-label="Generate a new password">
                <RefreshCw className={iconSize("sm")} />
              </button>
            </div>
          </Field>
        </div>
      </form>
    </Modal>
  );
}

function EditMemberModal({
  member, isSelf, onClose, onSaved,
}: {
  member: HotelMember; isSelf: boolean; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    department: member.department ?? "",
    jobTitle: member.jobTitle ?? "",
    phone: member.phone ?? "",
    access: member.access,
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = { department: form.department, jobTitle: form.jobTitle, phone: form.phone };
      if (!isSelf && form.access !== member.access) body.access = form.access;
      await api(`/api/hospitality/team/${member.id}`, { method: "PATCH", json: body });
      toast.success(`${member.fullName} updated`);
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${member.fullName}`}
      description={member.email}
      footer={
        <>
          <button onClick={onClose} className={outlineBtn}>Cancel</button>
          <button form="edit-member-form" type="submit" disabled={saving} className={primaryBtn}>{saving ? "Saving…" : "Save changes"}</button>
        </>
      }
    >
      <form id="edit-member-form" onSubmit={submit} className="space-y-4">
        <Field label="Department" htmlFor="edit-dept">
          <select id="edit-dept" value={form.department} onChange={set("department")} className={inputCls}>
            <option value="">No department</option>
            {HOTEL_DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </Field>
        <Field label="Job title" htmlFor="edit-title">
          <input id="edit-title" value={form.jobTitle} onChange={set("jobTitle")} className={inputCls} />
        </Field>
        <Field label="Phone" htmlFor="edit-phone">
          <input id="edit-phone" value={form.phone} onChange={set("phone")} className={inputCls} />
        </Field>
        <Field label="Access" htmlFor="edit-access" hint={isSelf ? "You can't change your own access." : undefined}>
          <select id="edit-access" value={form.access} onChange={set("access")} disabled={isSelf || member.isOwner} className={inputCls}>
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
          </select>
        </Field>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  member, onClose, onDone,
}: {
  member: HotelMember; onClose: () => void; onDone: (password: string) => void;
}) {
  const [password, setPassword] = useState(() => generatePassword());
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await api(`/api/hospitality/team/${member.id}`, { method: "PATCH", json: { password } });
      toast.success(`Password reset for ${member.fullName}`);
      onDone(password);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reset the password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reset password for ${member.fullName}`}
      description="They'll be signed out everywhere and sign in with the new password."
      footer={
        <>
          <button onClick={onClose} className={outlineBtn}>Cancel</button>
          <button onClick={submit} disabled={saving || password.length < 8} className={primaryBtn}>{saving ? "Resetting…" : "Reset password"}</button>
        </>
      }
    >
      <Field label="New password" htmlFor="reset-password" hint="At least 8 characters.">
        <div className="flex gap-2">
          <input id="reset-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputCls} font-mono`} />
          <button type="button" onClick={() => setPassword(generatePassword())} className={outlineBtn} aria-label="Generate a new password">
            <RefreshCw className={iconSize("sm")} />
          </button>
        </div>
      </Field>
    </Modal>
  );
}

function CredentialsModal({ fullName, email, password, onClose }: { fullName: string; email: string; password: string; onClose: () => void }) {
  const all = `Nexus Hospitality sign-in\nhttps://nexus.cybersage.uk/login\nEmail: ${email}\nPassword: ${password}`;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Sign-in details for ${fullName}`}
      description="Share these privately. The password isn't shown again."
      footer={<button onClick={onClose} className={primaryBtn}>Done</button>}
    >
      <dl className="divide-y divide-border-soft rounded-lg border border-border bg-surface-sunken">
        {[
          { label: "Sign in at", value: "https://nexus.cybersage.uk/login" },
          { label: "Email", value: email },
          { label: "Password", value: password },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-3 px-3 py-2.5">
            <dt className="w-20 flex-shrink-0 text-xs font-medium text-muted">{row.label}</dt>
            <dd className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground">{row.value}</dd>
            <CopyButton text={row.value} label={`Copy ${row.label.toLowerCase()}`} />
          </div>
        ))}
      </dl>
      <div className="mt-3 flex justify-end">
        <CopyButton text={all} label="Copy all details" />
        <span className="self-center text-[12px] text-muted">Copy all</span>
      </div>
    </Modal>
  );
}
