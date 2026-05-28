"use client";

import { useState, useEffect } from "react";
import { Building2, Users, Mail, Palette, Save, Loader2, Plus, X, Crown, Shield, User } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Shell";

type OrgData = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  plan: string;
  maxUsers: number;
  logoUrl: string | null;
  brandColor: string | null;
  billingEmail: string | null;
  trialEndsAt: string | null;
  _count: { users: number };
};

type Member = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  orgRole: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

const ORG_ROLE_ICONS: Record<string, typeof Crown> = {
  OWNER: Crown,
  ADMIN: Shield,
  MEMBER: User,
  GUEST: User,
};

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#00d2ff]/20 to-[#a5e7ff]/10 border border-[rgba(0,210,255,0.2)] flex items-center justify-center font-bold text-[#00d2ff] text-sm flex-shrink-0">
      {initials}
    </div>
  );
}

export default function OrgPage() {
  const [org, setOrg] = useState<OrgData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  // Edit state
  const [name, setName] = useState("");
  const [brandColor, setBrandColor] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/organizations/current").then((r) => r.json()),
      fetch("/api/organizations/members").then((r) => r.json()),
    ])
      .then(([orgData, membersData]: [OrgData, Member[]]) => {
        setOrg(orgData);
        setMembers(membersData);
        setName(orgData.name ?? "");
        setBrandColor(orgData.brandColor ?? "#00d2ff");
        setBillingEmail(orgData.billingEmail ?? "");
        setLogoUrl(orgData.logoUrl ?? "");
      })
      .catch(() => toast.error("Failed to load organization"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/organizations/current", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, brandColor, billingEmail, logoUrl }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = await res.json() as OrgData;
      setOrg((prev) => prev ? { ...prev, ...updated } : prev);
      toast.success("Organization settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch("/api/organizations/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Failed");
      }
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send invite");
    } finally {
      setInviting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1321] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#bbc9cf]" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="min-h-screen bg-[#0f1321] flex items-center justify-center">
        <p className="text-[#5c6b72]">No organization found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1321] text-[#dfe1f6]">
      <PageHeader
        eyebrow="Admin · Organization"
        title="Organization Settings"
        description="Manage your workspace identity, branding, and team members."
      />

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Plan badge */}
        <div className="flex items-center gap-3 bg-[#00d2ff]/5 border border-[#00d2ff]/15 rounded-xl px-4 py-3">
          <Building2 className="w-4 h-4 text-[#00d2ff] flex-shrink-0" />
          <div className="flex-1 text-xs text-[#bbc9cf]">
            <span className="font-semibold text-[#dfe1f6]">{org.name}</span>
            {" · "}
            <span className="text-[#00d2ff] font-semibold">{org.plan}</span>
            {" plan · "}
            {org._count.users} / {org.maxUsers} users
            {" · slug: "}
            <code className="text-[#a5e7ff]">{org.slug}</code>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* General settings */}
          <div className="bg-[#1b1f2e] border border-[rgba(0,255,255,0.08)] rounded-xl p-5 space-y-4">
            <p className="text-xs font-semibold text-[#5c6b72] uppercase tracking-wider">General</p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-[#5c6b72] mb-1 block">Organization name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#262939] border border-[rgba(0,255,255,0.1)] rounded-lg px-3 py-2 text-sm text-[#dfe1f6] outline-none focus:border-[#00d2ff]/40"
                />
              </div>
              <div>
                <label className="text-xs text-[#5c6b72] mb-1 block">Logo URL</label>
                <input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-[#262939] border border-[rgba(0,255,255,0.1)] rounded-lg px-3 py-2 text-sm text-[#dfe1f6] outline-none focus:border-[#00d2ff]/40 placeholder-[#5c6b72]"
                />
              </div>
              <div>
                <label className="text-xs text-[#5c6b72] mb-1 block">Billing email</label>
                <input
                  type="email"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  className="w-full bg-[#262939] border border-[rgba(0,255,255,0.1)] rounded-lg px-3 py-2 text-sm text-[#dfe1f6] outline-none focus:border-[#00d2ff]/40"
                />
              </div>
              <div>
                <label className="text-xs text-[#5c6b72] mb-1 block">Brand color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={brandColor || "#00d2ff"}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <input
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    placeholder="#00d2ff"
                    className="flex-1 bg-[#262939] border border-[rgba(0,255,255,0.1)] rounded-lg px-3 py-2 text-sm text-[#dfe1f6] outline-none focus:border-[#00d2ff]/40 font-mono placeholder-[#5c6b72]"
                  />
                  <Palette className="w-4 h-4 text-[#5c6b72]" />
                </div>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-[#00d2ff]/15 hover:bg-[#00d2ff]/25 border border-[#00d2ff]/30 text-[#00d2ff] text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save changes
            </button>
          </div>

          {/* Invite member */}
          <div className="bg-[#1b1f2e] border border-[rgba(0,255,255,0.08)] rounded-xl p-5 space-y-4">
            <p className="text-xs font-semibold text-[#5c6b72] uppercase tracking-wider flex items-center gap-2">
              <Users className="w-3.5 h-3.5" /> Invite member
            </p>
            <p className="text-xs text-[#bbc9cf]">
              Send an invitation link to onboard a new team member. They will receive an email with a 7-day invite link.
            </p>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 bg-[#262939] border border-[rgba(0,255,255,0.1)] rounded-lg px-3 py-2">
                <Mail className="w-4 h-4 text-[#5c6b72] flex-shrink-0" />
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleInvite(); }}
                  placeholder="colleague@example.com"
                  className="flex-1 bg-transparent text-sm text-[#dfe1f6] outline-none placeholder-[#5c6b72]"
                />
                {inviteEmail && (
                  <button onClick={() => setInviteEmail("")} className="text-[#5c6b72] hover:text-[#bbc9cf]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
                className="flex items-center gap-1.5 bg-[#00d2ff]/15 hover:bg-[#00d2ff]/25 border border-[#00d2ff]/30 text-[#00d2ff] text-sm font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Invite
              </button>
            </div>
          </div>
        </div>

        {/* Member list */}
        <div className="bg-[#1b1f2e] border border-[rgba(0,255,255,0.08)] rounded-xl p-5">
          <p className="text-xs font-semibold text-[#5c6b72] uppercase tracking-wider mb-4 flex items-center gap-2">
            <Users className="w-3.5 h-3.5" /> Members ({members.length})
          </p>
          <div className="space-y-2">
            {members.map((member) => {
              const OrgIcon = ORG_ROLE_ICONS[member.orgRole ?? "MEMBER"] ?? User;
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#262939]/60 transition-colors"
                >
                  <Avatar name={member.fullName} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[#dfe1f6] truncate">{member.fullName}</span>
                      <span className="text-[10px] text-[#5c6b72] bg-[#262939] border border-[rgba(0,255,255,0.08)] px-1.5 py-0.5 rounded-full">
                        {member.role}
                      </span>
                    </div>
                    <span className="text-xs text-[#5c6b72]">{member.email}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-[#5c6b72]">
                    <OrgIcon className="w-3.5 h-3.5" />
                    {member.orgRole ?? "MEMBER"}
                  </div>
                </div>
              );
            })}
            {members.length === 0 && (
              <p className="text-xs text-[#5c6b72] italic text-center py-4">No members yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
