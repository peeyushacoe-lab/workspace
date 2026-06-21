"use client";

import { useState, useEffect } from "react";
import { Building2, Users, Mail, Palette, Save, Loader2, Plus, X, Crown, Shield, User } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Shell";
import { avatarGradient } from "@/lib/avatar";

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
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-white text-sm flex-shrink-0"
      style={{ background: avatarGradient(name) }}
    >
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
      <div className="min-h-screen bg-[#12151D] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#8A92A6]" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="min-h-screen bg-[#12151D] flex items-center justify-center">
        <p className="text-[#5A6275]">No organization found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#12151D] text-[#E6E9F0]">
      <PageHeader
        eyebrow="Admin · Organization"
        title="Organization Settings"
        description="Manage your workspace identity, branding, and team members."
      />

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Plan badge */}
        <div className="flex items-center gap-3 bg-[#00C2FF]/5 border border-[#00C2FF]/15 rounded-xl px-4 py-3">
          <Building2 className="w-4 h-4 text-[#00C2FF] flex-shrink-0" />
          <div className="flex-1 text-xs text-[#8A92A6]">
            <span className="font-semibold text-[#E6E9F0]">{org.name}</span>
            {" · "}
            <span className="text-[#00C2FF] font-semibold">{org.plan}</span>
            {" plan · "}
            {org._count.users} / {org.maxUsers} users
            {" · slug: "}
            <code className="text-[#00C2FF] font-mono">{org.slug}</code>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* General settings */}
          <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5 space-y-4">
            <p className="text-xs font-semibold text-[#5A6275]">General</p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-[#5A6275] mb-1 block">Organization name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#0D1017] border border-[#2E333F] rounded-lg px-3 py-2 text-sm text-[#E6E9F0] outline-none focus:border-[#00C2FF]/40"
                />
              </div>
              <div>
                <label className="text-xs text-[#5A6275] mb-1 block">Logo URL</label>
                <input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-[#0D1017] border border-[#2E333F] rounded-lg px-3 py-2 text-sm text-[#E6E9F0] outline-none focus:border-[#00C2FF]/40 placeholder-[#5A6275] font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-[#5A6275] mb-1 block">Billing email</label>
                <input
                  type="email"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  className="w-full bg-[#0D1017] border border-[#2E333F] rounded-lg px-3 py-2 text-sm text-[#E6E9F0] outline-none focus:border-[#00C2FF]/40 font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-[#5A6275] mb-1 block">Brand color</label>
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
                    className="flex-1 bg-[#0D1017] border border-[#2E333F] rounded-lg px-3 py-2 text-sm text-[#E6E9F0] outline-none focus:border-[#00C2FF]/40 font-mono placeholder-[#5A6275]"
                  />
                  <Palette className="w-4 h-4 text-[#5A6275]" />
                </div>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-[#00C2FF] hover:bg-[#0098E6] text-[#06121A] text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save changes
            </button>
          </div>

          {/* Invite member */}
          <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5 space-y-4">
            <p className="text-xs font-semibold text-[#5A6275] flex items-center gap-2">
              <Users className="w-3.5 h-3.5" /> Invite member
            </p>
            <p className="text-xs text-[#8A92A6]">
              Send an invitation link to onboard a new team member. They will receive an email with a 7-day invite link.
            </p>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 bg-[#0D1017] border border-[#2E333F] rounded-lg px-3 py-2">
                <Mail className="w-4 h-4 text-[#5A6275] flex-shrink-0" />
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleInvite(); }}
                  placeholder="colleague@example.com"
                  className="flex-1 bg-transparent text-sm text-[#E6E9F0] outline-none placeholder-[#5A6275] font-mono"
                />
                {inviteEmail && (
                  <button onClick={() => setInviteEmail("")} className="text-[#5A6275] hover:text-[#8A92A6]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
                className="flex items-center gap-1.5 bg-[#00C2FF] hover:bg-[#0098E6] text-[#06121A] text-sm font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Invite
              </button>
            </div>
          </div>
        </div>

        {/* Member list */}
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5">
          <p className="text-xs font-semibold text-[#5A6275] mb-4 flex items-center gap-2">
            <Users className="w-3.5 h-3.5" /> Members ({members.length})
          </p>
          <div className="space-y-2">
            {members.map((member) => {
              const OrgIcon = ORG_ROLE_ICONS[member.orgRole ?? "MEMBER"] ?? User;
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#1B1F2A] transition-colors"
                >
                  <Avatar name={member.fullName} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[#E6E9F0] truncate">{member.fullName}</span>
                      <span className="text-[10px] text-[#8A92A6] bg-[#1B1F2A] border border-[#262A35] px-1.5 py-0.5 rounded-full font-mono">
                        {member.role}
                      </span>
                    </div>
                    <span className="text-xs text-[#5A6275] font-mono">{member.email}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-[#5A6275]">
                    <OrgIcon className="w-3.5 h-3.5" />
                    {member.orgRole ?? "MEMBER"}
                  </div>
                </div>
              );
            })}
            {members.length === 0 && (
              <p className="text-xs text-[#5A6275] italic text-center py-4">No members yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
