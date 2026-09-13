"use client";

import { useState, useEffect, useCallback } from "react";
import { Building2, Plus, Users, Eye, EyeOff, Trash2, UserPlus, Copy, Check, RefreshCw, Hotel } from "lucide-react";
import { Icon } from "@/components/icons";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HotelOrg {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  hotelProperties: HotelProp[];
  _count: { users: number };
}

interface HotelProp {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  starRating: number | null;
  totalRooms: number;
  currency: string;
  timezone: string;
  isDemo: boolean;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generatePassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  return Array.from({ length: 14 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} className="ml-1 text-subtle hover:text-foreground transition-colors">
      {copied ? <Icon as={Check} size="xs" className="text-ok" /> : <Icon as={Copy} size="xs" />}
    </button>
  );
}

// ─── Create Org Modal ─────────────────────────────────────────────────────────

interface CreateOrgModalProps { onClose: () => void; onCreated: () => void; }

function CreateOrgModal({ onClose, onCreated }: CreateOrgModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [result, setResult] = useState<{ org: { name: string }; user: { email: string }; password: string } | null>(null);

  const [form, setForm] = useState({
    orgName: "", hotelName: "", city: "", country: "India",
    starRating: "5", totalRooms: "286", currency: "INR",
    timezone: "Asia/Kolkata", isDemo: true,
    userName: "", userEmail: "", userPassword: generatePassword(),
  });

  const set = (k: keyof typeof form, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/admin/hospitality/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgName: form.orgName, hotelName: form.hotelName,
          city: form.city, country: form.country,
          starRating: parseInt(form.starRating) || null,
          totalRooms: parseInt(form.totalRooms) || 0,
          currency: form.currency, timezone: form.timezone,
          isDemo: form.isDemo,
          userName: form.userName, userEmail: form.userEmail, userPassword: form.userPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setResult({ org: data.org, user: data.user, password: form.userPassword });
      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="fixed inset-0 bg-overlay/60 z-50 flex items-center justify-center p-4">
        <div className="bg-surface border border-border rounded-xl shadow-pop w-full max-w-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-ok-soft flex items-center justify-center">
              <Icon as={Check} size="xl" className="text-ok" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">Organization created</h2>
              <p className="text-xs text-muted">{result.org.name}</p>
            </div>
          </div>

          <div className="bg-surface-sunken border border-border rounded-lg p-4 space-y-3 mb-5 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle mb-2">Login credentials</p>
            <div className="flex items-center justify-between">
              <span className="text-muted">Login URL</span>
              <span className="font-mono text-xs text-foreground flex items-center gap-1">
                nexus.cybersage.uk/login
                <CopyBtn text="https://nexus.cybersage.uk/login" />
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Email</span>
              <span className="font-mono text-xs text-foreground flex items-center gap-1">
                {result.user.email}
                <CopyBtn text={result.user.email} />
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Password</span>
              <span className="font-mono text-xs text-foreground flex items-center gap-1">
                {result.password}
                <CopyBtn text={result.password} />
              </span>
            </div>
          </div>
          <p className="text-xs text-muted mb-4">
            Save these credentials — the password cannot be retrieved after this dialog closes.
          </p>
          <button onClick={onClose} className="w-full py-2 bg-accent text-accent-foreground text-sm font-semibold rounded-lg hover:bg-accent-hover transition-colors">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-overlay/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-surface border border-border rounded-xl shadow-pop w-full max-w-lg my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-soft">
          <h2 className="text-[15px] font-semibold text-foreground">New hospitality organization</h2>
          <button onClick={onClose} className="text-subtle hover:text-muted transition-colors text-lg leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-5">
          {error && <p className="text-xs text-crit bg-crit-soft border border-crit/20 rounded-lg px-3 py-2">{error}</p>}

          {/* Section: Organization */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle mb-3">Organization</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Organization name <span className="text-crit">*</span></label>
                <input
                  className="w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg text-sm text-foreground placeholder:text-subtle focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors"
                  placeholder="The Grand Nexus Mumbai"
                  value={form.orgName}
                  onChange={e => set("orgName", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Section: Hotel Property */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle mb-3">Hotel property</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Hotel name <span className="text-crit">*</span></label>
                <input
                  className="w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg text-sm text-foreground placeholder:text-subtle focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors"
                  placeholder="The Grand Nexus Mumbai"
                  value={form.hotelName}
                  onChange={e => set("hotelName", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">City</label>
                  <input className="w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg text-sm text-foreground placeholder:text-subtle focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors" placeholder="Mumbai" value={form.city} onChange={e => set("city", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Country</label>
                  <input className="w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg text-sm text-foreground placeholder:text-subtle focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors" placeholder="India" value={form.country} onChange={e => set("country", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Stars</label>
                  <select className="w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors" value={form.starRating} onChange={e => set("starRating", e.target.value)}>
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}★</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Total rooms</label>
                  <input type="number" className="w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg text-sm text-foreground placeholder:text-subtle focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors" placeholder="286" value={form.totalRooms} onChange={e => set("totalRooms", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Currency</label>
                  <select className="w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors" value={form.currency} onChange={e => set("currency", e.target.value)}>
                    <option value="INR">INR ₹</option>
                    <option value="GBP">GBP £</option>
                    <option value="USD">USD $</option>
                    <option value="EUR">EUR €</option>
                    <option value="AED">AED د.إ</option>
                    <option value="SGD">SGD S$</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">Timezone</label>
                  <select className="w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors" value={form.timezone} onChange={e => set("timezone", e.target.value)}>
                    <option value="Asia/Kolkata">Asia/Kolkata (+5:30)</option>
                    <option value="Asia/Dubai">Asia/Dubai (+4)</option>
                    <option value="Asia/Singapore">Asia/Singapore (+8)</option>
                    <option value="Europe/London">Europe/London</option>
                    <option value="Europe/Paris">Europe/Paris (+1)</option>
                    <option value="America/New_York">America/New_York</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
                <div className="flex items-end pb-0.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded accent-[var(--color-accent)]"
                      checked={form.isDemo}
                      onChange={e => set("isDemo", e.target.checked)}
                    />
                    <span className="text-sm text-foreground">Demo property</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Admin user */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle mb-3">First admin user</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Full name <span className="text-crit">*</span></label>
                <input className="w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg text-sm text-foreground placeholder:text-subtle focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors" placeholder="Rajesh Sharma" value={form.userName} onChange={e => set("userName", e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Email <span className="text-crit">*</span></label>
                <input type="email" className="w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg text-sm text-foreground placeholder:text-subtle focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors" placeholder="gm@grandnexus.in" value={form.userEmail} onChange={e => set("userEmail", e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Password <span className="text-crit">*</span></label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    className="w-full px-3 py-2 pr-20 bg-surface-sunken border border-border rounded-lg text-sm font-mono text-foreground focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors"
                    value={form.userPassword}
                    onChange={e => set("userPassword", e.target.value)}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button type="button" onClick={() => setShowPw(p => !p)} className="text-subtle hover:text-muted transition-colors p-1">
                      {showPw ? <Icon as={EyeOff} size="sm" /> : <Icon as={Eye} size="sm" />}
                    </button>
                    <button type="button" onClick={() => set("userPassword", generatePassword())} className="text-subtle hover:text-muted transition-colors p-1">
                      <Icon as={RefreshCw} size="sm" />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-subtle mt-1">Auto-generated. Save it — you won&apos;t see it again.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-soft">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-hover rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="px-5 py-2 text-sm font-semibold bg-accent text-accent-foreground rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create organization"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add User Modal ───────────────────────────────────────────────────────────

interface AddUserModalProps { orgId: string; orgName: string; onClose: () => void; onAdded: () => void; }

function AddUserModal({ orgId, orgName, onClose, onAdded }: AddUserModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [result, setResult] = useState<{ email: string; password: string } | null>(null);

  const [form, setForm] = useState({
    userName: "", userEmail: "", userPassword: generatePassword(), role: "OPS_MANAGER",
  });

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/admin/hospitality/orgs/${orgId}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName: form.userName, userEmail: form.userEmail, userPassword: form.userPassword, role: form.role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setResult({ email: form.userEmail, password: form.userPassword });
      onAdded();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="fixed inset-0 bg-overlay/60 z-50 flex items-center justify-center p-4">
        <div className="bg-surface border border-border rounded-xl shadow-pop w-full max-w-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-ok-soft flex items-center justify-center">
              <Icon as={Check} size="xl" className="text-ok" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">User created</h2>
              <p className="text-xs text-muted">{orgName}</p>
            </div>
          </div>
          <div className="bg-surface-sunken border border-border rounded-lg p-4 space-y-3 mb-5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Email</span>
              <span className="font-mono text-xs text-foreground flex items-center gap-1">{result.email}<CopyBtn text={result.email} /></span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Password</span>
              <span className="font-mono text-xs text-foreground flex items-center gap-1">{result.password}<CopyBtn text={result.password} /></span>
            </div>
          </div>
          <button onClick={onClose} className="w-full py-2 bg-accent text-accent-foreground text-sm font-semibold rounded-lg hover:bg-accent-hover transition-colors">Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-overlay/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-xl shadow-pop w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-soft">
          <h2 className="text-[15px] font-semibold text-foreground">Add user — {orgName}</h2>
          <button onClick={onClose} className="text-subtle hover:text-muted transition-colors text-lg leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-xs text-crit bg-crit-soft border border-crit/20 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Full name</label>
            <input className="w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg text-sm text-foreground placeholder:text-subtle focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors" placeholder="Priya Kapoor" value={form.userName} onChange={e => set("userName", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Email</label>
            <input type="email" className="w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg text-sm text-foreground placeholder:text-subtle focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors" placeholder="ops@hotel.in" value={form.userEmail} onChange={e => set("userEmail", e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Role</label>
            <select className="w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors" value={form.role} onChange={e => set("role", e.target.value)}>
              <option value="OPS_MANAGER">Operations Manager</option>
              <option value="COO">COO / Director</option>
              <option value="CEO">GM / CEO</option>
              <option value="BUSINESS_MANAGER">Business Manager</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Password</label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                className="w-full px-3 py-2 pr-20 bg-surface-sunken border border-border rounded-lg text-sm font-mono text-foreground focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors"
                value={form.userPassword}
                onChange={e => set("userPassword", e.target.value)}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button type="button" onClick={() => setShowPw(p => !p)} className="text-subtle hover:text-muted transition-colors p-1">
                  {showPw ? <Icon as={EyeOff} size="sm" /> : <Icon as={Eye} size="sm" />}
                </button>
                <button type="button" onClick={() => set("userPassword", generatePassword())} className="text-subtle hover:text-muted transition-colors p-1">
                  <Icon as={RefreshCw} size="sm" />
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-soft">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-hover rounded-lg transition-colors">Cancel</button>
          <button onClick={submit} disabled={loading} className="px-5 py-2 text-sm font-semibold bg-accent text-accent-foreground rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50">
            {loading ? "Creating…" : "Add user"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Org Card ─────────────────────────────────────────────────────────────────

interface OrgCardProps {
  org: HotelOrg;
  onAddUser: (org: HotelOrg) => void;
  onDelete: (org: HotelOrg) => void;
}

function OrgCard({ org, onAddUser, onDelete }: OrgCardProps) {
  const prop = org.hotelProperties[0];

  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent-soft flex items-center justify-center flex-shrink-0">
            <Icon as={Hotel} size="xl" className="text-accent-strong" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-foreground leading-tight">{org.name}</h3>
            <p className="text-xs text-muted mt-0.5 font-mono">{org.slug}</p>
          </div>
        </div>
        {prop?.isDemo && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold text-warn bg-warn-soft border border-warn/25 flex-shrink-0">
            DEMO
          </span>
        )}
      </div>

      {prop && (
        <div className="space-y-1.5 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Hotel</span>
            <span className="text-foreground font-medium">{prop.name}</span>
          </div>
          {prop.city && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Location</span>
              <span className="text-foreground">{[prop.city, prop.country].filter(Boolean).join(", ")}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Rooms</span>
            <span className="text-foreground">{prop.totalRooms} {prop.starRating ? `· ${"★".repeat(prop.starRating)}` : ""}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Currency</span>
            <span className="text-foreground font-mono">{prop.currency}</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-sm pb-4 mb-4 border-b border-border-soft">
        <span className="text-muted flex items-center gap-1.5">
          <Icon as={Users} size="sm" className="text-subtle" />
          {org._count.users} {org._count.users === 1 ? "user" : "users"}
        </span>
        <span className="text-subtle text-xs">
          {new Date(org.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onAddUser(org)}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[13px] font-medium text-muted hover:text-foreground hover:bg-hover rounded-lg transition-colors border border-border"
        >
          <Icon as={UserPlus} size="sm" />
          Add user
        </button>
        <button
          onClick={() => onDelete(org)}
          className="p-2 text-subtle hover:text-crit hover:bg-crit-soft rounded-lg transition-colors border border-border"
          title="Delete organization"
        >
          <Icon as={Trash2} size="sm" />
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminHospitalityPage() {
  const [orgs, setOrgs] = useState<HotelOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [addUserOrg, setAddUserOrg] = useState<HotelOrg | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HotelOrg | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/hospitality/orgs");
      const data = await res.json();
      setOrgs(data.orgs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/admin/hospitality/orgs/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      load();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center">
            <Icon as={Building2} size="xl" className="text-accent-strong" />
          </div>
          <div>
            <h1 className="text-[17px] font-semibold text-foreground">Hospitality Organizations</h1>
            <p className="text-xs text-muted mt-0.5">Create and manage hotel pilot organizations and their users.</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-accent text-accent-foreground rounded-lg hover:bg-accent-hover transition-colors"
        >
          <Icon as={Plus} size="sm" />
          New organization
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Icon as={RefreshCw} size="xl" className="text-subtle animate-spin" />
        </div>
      ) : orgs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-surface-sunken flex items-center justify-center mb-4">
            <Icon as={Hotel} size="2xl" className="text-subtle" />
          </div>
          <h3 className="text-[15px] font-medium text-foreground mb-1">No hospitality organizations yet</h3>
          <p className="text-sm text-muted max-w-xs mb-5">
            Create your first hotel organization to set up a demo or pilot environment.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-accent text-accent-foreground rounded-lg hover:bg-accent-hover transition-colors"
          >
            <Icon as={Plus} size="sm" />
            New organization
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orgs.map(org => (
            <OrgCard
              key={org.id}
              org={org}
              onAddUser={setAddUserOrg}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateOrgModal
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}

      {addUserOrg && (
        <AddUserModal
          orgId={addUserOrg.id}
          orgName={addUserOrg.name}
          onClose={() => setAddUserOrg(null)}
          onAdded={load}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-overlay/60 z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-xl shadow-pop w-full max-w-sm p-6">
            <h2 className="text-[15px] font-semibold text-foreground mb-2">Delete organization?</h2>
            <p className="text-sm text-muted mb-5">
              <span className="font-semibold text-foreground">{deleteTarget.name}</span> and all its hotel properties, users, and data will be permanently deleted.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-hover rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deleting} className="px-4 py-2 text-sm font-semibold text-white bg-crit rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
