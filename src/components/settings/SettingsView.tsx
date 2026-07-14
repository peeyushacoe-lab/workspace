/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import {
  User, Shield, Bell, Mail, FileSignature, Palette,
  Globe, Lock, Filter, Plus, Trash2, Loader2, X,
  Check, ToggleRight,
  Download, AlertTriangle, Camera, Key, Cpu,
  Copy, Eye, EyeOff, Phone, MapPin,
  Link2, Tag, Briefcase, Users, Forward,
} from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { avatarGradient } from "@/lib/avatar";
import { MFASetup } from "@/components/MFASetup";
import { SessionManager } from "@/components/SessionManager";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab =
  | "profile"
  | "hr"
  | "appearance"
  | "notifications"
  | "signature"
  | "mail-rules"
  | "mailboxes"
  | "forwarding"
  | "security"
  | "language"
  | "privacy"
  | "ai"
  | "api-tokens"
  | "roles";

type SettingsUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
};

type RecentLogin = {
  id: string;
  success: boolean;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date | string;
};

type UserProfile = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  customRole?: string | null;
  displayName?: string | null;
  bio?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  department?: string | null;
  phone?: string | null;
  website?: string | null;
  location?: string | null;
  timezone?: string | null;
  language?: string | null;
  pronouns?: string | null;
  birthday?: string | null;
  statusMessage?: string | null;
  statusEmoji?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  preferences?: Record<string, unknown> | null;
};

type Signature = {
  id: string;
  fullName: string;
  title: string;
  phone?: string | null;
  linkedinUrl?: string | null;
  website?: string | null;
  html?: string | null;
};

type APIKey = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  isActive: boolean;
  createdAt: string;
};

type CustomRole = {
  id: string;
  name: string;
  description?: string | null;
  isSingleton: boolean;
  color?: string | null;
};

// ─── Shared primitives ────────────────────────────────────────────────────────

const inputClass =
  "block w-full py-2.5 border border-[#2E333F] rounded-[9px] bg-[#0D1017] text-[#E6E9F0] placeholder-[#5A6275] focus:ring-2 focus:ring-[#00C2FF]/20 focus:border-[#00C2FF]/50 text-[13.5px] px-3.5 outline-none transition-colors";

const selectClass =
  "rounded-[9px] border border-[#2E333F] bg-[#1B1F2A] px-3 py-1.5 text-sm text-[#E6E9F0] focus:ring-2 focus:ring-[#00C2FF]/20 focus:border-[#00C2FF]/50 outline-none";

const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-[9px] px-6 h-[42px] text-[13.5px] font-bold text-[#06121A] bg-gradient-to-br from-[#00C2FF] to-[#0098E6] hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed";

const btnSecondary =
  "inline-flex items-center justify-center gap-2 rounded-[9px] border border-[#2E333F] bg-transparent px-6 h-[42px] text-[13.5px] font-semibold text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0] transition disabled:opacity-50";

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden mb-6">
      <div className="px-6 pt-5 pb-4 border-b border-[#262A35]/60">
        <h3 className="text-[15px] font-bold text-[#E6E9F0] tracking-tight">{title}</h3>
        {description && <p className="text-[13px] text-[#6B7385] mt-1">{description}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-[#262A35]/60 last:border-0">
      <div className="flex-1 mr-6">
        <p className="text-[13.5px] font-semibold text-[#E6E9F0]">{label}</p>
        {description && <p className="text-xs text-[#6B7385] mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative inline-block h-[26px] w-[44px] flex-none rounded-[13px] transition-colors focus:outline-none"
      style={{ background: value ? "#00C2FF" : "#2A3040" }}
      role="switch"
      aria-checked={value}
    >
      <span
        className="absolute top-[3px] h-5 w-5 rounded-full bg-white transition-[left] duration-200"
        style={{ left: value ? "21px" : "3px", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
      />
    </button>
  );
}

// ─── TABS config ─────────────────────────────────────────────────────────────

const ALL_TABS: { id: Tab; label: string; icon: React.ElementType; description: string; adminOnly?: boolean; roleOnly?: string[] }[] = [
  { id: "profile",       label: "Profile",          icon: User,          description: "Personal info and avatar" },
  { id: "hr",            label: "My HR",            icon: Briefcase,     description: "Employee ID & emergency contact" },
  { id: "appearance",    label: "Appearance",        icon: Palette,       description: "Theme, density, and fonts" },
  { id: "notifications", label: "Notifications",     icon: Bell,          description: "Alerts and digests" },
  { id: "signature",     label: "Signature",         icon: FileSignature, description: "Email signature editor" },
  { id: "mail-rules",    label: "Mail Rules",        icon: Filter,        description: "Auto-sort emails" },
  { id: "mailboxes",     label: "Mailboxes",         icon: Mail,          description: "Managed inbox access" },
  { id: "forwarding",    label: "Email Forwarding",  icon: Forward,       description: "Forward emails to your personal address", roleOnly: ["CEO", "CISO", "R_AND_D", "OPS_MANAGER", "ADMIN"] },
  { id: "security",      label: "Security",          icon: Shield,        description: "MFA, sessions, logins" },
  { id: "language",      label: "Language & Region", icon: Globe,         description: "Locale and timezone" },
  { id: "privacy",       label: "Privacy & Data",    icon: Lock,          description: "Export and account controls" },
  { id: "ai",            label: "AI Preferences",    icon: Cpu,           description: "CyberSage AI settings" },
  { id: "api-tokens",    label: "API Tokens",        icon: Key,           description: "Personal access tokens" },
  { id: "roles",         label: "Custom Roles",      icon: Tag,           description: "Manage org roles", adminOnly: true },
];

// ─── Profile Tab ─────────────────────────────────────────────────────────────

function ProfileTab({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d: UserProfile) => setProfile(d))
      .catch(() => toast.error("Failed to load profile"))
      .finally(() => setLoading(false));
  }, [userId]);

  const update = (field: keyof UserProfile, value: string | null) => {
    setProfile((p) => p ? { ...p, [field]: value } : p);
  };

  const resizeAndEncode = (file: File, maxPx = 256): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", maxPx > 400 ? 0.75 : 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
      img.src = url;
    });

  const handleAvatarUpload = async (file: File) => {
    if (!file) return;
    setAvatarUploading(true);
    try {
      const dataUrl = await resizeAndEncode(file, 256);
      update("avatarUrl", dataUrl);
      toast.success("Avatar ready — click Save Profile to apply");
    } catch {
      toast.error("Failed to process image");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName:     profile.fullName,
          displayName:  profile.displayName,
          bio:          profile.bio,
          jobTitle:     profile.jobTitle,
          department:   profile.department,
          phone:        profile.phone,
          website:      profile.website,
          location:     profile.location,
          timezone:     profile.timezone,
          language:     profile.language,
          pronouns:     profile.pronouns,
          birthday:     profile.birthday,
          statusMessage: profile.statusMessage,
          statusEmoji:  profile.statusEmoji,
          avatarUrl:    profile.avatarUrl,
          coverUrl:     profile.coverUrl,
        }),
      });
      if (!res.ok) {
        const e = await res.json() as { error?: string; details?: { message: string; path: (string | number)[] }[] };
        const msg = e.details?.length
          ? `${String(e.details[0].path[0] ?? "field")}: ${e.details[0].message}`
          : (e.error ?? "Save failed");
        throw new Error(msg);
      }
      toast.success("Profile saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-[#00C2FF]" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <>
      {/* Cover + Avatar */}
      <SectionCard title="Profile Photo & Cover">
        {/* Cover */}
        <div className="relative rounded-xl overflow-hidden h-32 bg-gradient-to-r from-[#0E2532] to-[#0E2532] mb-4 group">
          {profile.coverUrl && (
            <img src={profile.coverUrl} alt="Cover" className="w-full h-full object-cover" />
          )}
          <button
            onClick={() => coverInputRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Camera className="h-5 w-5 text-white mr-2" />
            <span className="text-sm text-white font-medium">Change cover</span>
          </button>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const dataUrl = await resizeAndEncode(f, 600);
                update("coverUrl", dataUrl);
              } catch { toast.error("Upload failed"); }
            }}
          />
        </div>

        {/* Avatar card */}
        <div className="flex items-center gap-5">
          <div className="relative group">
            <div
              className="h-[72px] w-[72px] flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center text-2xl font-extrabold text-white"
              style={profile.avatarUrl ? undefined : { background: avatarGradient(profile.fullName || profile.email) }}
            >
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span>{profile.fullName?.[0]?.toUpperCase() ?? "?"}</span>
              )}
            </div>
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              {avatarUploading ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <Camera className="h-4 w-4 text-white" />
              )}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAvatarUpload(f); }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[17px] font-bold text-[#E6E9F0] truncate">{profile.fullName}</p>
            <p className="text-[13px] text-[#6B7385] font-mono mt-0.5 truncate">{profile.email}</p>
            <p className="text-xs text-[#00C2FF] mt-0.5 font-medium truncate">{profile.jobTitle || profile.role}</p>
          </div>
          <button
            onClick={() => avatarInputRef.current?.click()}
            disabled={avatarUploading}
            className="h-[38px] flex-none px-[18px] rounded-[9px] border border-[#2E333F] bg-[#1B1F2A] text-[12.5px] font-semibold text-[#E6E9F0] hover:bg-[#262A35] transition-colors disabled:opacity-50"
          >
            Change avatar
          </button>
        </div>

        {/* Status */}
        <div className="mt-4">
          <p className="text-xs font-medium text-[#8A92A6] mb-2">Status</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([
              { emoji: "🟢", message: "Available" },
              { emoji: "📅", message: "In a meeting" },
              { emoji: "🏠", message: "Working from home" },
              { emoji: "🔕", message: "Do not disturb" },
              { emoji: "✈️", message: "Out of office" },
              { emoji: "🎯", message: "Focused" },
              { emoji: "🏖️", message: "On vacation" },
              { emoji: "⏰", message: "Be right back" },
            ] as const).map(({ emoji, message }) => {
              const active = profile.statusEmoji === emoji && profile.statusMessage === message;
              return (
                <button
                  key={message}
                  type="button"
                  onClick={() => { update("statusEmoji", emoji); update("statusMessage", message); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${
                    active
                      ? "border-[#00C2FF] bg-[#00C2FF]/10 text-[#00C2FF] font-medium"
                      : "border-[#262A35] bg-[#12151D] text-[#8A92A6] hover:border-[#00C2FF]/40 hover:text-[#E6E9F0]"
                  }`}
                >
                  <span>{emoji}</span>
                  <span className="truncate">{message}</span>
                </button>
              );
            })}
          </div>
          {/* Show active status or allow clearing */}
          {(profile.statusEmoji || profile.statusMessage) && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-[#8A92A6]">
                Current: {profile.statusEmoji} {profile.statusMessage}
              </span>
              <button
                type="button"
                onClick={() => { update("statusEmoji", null); update("statusMessage", null); }}
                className="text-xs text-[#7a8fa6] hover:text-[#ea4335] transition"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Personal Info */}
      <SectionCard title="Personal Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-[#8A92A6] mb-1 block">Full Name</label>
            <input value={profile.fullName ?? ""} onChange={(e) => update("fullName", e.target.value)} className={inputClass} placeholder="Your full name" />
          </div>
          <div>
            <label className="text-xs font-medium text-[#8A92A6] mb-1 block">Display Name</label>
            <input value={profile.displayName ?? ""} onChange={(e) => update("displayName", e.target.value)} className={inputClass} placeholder="How you appear to others" />
          </div>
          <div>
            <label className="text-xs font-medium text-[#8A92A6] mb-1 block">Pronouns</label>
            <input value={profile.pronouns ?? ""} onChange={(e) => update("pronouns", e.target.value)} className={inputClass} placeholder="e.g. he/him, she/her" />
          </div>
          <div>
            <label className="text-xs font-medium text-[#8A92A6] mb-1 block">Birthday</label>
            <input
              type="date"
              value={profile.birthday ? new Date(profile.birthday).toISOString().slice(0, 10) : ""}
              onChange={(e) => update("birthday", e.target.value || null)}
              className={inputClass}
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="text-xs font-medium text-[#8A92A6] mb-1 block">Bio</label>
          <textarea
            value={profile.bio ?? ""}
            onChange={(e) => update("bio", e.target.value)}
            rows={3}
            placeholder="A short bio about yourself…"
            className={`${inputClass} min-h-[80px] resize-y`}
            maxLength={500}
          />
          <p className="text-[10px] text-[#5A6275] mt-1 text-right">{(profile.bio ?? "").length}/500</p>
        </div>
      </SectionCard>

      {/* Work Info */}
      <SectionCard title="Work Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-[#8A92A6] mb-1 block flex items-center gap-1">
              <Briefcase className="h-3 w-3" /> Job Title
            </label>
            <input value={profile.jobTitle ?? ""} onChange={(e) => update("jobTitle", e.target.value)} className={inputClass} placeholder="e.g. Senior Developer" />
          </div>
          <div>
            <label className="text-xs font-medium text-[#8A92A6] mb-1 block flex items-center gap-1">
              <Users className="h-3 w-3" /> Department
            </label>
            <input value={profile.department ?? ""} onChange={(e) => update("department", e.target.value)} className={inputClass} placeholder="e.g. Engineering" />
          </div>
          <div>
            <label className="text-xs font-medium text-[#8A92A6] mb-1 block flex items-center gap-1">
              <Phone className="h-3 w-3" /> Phone
            </label>
            <input value={profile.phone ?? ""} onChange={(e) => update("phone", e.target.value)} className={inputClass} placeholder="+44 7700 000000" type="tel" />
          </div>
          <div>
            <label className="text-xs font-medium text-[#8A92A6] mb-1 block flex items-center gap-1">
              <Link2 className="h-3 w-3" /> Website
            </label>
            <input value={profile.website ?? ""} onChange={(e) => update("website", e.target.value)} className={inputClass} placeholder="https://yoursite.com" type="url" />
          </div>
          <div>
            <label className="text-xs font-medium text-[#8A92A6] mb-1 block flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Location
            </label>
            <input value={profile.location ?? ""} onChange={(e) => update("location", e.target.value)} className={inputClass} placeholder="City, Country" />
          </div>
        </div>
      </SectionCard>

      {/* Save */}
      <div className="flex justify-end gap-3">
        <button onClick={handleSave} disabled={saving} className={btnPrimary}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? "Saving…" : "Save Profile"}
        </button>
      </div>
    </>
  );
}

// ─── Signature Tab ────────────────────────────────────────────────────────────

function SignatureTab({ userName }: { userName: string }) {
  const [signature, setSignature] = useState<Signature | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ fullName: userName, title: "", phone: "", linkedinUrl: "", website: "", html: "" });

  useEffect(() => {
    fetch("/api/signatures")
      .then((r) => r.json())
      .then((d: Signature | Signature[]) => {
        const sig = Array.isArray(d) ? (d[0] ?? null) : d;
        setSignature(sig);
        if (sig) setForm({ fullName: sig.fullName, title: sig.title, phone: sig.phone ?? "", linkedinUrl: sig.linkedinUrl ?? "", website: sig.website ?? "", html: sig.html ?? "" });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const method = signature ? "PUT" : "POST";
      const url = signature ? `/api/signatures/${signature.id}` : "/api/signatures";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error("Failed to save signature");
      const saved = await res.json() as Signature;
      setSignature(saved);
      setIsEditing(false);
      toast.success("Signature saved");
    } catch {
      toast.error("Failed to save signature");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!signature) return;
    try {
      await fetch(`/api/signatures/${signature.id}`, { method: "DELETE" });
      setSignature(null);
      setForm({ fullName: userName, title: "", phone: "", linkedinUrl: "", website: "", html: "" });
      setIsEditing(false);
      toast.success("Signature deleted");
    } catch {
      toast.error("Failed to delete signature");
    }
  };

  const updateField = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const generatedHtml = `<div style="font-family:Arial,sans-serif;font-size:13px;color:#E6E9F0;border-top:2px solid #00C2FF;padding-top:10px;margin-top:10px"><strong style="font-size:14px;color:#E6E9F0">${form.fullName}</strong><br/><span style="color:#8A92A6">${form.title}</span>${form.phone ? `<br/><span style="color:#8A92A6">📞 ${form.phone}</span>` : ""}${form.website ? `<br/><a href="${form.website}" style="color:#00C2FF;text-decoration:none">${form.website}</a>` : ""}${form.linkedinUrl ? `<br/><a href="${form.linkedinUrl}" style="color:#00C2FF;text-decoration:none">LinkedIn</a>` : ""}<br/><span style="color:#5A6275;font-size:11px">Powered by CyberSage</span></div>`;

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#00C2FF]" /></div>;

  return (
    <>
      {!isEditing && signature ? (
        <SectionCard title="Your Signature" description="Appended automatically to outgoing emails">
          <div
            className="p-4 rounded-lg bg-[#12151D] border border-[#262A35] mb-4 text-sm"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(signature.html ?? generatedHtml) }}
          />
          <div className="flex gap-2">
            <button onClick={() => setIsEditing(true)} className={btnSecondary}>Edit</button>
            <button onClick={() => void handleDelete()} className="inline-flex items-center gap-2 rounded-lg border border-red-500/20 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 transition">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </SectionCard>
      ) : (
        <SectionCard title={signature ? "Edit Signature" : "Create Signature"}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-[#8A92A6] mb-1 block">Full Name</label>
              <input value={form.fullName} onChange={(e) => updateField("fullName", e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-[#8A92A6] mb-1 block">Title / Role</label>
              <input value={form.title} onChange={(e) => updateField("title", e.target.value)} className={inputClass} placeholder="e.g. Security Engineer" />
            </div>
            <div>
              <label className="text-xs text-[#8A92A6] mb-1 block">Phone</label>
              <input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} className={inputClass} placeholder="+44 7700 000000" />
            </div>
            <div>
              <label className="text-xs text-[#8A92A6] mb-1 block">Website</label>
              <input value={form.website} onChange={(e) => updateField("website", e.target.value)} className={inputClass} placeholder="https://..." />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-[#8A92A6] mb-1 block">LinkedIn URL</label>
              <input value={form.linkedinUrl} onChange={(e) => updateField("linkedinUrl", e.target.value)} className={inputClass} placeholder="https://linkedin.com/in/..." />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-xs text-[#8A92A6] mb-1 block">Custom HTML (optional — overrides generated)</label>
            <textarea
              value={form.html}
              onChange={(e) => updateField("html", e.target.value)}
              rows={5}
              placeholder="<div>Your custom HTML signature…</div>"
              className={`${inputClass} min-h-[100px] font-mono text-xs resize-y`}
            />
          </div>

          <div className="mb-4">
            <p className="text-xs text-[#8A92A6] mb-2">Preview</p>
            <div
              className="p-4 rounded-lg bg-[#12151D] border border-[#262A35]"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(form.html || generatedHtml) }}
            />
          </div>

          <div className="flex gap-2">
            <button onClick={() => void handleSave()} disabled={saving} className={btnPrimary}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {saving ? "Saving…" : "Save Signature"}
            </button>
            {signature && <button onClick={() => setIsEditing(false)} className={btnSecondary}>Cancel</button>}
          </div>
        </SectionCard>
      )}

      {!signature && !isEditing && (
        <SectionCard title="No Signature Yet">
          <div className="flex flex-col items-center py-8 text-center">
            <FileSignature className="h-10 w-10 text-[#262b3a] mb-3" />
            <p className="text-sm text-[#8A92A6] mb-4">Create a professional signature for your outgoing emails.</p>
            <button onClick={() => setIsEditing(true)} className={btnPrimary}>
              <Plus className="h-4 w-4" /> Create Signature
            </button>
          </div>
        </SectionCard>
      )}
    </>
  );
}

// ─── Appearance Tab ───────────────────────────────────────────────────────────

function AppearanceTab() {
  const [density,     setDensity]     = useState<"comfortable" | "compact">("comfortable");
  const [fontSize,    setFontSize]    = useState<"normal" | "large">("normal");
  const [sidebarMode, setSidebarMode] = useState<"full" | "icons">("full");
  const [animations,  setAnimations]  = useState(true);
  const [readingPane, setReadingPane] = useState<"right" | "bottom" | "off">("right");
  const [chatBubbles, setChatBubbles] = useState<"modern" | "classic">("modern");

  useEffect(() => {
    // Always dark — just restore saved preferences
    document.documentElement.classList.add("dark");
    try {
      const d = localStorage.getItem("ui_density") as typeof density | null;
      if (d) setDensity(d);
      const f = localStorage.getItem("font_size") as typeof fontSize | null;
      if (f) { setFontSize(f); document.documentElement.style.fontSize = f === "large" ? "16px" : "14px"; }
      const s = localStorage.getItem("sidebar_mode") as typeof sidebarMode | null;
      if (s) setSidebarMode(s);
      const a = localStorage.getItem("animations");
      if (a !== null) {
        const enabled = a !== "false";
        setAnimations(enabled);
        if (!enabled && !document.getElementById("__no-motion")) {
          const s = document.createElement("style");
          s.id = "__no-motion";
          s.textContent = "*, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }";
          document.head.appendChild(s);
        }
      }
      const r = localStorage.getItem("reading_pane") as typeof readingPane | null;
      if (r) setReadingPane(r);
      const c = localStorage.getItem("chat_bubbles") as typeof chatBubbles | null;
      if (c) setChatBubbles(c);
    } catch {}
  }, []);

  const save = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch {} };

  return (
    <>
      <SectionCard title="Layout Density" description="Control spacing and information density">
        <SettingRow label="Comfortable" description="More whitespace, easier to scan">
          <input type="radio" name="density" checked={density === "comfortable"} onChange={() => { setDensity("comfortable"); save("ui_density","comfortable"); }} className="accent-[#00C2FF]" />
        </SettingRow>
        <SettingRow label="Compact" description="Tighter spacing, more content visible">
          <input type="radio" name="density" checked={density === "compact"} onChange={() => { setDensity("compact"); save("ui_density","compact"); }} className="accent-[#00C2FF]" />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Text Size">
        <SettingRow label="Normal (14px)">
          <input type="radio" name="fontSize" checked={fontSize === "normal"} onChange={() => { setFontSize("normal"); save("font_size","normal"); document.documentElement.style.fontSize = "14px"; }} className="accent-[#00C2FF]" />
        </SettingRow>
        <SettingRow label="Large (16px)" description="Easier on the eyes">
          <input type="radio" name="fontSize" checked={fontSize === "large"} onChange={() => { setFontSize("large"); save("font_size","large"); document.documentElement.style.fontSize = "16px"; }} className="accent-[#00C2FF]" />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Sidebar" description="How the navigation rail appears on desktop">
        <SettingRow label="Full labels" description="Show icon + label">
          <input type="radio" name="sidebarMode" checked={sidebarMode === "full"} onChange={() => { setSidebarMode("full"); save("sidebar_mode","full"); }} className="accent-[#00C2FF]" />
        </SettingRow>
        <SettingRow label="Icons only" description="Collapse sidebar to icon rail — more reading space">
          <input type="radio" name="sidebarMode" checked={sidebarMode === "icons"} onChange={() => { setSidebarMode("icons"); save("sidebar_mode","icons"); }} className="accent-[#00C2FF]" />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Motion & Animations">
        <SettingRow label="Enable animations" description="Transitions, hover lifts, and aurora glow effects">
          <Toggle value={animations} onChange={(v) => {
            setAnimations(v);
            save("animations", String(v));
            // Inject/remove a <style> tag that kills transitions when disabled
            const existing = document.getElementById("__no-motion");
            if (!v && !existing) {
              const s = document.createElement("style");
              s.id = "__no-motion";
              s.textContent = "*, *::before, *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }";
              document.head.appendChild(s);
            } else if (v && existing) {
              existing.remove();
            }
          }} />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Email Reading Pane" description="Where the open thread appears relative to the inbox list">
        <SettingRow label="Right panel" description="Thread opens to the right of the list">
          <input type="radio" name="readingPane" checked={readingPane === "right"} onChange={() => { setReadingPane("right"); save("reading_pane","right"); }} className="accent-[#00C2FF]" />
        </SettingRow>
        <SettingRow label="Bottom panel" description="Thread opens below the list">
          <input type="radio" name="readingPane" checked={readingPane === "bottom"} onChange={() => { setReadingPane("bottom"); save("reading_pane","bottom"); }} className="accent-[#00C2FF]" />
        </SettingRow>
        <SettingRow label="Off (full-width)" description="Click a thread to open it full-width">
          <input type="radio" name="readingPane" checked={readingPane === "off"} onChange={() => { setReadingPane("off"); save("reading_pane","off"); }} className="accent-[#00C2FF]" />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Chat Bubbles" description="Message bubble style in channels and DMs">
        <SettingRow label="Modern" description="Rounded bubbles with sender avatars">
          <input type="radio" name="chatBubbles" checked={chatBubbles === "modern"} onChange={() => { setChatBubbles("modern"); save("chat_bubbles","modern"); }} className="accent-[#00C2FF]" />
        </SettingRow>
        <SettingRow label="Classic" description="Flat rows with timestamps, like a desktop client">
          <input type="radio" name="chatBubbles" checked={chatBubbles === "classic"} onChange={() => { setChatBubbles("classic"); save("chat_bubbles","classic"); }} className="accent-[#00C2FF]" />
        </SettingRow>
      </SectionCard>
    </>
  );
}

// ─── Notifications Tab ────────────────────────────────────────────────────────

type NotifChannel = { inApp: boolean; push: boolean; email: boolean };
type NotifMatrix = Record<string, NotifChannel>;

const DEFAULT_MATRIX: NotifMatrix = {
  newMail:           { inApp: true,  push: true,  email: false },
  chatMentions:      { inApp: true,  push: true,  email: false },
  calendarReminders: { inApp: true,  push: true,  email: false },
  meetingInvite:     { inApp: true,  push: true,  email: false },
  taskAssigned:      { inApp: true,  push: false, email: false },
  fileShared:        { inApp: true,  push: false, email: false },
  socAlerts:         { inApp: true,  push: true,  email: true  },
  dlpAlerts:         { inApp: true,  push: true,  email: true  },
};

const NOTIF_ROWS: { key: string; label: string; description: string; locked?: boolean }[] = [
  { key: "newMail",           label: "New mail",              description: "When email arrives in your inbox" },
  { key: "chatMentions",      label: "Chat mentions",         description: "When someone @mentions you" },
  { key: "calendarReminders", label: "Calendar reminders",    description: "15 min before event start" },
  { key: "meetingInvite",     label: "Meeting invites",       description: "New meeting invitation received" },
  { key: "taskAssigned",      label: "Task assigned",         description: "When a task is assigned to you" },
  { key: "fileShared",        label: "File shared",           description: "When a Drive file is shared with you" },
  { key: "socAlerts",         label: "SOC incidents",         description: "Security incidents requiring attention", locked: true },
  { key: "dlpAlerts",         label: "DLP violations",        description: "Data loss prevention policy violations", locked: true },
];

function NotifsMatrixCell({ value, locked, onChange }: { value: boolean; locked?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => !locked && onChange(!value)}
      className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
        value
          ? locked ? "bg-[#00C2FF]/10 text-[#00C2FF] cursor-default" : "bg-[#0E2532] text-[#00C2FF] hover:bg-[#0E2532]"
          : locked ? "bg-[#12151D] text-[#dadce0] cursor-default" : "bg-[#1B1F2A] text-[#dadce0] hover:bg-[#262A35]"
      }`}
      title={locked ? "Always on for security" : value ? "Enabled — click to disable" : "Disabled — click to enable"}
    >
      {value ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
    </button>
  );
}

function NotificationsTab() {
  const [matrix, setMatrix] = useState<NotifMatrix>(DEFAULT_MATRIX);
  const [soundEnabled, setSoundEnabled]           = useState(false);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietStart, setQuietStart]               = useState("22:00");
  const [quietEnd,   setQuietEnd]                 = useState("08:00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/profile").then(r => r.json()).then((d: UserProfile) => {
      const n = d.preferences?.notifications as Record<string, unknown> | undefined;
      if (!n) return;
      if (n.matrix && typeof n.matrix === "object") setMatrix(m => ({ ...m, ...(n.matrix as NotifMatrix) }));
      if (typeof n.soundEnabled === "boolean") setSoundEnabled(n.soundEnabled);
      if (typeof n.quietHoursEnabled === "boolean") setQuietHoursEnabled(n.quietHoursEnabled);
      if (typeof n.quietStart === "string") setQuietStart(n.quietStart);
      if (typeof n.quietEnd === "string") setQuietEnd(n.quietEnd);
    }).catch(() => {});
  }, []);

  const setCell = (key: string, channel: keyof NotifChannel, val: boolean) =>
    setMatrix(m => ({ ...m, [key]: { ...m[key], [channel]: val } }));

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: { notifications: { matrix, soundEnabled, quietHoursEnabled, quietStart, quietEnd } } }),
      });
      toast.success("Notification preferences saved");
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  const channels: { key: keyof NotifChannel; label: string }[] = [
    { key: "inApp", label: "In-app" },
    { key: "push",  label: "Push" },
    { key: "email", label: "Email digest" },
  ];

  return (
    <>
      {/* Matrix table */}
      <SectionCard title="Notification channels" description="Choose how you receive each type of notification">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left py-2 pr-4 font-medium text-[#8A92A6] w-full">Notification type</th>
                {channels.map(ch => (
                  <th key={ch.key} className="text-center py-2 px-3 font-medium text-[#8A92A6] whitespace-nowrap min-w-[80px]">{ch.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1B1F2A]">
              {NOTIF_ROWS.map((row, i) => (
                <tr key={row.key} className={i % 2 === 0 ? "" : "bg-[#12151D]/40"}>
                  <td className="py-3 pr-4">
                    <div className="font-medium text-[#E6E9F0]">{row.label}</div>
                    <div className="text-xs text-[#5A6275] mt-0.5">{row.description}</div>
                    {row.locked && <span className="text-[10px] font-medium text-[#00C2FF] bg-[#0E2532] rounded px-1.5 py-0.5 mt-1 inline-block">Always on</span>}
                  </td>
                  {channels.map(ch => (
                    <td key={ch.key} className="py-3 px-3 text-center">
                      <div className="flex justify-center">
                        <NotifsMatrixCell
                          value={matrix[row.key]?.[ch.key] ?? false}
                          locked={row.locked}
                          onChange={(v) => setCell(row.key, ch.key, v)}
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Sound */}
      <SectionCard title="Sound & focus">
        <SettingRow label="Sound alerts" description="Play a sound for incoming notifications">
          <Toggle value={soundEnabled} onChange={setSoundEnabled} />
        </SettingRow>
      </SectionCard>

      {/* Quiet hours */}
      <SectionCard title="Quiet hours" description="Suppress push notifications during these hours">
        <SettingRow label="Enable quiet hours" description="No push or sound during the window below">
          <Toggle value={quietHoursEnabled} onChange={setQuietHoursEnabled} />
        </SettingRow>
        {quietHoursEnabled && (
          <div className="flex items-center gap-4 mt-4">
            <div>
              <label className="text-xs text-[#8A92A6]">From</label>
              <input type="time" value={quietStart} onChange={e => setQuietStart(e.target.value)} className={`block mt-1 ${selectClass}`} />
            </div>
            <div>
              <label className="text-xs text-[#8A92A6]">To</label>
              <input type="time" value={quietEnd} onChange={e => setQuietEnd(e.target.value)} className={`block mt-1 ${selectClass}`} />
            </div>
          </div>
        )}
      </SectionCard>

      <div className="flex justify-end">
        <button onClick={() => void save()} disabled={saving} className={btnPrimary}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? "Saving…" : "Save preferences"}
        </button>
      </div>
    </>
  );
}

// ─── Language & Region Tab ────────────────────────────────────────────────────

function LanguageTab() {
  const TIMEZONES = ["UTC","Europe/London","Europe/Berlin","Europe/Paris","America/New_York","America/Chicago","America/Los_Angeles","Asia/Dubai","Asia/Karachi","Asia/Kolkata","Asia/Singapore","Asia/Tokyo","Australia/Sydney"];
  const DATE_FORMATS = [{ label: "DD/MM/YYYY", value: "dd/MM/yyyy" }, { label: "MM/DD/YYYY", value: "MM/dd/yyyy" }, { label: "YYYY-MM-DD", value: "yyyy-MM-dd" }];

  const [lang,       setLang]       = useState("en");
  const [tz,         setTz]         = useState("UTC");
  const [dateFormat, setDateFormat] = useState("dd/MM/yyyy");
  const [timeFormat, setTimeFormat] = useState<"12h"|"24h">("24h");
  const [saving,     setSaving]     = useState(false);

  useEffect(() => {
    fetch("/api/profile").then(r => r.json()).then((d: UserProfile) => {
      if (d.language) setLang(d.language);
      if (d.timezone) setTz(d.timezone);
      if (d.preferences?.dateFormat) setDateFormat(d.preferences.dateFormat as string);
      if (d.preferences?.timeFormat) setTimeFormat(d.preferences.timeFormat as "12h"|"24h");
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: lang, timezone: tz, preferences: { dateFormat, timeFormat } }) });
      toast.success("Region settings saved");
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <>
      <SectionCard title="Language">
        <SettingRow label="Interface language">
          <select value={lang} onChange={(e) => setLang(e.target.value)} className={selectClass}>
            <option value="en">English</option>
            <option value="ar">Arabic (العربية)</option>
            <option value="fr">French (Français)</option>
            <option value="de">German (Deutsch)</option>
            <option value="es">Spanish (Español)</option>
            <option value="ur">Urdu (اردو)</option>
            <option value="zh">Chinese (中文)</option>
            <option value="ja">Japanese (日本語)</option>
          </select>
        </SettingRow>
      </SectionCard>
      <SectionCard title="Time & Date">
        <SettingRow label="Timezone">
          <select value={tz} onChange={(e) => setTz(e.target.value)} className={selectClass}>
            {TIMEZONES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </SettingRow>
        <SettingRow label="Date format">
          <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} className={selectClass}>
            {DATE_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </SettingRow>
        <SettingRow label="Time format">
          <div className="flex gap-3">
            {(["12h","24h"] as const).map(v => (
              <label key={v} className="flex items-center gap-1.5 text-sm text-[#8A92A6]">
                <input type="radio" name="timeFormat" value={v} checked={timeFormat === v} onChange={() => setTimeFormat(v)} className="accent-[#00d2ff]" />
                {v}
              </label>
            ))}
          </div>
        </SettingRow>
      </SectionCard>
      <div className="flex justify-end">
        <button onClick={() => void save()} disabled={saving} className={btnPrimary}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </>
  );
}

// ─── Privacy Tab ──────────────────────────────────────────────────────────────

function PrivacyTab({ userId }: { userId: string }) {
  const [exporting, setExporting] = useState(false);
  const [controls, setControls] = useState({ analytics: true, readReceipts: true, showPresence: true, contactPermissions: "team" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/profile").then(r => r.json()).then((d: UserProfile) => {
      if (d.preferences?.privacy && typeof d.preferences.privacy === "object") {
        setControls(c => ({ ...c, ...(d.preferences!.privacy as typeof controls) }));
      }
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: { privacy: controls } }) });
      toast.success("Privacy settings saved");
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/export/${userId}`, { method: "POST" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `cybersage-export-${new Date().toISOString().slice(0,10)}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Data exported");
    } catch { toast.error("Export failed"); }
    finally { setExporting(false); }
  };

  return (
    <>
      <SectionCard title="Privacy Controls">
        <SettingRow label="Analytics & usage data" description="Anonymous usage statistics to improve CyberSage">
          <Toggle value={controls.analytics} onChange={(v) => setControls(c => ({ ...c, analytics: v }))} />
        </SettingRow>
        <SettingRow label="Read receipts" description="Let others know when you've read their emails">
          <Toggle value={controls.readReceipts} onChange={(v) => setControls(c => ({ ...c, readReceipts: v }))} />
        </SettingRow>
        <SettingRow label="Online presence" description="Show your active status to teammates">
          <Toggle value={controls.showPresence} onChange={(v) => setControls(c => ({ ...c, showPresence: v }))} />
        </SettingRow>
        <SettingRow label="Who can contact me">
          <select value={controls.contactPermissions} onChange={(e) => setControls(c => ({ ...c, contactPermissions: e.target.value }))} className={selectClass}>
            <option value="everyone">Everyone</option>
            <option value="team">Team members only</option>
            <option value="none">Nobody (DND)</option>
          </select>
        </SettingRow>
      </SectionCard>
      <SectionCard title="Your Data">
        <SettingRow label="Export all data" description="Download mail, chats, calendar events, and files">
          <button onClick={() => void handleExport()} disabled={exporting} className={btnSecondary}>
            <Download className="h-4 w-4" />{exporting ? "Exporting…" : "Export"}
          </button>
        </SettingRow>
      </SectionCard>
      <SectionCard title="Account">
        <div className="border border-red-500/20 rounded-xl p-5 bg-red-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-400">Deactivate account</p>
              <p className="text-xs text-red-400/70 mt-0.5">Account deactivation is handled by your workspace administrator.</p>
            </div>
          </div>
        </div>
      </SectionCard>
      <div className="flex justify-end">
        <button onClick={() => void save()} disabled={saving} className={btnPrimary}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? "Saving…" : "Save Privacy Settings"}
        </button>
      </div>
    </>
  );
}

// ─── AI Preferences Tab ───────────────────────────────────────────────────────

function AITab() {
  const [prefs, setPrefs] = useState({
    enabled: true, smartReply: true, smartCompose: true, autoSummarize: false,
    autoCategorizeMail: true, meetingInsights: true, chatBot: true,
    model: "claude-sonnet-4-6", tone: "professional",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/profile").then(r => r.json()).then((d: UserProfile) => {
      if (d.preferences?.ai && typeof d.preferences.ai === "object") {
        setPrefs(p => ({ ...p, ...(d.preferences!.ai as typeof prefs) }));
      }
    }).catch(() => {});
  }, []);

  const update = (k: keyof typeof prefs, v: boolean | string) => setPrefs(p => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preferences: { ai: prefs } }) });
      toast.success("AI preferences saved");
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <>
      <SectionCard title="CyberSage AI" description="Control how the AI assistant helps you across the workspace">
        <SettingRow label="Enable AI features" description="Master toggle for all AI functionality">
          <Toggle value={prefs.enabled} onChange={(v) => update("enabled", v)} />
        </SettingRow>
      </SectionCard>
      <SectionCard title="Email AI">
        <SettingRow label="Smart Reply" description="One-click AI-generated reply suggestions"><Toggle value={prefs.smartReply} onChange={(v) => update("smartReply", v)} /></SettingRow>
        <SettingRow label="Smart Compose" description="AI autocomplete while typing emails"><Toggle value={prefs.smartCompose} onChange={(v) => update("smartCompose", v)} /></SettingRow>
        <SettingRow label="Auto-summarize threads" description="Summarize long email threads automatically"><Toggle value={prefs.autoSummarize} onChange={(v) => update("autoSummarize", v)} /></SettingRow>
        <SettingRow label="Auto-categorize mail" description="Automatically sort mail using AI"><Toggle value={prefs.autoCategorizeMail} onChange={(v) => update("autoCategorizeMail", v)} /></SettingRow>
      </SectionCard>
      <SectionCard title="Chat & Meetings">
        <SettingRow label="Chat AI bot (@CyberSage)" description="Ask the AI anything in chat"><Toggle value={prefs.chatBot} onChange={(v) => update("chatBot", v)} /></SettingRow>
        <SettingRow label="Meeting insights" description="Auto-generated meeting notes and actions"><Toggle value={prefs.meetingInsights} onChange={(v) => update("meetingInsights", v)} /></SettingRow>
      </SectionCard>
      <SectionCard title="Style Preferences">
        <SettingRow label="Default tone">
          <select value={prefs.tone} onChange={(e) => update("tone", e.target.value)} className={selectClass}>
            <option value="professional">Professional</option>
            <option value="friendly">Friendly</option>
            <option value="concise">Concise</option>
            <option value="formal">Formal</option>
          </select>
        </SettingRow>
      </SectionCard>
      <div className="flex justify-end">
        <button onClick={() => void save()} disabled={saving} className={btnPrimary}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? "Saving…" : "Save AI Settings"}
        </button>
      </div>
    </>
  );
}

// ─── API Tokens Tab ───────────────────────────────────────────────────────────

function APITokensTab() {
  const [tokens, setTokens]   = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [name, setName]       = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    fetch("/api/ecosystem/api-keys")
      .then(r => r.json())
      .then((d: APIKey[]) => setTokens(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const create = async () => {
    if (!name.trim()) { toast.error("Enter a token name"); return; }
    setCreating(true);
    try {
      const res = await fetch("/api/ecosystem/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as { key: string; apiKey: APIKey };
      setNewToken(data.key);
      setTokens(prev => [data.apiKey, ...prev]);
      setName(""); setShowNew(false);
    } catch { toast.error("Failed to create token"); }
    finally { setCreating(false); }
  };

  const revoke = async (id: string) => {
    await fetch(`/api/ecosystem/api-keys/${id}`, { method: "DELETE" }).catch(() => {});
    setTokens(prev => prev.filter(t => t.id !== id));
    toast.success("Token revoked");
  };

  return (
    <>
      {newToken && (
        <div className="mb-6 bg-[#00C2FF]/10 border border-[#00C2FF]/30 rounded-xl p-4">
          <p className="text-sm font-semibold text-[#00C2FF] mb-2">Token created — copy it now, it won&apos;t be shown again</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-[#12151D] px-3 py-2 rounded-lg text-xs text-[#E6E9F0] font-mono truncate">
              {revealed ? newToken : newToken.slice(0, 12) + "•".repeat(24)}
            </code>
            <button onClick={() => setRevealed(r => !r)} className="p-2 text-[#8A92A6] hover:text-[#E6E9F0]">
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button onClick={() => { void navigator.clipboard.writeText(newToken); toast.success("Copied!"); }} className="p-2 text-[#8A92A6] hover:text-[#E6E9F0]">
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <button onClick={() => setNewToken(null)} className="mt-2 text-xs text-[#8A92A6] hover:text-[#E6E9F0]">Dismiss</button>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[#8A92A6]">{tokens.length} token{tokens.length !== 1 ? "s" : ""}</p>
        <button onClick={() => setShowNew(v => !v)} className={btnPrimary}>
          <Plus className="h-4 w-4" /> New Token
        </button>
      </div>

      {showNew && (
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-4 mb-6">
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Token name (e.g. CI/CD Pipeline)" className={`flex-1 ${inputClass}`} onKeyDown={(e) => { if (e.key === "Enter") void create(); }} />
            <button onClick={() => void create()} disabled={creating} className={btnPrimary}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </button>
            <button onClick={() => { setShowNew(false); setName(""); }} className={btnSecondary}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#00C2FF] mx-auto" /></div>
      ) : tokens.length === 0 ? (
        <div className="text-center py-12">
          <Key className="h-10 w-10 text-[#262b3a] mx-auto mb-3" />
          <p className="text-sm text-[#8A92A6]">No API tokens yet. Create one to integrate with external tools.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tokens.map(t => (
            <div key={t.id} className="bg-[#12151D] border border-[#262A35] rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Key className="h-4 w-4 text-[#00C2FF] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#E6E9F0] truncate">{t.name}</p>
                  <p className="text-xs text-[#8A92A6] font-mono">{t.keyPrefix}••••••••••••••••</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {t.lastUsedAt && <span className="text-xs text-[#8A92A6]">Last used {new Date(t.lastUsedAt).toLocaleDateString()}</span>}
                <button onClick={() => void revoke(t.id)} className="p-1.5 text-[#8A92A6] hover:text-[#ea4335] hover:bg-[#ea4335]/10 rounded-lg transition-colors" title="Revoke">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Custom Roles Tab (admin only) ────────────────────────────────────────────

function CustomRolesTab() {
  const [roles, setRoles]     = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm]       = useState({ name: "", description: "", isSingleton: false, color: "#00d2ff" });
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    fetch("/api/admin/roles")
      .then(r => r.json())
      .then((d: CustomRole[]) => setRoles(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const create = async () => {
    if (!form.name.trim()) { toast.error("Role name required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? "Failed"); }
      const role = await res.json() as CustomRole;
      setRoles(prev => [...prev, role]);
      setForm({ name: "", description: "", isSingleton: false, color: "#00d2ff" });
      setShowNew(false);
      toast.success("Role created");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  };

  const del = async (id: string) => {
    await fetch(`/api/admin/roles/${id}`, { method: "DELETE" }).catch(() => {});
    setRoles(prev => prev.filter(r => r.id !== id));
    toast.success("Role deleted");
  };

  return (
    <>
      <div className="mb-4 p-4 bg-[#1B1F2A] rounded-xl border border-[#262A35]">
        <p className="text-xs text-[#8A92A6]">
          Custom roles supplement the built-in roles (CEO, CISO, Developer, etc.). Mark a role as <strong className="text-[#E6E9F0]">singleton</strong> if only one person in the org can hold it (like a CEO).
        </p>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[#8A92A6]">{roles.length} custom role{roles.length !== 1 ? "s" : ""}</p>
        <button onClick={() => setShowNew(v => !v)} className={btnPrimary}><Plus className="h-4 w-4" /> New Role</button>
      </div>

      {showNew && (
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5 mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#8A92A6] mb-1 block">Role Name *</label>
              <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} placeholder="e.g. Lead Auditor" />
            </div>
            <div>
              <label className="text-xs text-[#8A92A6] mb-1 block">Badge Colour</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.color} onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))} className="h-9 w-14 rounded border border-[#262A35] bg-transparent cursor-pointer" />
                <span className="text-xs text-[#8A92A6]" style={{ color: form.color }}>{form.name || "Preview"}</span>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-[#8A92A6] mb-1 block">Description</label>
            <input value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className={inputClass} placeholder="Brief description of this role" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isSingleton} onChange={(e) => setForm(f => ({ ...f, isSingleton: e.target.checked }))} className="accent-[#00d2ff]" />
            <div>
              <p className="text-sm font-medium text-[#E6E9F0]">Singleton role</p>
              <p className="text-xs text-[#8A92A6]">Only one user in the org can be assigned this role at a time</p>
            </div>
          </label>
          <div className="flex gap-2">
            <button onClick={() => void create()} disabled={saving} className={btnPrimary}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Role"}</button>
            <button onClick={() => { setShowNew(false); setForm({ name: "", description: "", isSingleton: false, color: "#00d2ff" }); }} className={btnSecondary}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#00C2FF] mx-auto" /></div>
      ) : roles.length === 0 ? (
        <div className="text-center py-12">
          <Tag className="h-10 w-10 text-[#262b3a] mx-auto mb-3" />
          <p className="text-sm text-[#8A92A6]">No custom roles yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {roles.map(r => (
            <div key={r.id} className="bg-[#12151D] border border-[#262A35] rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: `${r.color ?? "#00d2ff"}20`, color: r.color ?? "#00d2ff" }}>
                  {r.name}
                </span>
                {r.isSingleton && <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full font-medium">SINGLETON</span>}
                {r.description && <p className="text-xs text-[#8A92A6] truncate max-w-xs">{r.description}</p>}
              </div>
              <button onClick={() => void del(r.id)} className="p-1.5 text-[#8A92A6] hover:text-[#ea4335] hover:bg-[#ea4335]/10 rounded-lg transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Mailboxes Tab ────────────────────────────────────────────────────────────

type DelegationGranted = {
  id: string;
  role: string;
  createdAt: string;
  user: { fullName: string; email: string; role: string };
};

type DelegationReceived = {
  id: string;
  mailboxId: string;
  role: string;
  createdAt: string;
  mailbox: {
    email: string;
    displayName: string | null;
    user: { fullName: string } | null;
  };
};

function MailboxesTab({ userEmail }: { userEmail: string }) {
  const [granted, setGranted]   = useState<DelegationGranted[]>([]);
  const [received, setReceived] = useState<DelegationReceived[]>([]);
  const [loading, setLoading]   = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/delegation")
      .then(r => r.json())
      .then((d: { granted: DelegationGranted[]; received: DelegationReceived[] }) => {
        setGranted(Array.isArray(d.granted)  ? d.granted  : []);
        setReceived(Array.isArray(d.received) ? d.received : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const revoke = async (id: string) => {
    setRevoking(id);
    try {
      await fetch(`/api/settings/delegation?id=${id}`, { method: "DELETE" });
      setGranted(p => p.filter(g => g.id !== id));
      toast.success("Access revoked");
    } catch { toast.error("Failed to revoke"); }
    finally { setRevoking(null); }
  };

  const roleBadge = (role: string) => (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
      role === "sender" ? "bg-[#00C2FF]/10 text-[#00C2FF]" : "bg-[#1B1F2A] text-[#8A92A6]"
    }`}>{role}</span>
  );

  if (loading) return (
    <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-[#00C2FF]" /></div>
  );

  return (
    <>
      {/* Primary mailbox */}
      <SectionCard title="Your Mailbox" description="Your primary workspace inbox">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-[#00C2FF]/5 border border-[#00C2FF]/15">
          <div className="h-9 w-9 rounded-full bg-[#0E2532] flex items-center justify-center flex-shrink-0">
            <Mail className="h-4 w-4 text-[#00C2FF]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#E6E9F0] truncate">{userEmail}</p>
            <p className="text-xs text-[#00C2FF] font-medium">Primary · Owner</p>
          </div>
          <span className="h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0" title="Active" />
        </div>
      </SectionCard>

      {/* Shared mailboxes you can access */}
      <SectionCard
        title="Shared mailboxes"
        description="Inboxes other users have delegated access to you"
      >
        {received.length === 0 ? (
          <div className="text-center py-8">
            <Mail className="h-9 w-9 text-[#262b3a] mx-auto mb-2" />
            <p className="text-sm text-[#8A92A6]">No shared mailboxes yet.</p>
            <p className="text-xs text-[#5A6275] mt-1">A colleague can grant you access from their delegation settings.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {received.map(r => {
              const ownerName = r.mailbox.user?.fullName ?? "Unknown";
              return (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-[#1B1F2A] border border-[#262A35]">
                  <div className="h-9 w-9 rounded-full bg-[#12151D] border border-[#262A35] flex items-center justify-center flex-shrink-0">
                    <Mail className="h-4 w-4 text-[#8A92A6]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#E6E9F0] truncate">
                      {r.mailbox.displayName ?? r.mailbox.email}
                    </p>
                    <p className="text-xs text-[#8A92A6] truncate">{r.mailbox.email} · owned by {ownerName}</p>
                  </div>
                  {roleBadge(r.role)}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Delegations you've granted to others */}
      <SectionCard
        title="Access you've granted"
        description="People who can access your inbox"
      >
        {granted.length === 0 ? (
          <div className="text-center py-8">
            <Users className="h-9 w-9 text-[#262b3a] mx-auto mb-2" />
            <p className="text-sm text-[#8A92A6]">You haven&apos;t granted anyone access yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {granted.map(g => (
              <div key={g.id} className="flex items-center gap-3 p-3 rounded-xl bg-[#1B1F2A] border border-[#262A35]">
                <div
                  className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold text-white"
                  style={{ background: `hsl(${Math.abs(g.user.email.split("").reduce((a,c) => a + c.charCodeAt(0), 0)) % 360}deg 45% 30%)` }}
                >
                  {g.user.fullName?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#E6E9F0] truncate">{g.user.fullName}</p>
                  <p className="text-xs text-[#8A92A6] truncate">{g.user.email}</p>
                </div>
                {roleBadge(g.role)}
                <button
                  onClick={() => void revoke(g.id)}
                  disabled={revoking === g.id}
                  className="p-1.5 rounded-lg text-[#8A92A6] hover:text-[#ea4335] hover:bg-[#ea4335]/10 transition-colors disabled:opacity-50"
                  title="Revoke access"
                >
                  {revoking === g.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-[#262A35]/60">
          <a
            href="/settings/delegation"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#00C2FF] hover:text-[#47d6ff] transition-colors"
          >
            <Users className="h-4 w-4" />
            Manage delegation settings →
          </a>
        </div>
      </SectionCard>

      {/* Migration wizard — import from another provider */}
      <SectionCard
        title="Switching from Gmail or another provider?"
        description="Import your mail, contacts, and calendar into Nexus"
      >
        <a
          href="/settings/import"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#00C2FF] hover:text-[#47d6ff] transition-colors"
        >
          <Mail className="h-4 w-4" />
          Start migration wizard →
        </a>
      </SectionCard>

      {/* Account export / takeout */}
      <SectionCard
        title="Export your data"
        description="Download your mail, files, notes, contacts, and calendar as a single archive"
      >
        <a
          href="/settings/export"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#00C2FF] hover:text-[#47d6ff] transition-colors"
        >
          <Download className="h-4 w-4" />
          Start account export →
        </a>
      </SectionCard>

      {/* Vacation responder */}
      <SectionCard
        title="Vacation responder"
        description="Automatically reply to incoming mail while you're away"
      >
        <a
          href="/settings/vacation-responder"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#00C2FF] hover:text-[#47d6ff] transition-colors"
        >
          <Mail className="h-4 w-4" />
          Configure vacation responder →
        </a>
      </SectionCard>
    </>
  );
}

// ─── Mail Rules Tab ───────────────────────────────────────────────────────────

type MailRule = {
  id: string; name: string; isActive: boolean; priority: number;
  conditions: { field: string; op: string; value: string }[];
  action: string; actionData: Record<string, string> | null;
};

const CONDITION_FIELDS = ["from","to","subject","body"] as const;
const CONDITION_OPS    = ["contains","equals","startsWith","endsWith","notContains"] as const;
const RULE_ACTIONS = [
  { value: "LABEL",       label: "Add label" },
  { value: "MOVE_FOLDER", label: "Move to folder" },
  { value: "MARK_READ",   label: "Mark as read" },
  { value: "STAR",        label: "Star thread" },
  { value: "ARCHIVE",     label: "Archive" },
  { value: "TRASH",       label: "Move to trash" },
  { value: "PRIORITY",    label: "Set priority" },
  { value: "FORWARD",     label: "Forward to…" },
];

// ─── Forwarding Tab ───────────────────────────────────────────────────────────

function ForwardingTab() {
  const [personalEmail, setPersonalEmail]         = useState("");
  const [forwardingEnabled, setForwardingEnabled] = useState(false);
  const [keepCopy, setKeepCopy]                   = useState(true);
  const [loading, setLoading]                     = useState(true);
  const [saving, setSaving]                       = useState(false);

  useEffect(() => {
    fetch("/api/settings/forwarding")
      .then(r => r.json())
      .then((d: { personalEmail?: string; forwardingEnabled?: boolean; keepCopy?: boolean }) => {
        setPersonalEmail(d.personalEmail ?? "");
        setForwardingEnabled(d.forwardingEnabled ?? false);
        setKeepCopy(d.keepCopy ?? true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/forwarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personalEmail, forwardingEnabled, keepCopy }),
      });
      if (res.ok) {
        toast.success("Forwarding settings saved");
      } else {
        const err = await res.json() as { error?: string };
        toast.error(err.error ?? "Failed to save");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-[#5A6275]">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl border"
        style={{ background: "#1a56db10", borderColor: "#1a56db30" }}>
        <Forward className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#1a56db" }} />
        <p className="text-[13px] text-[#8A92A6] leading-relaxed">
          When enabled, every email delivered to your Nexus inbox will also be forwarded
          to your personal address — so you never miss a message, even outside the platform.
        </p>
      </div>

      <SectionCard title="Personal email address" description="Where forwarded emails will be sent">
        <input
          type="email"
          value={personalEmail}
          onChange={e => setPersonalEmail(e.target.value)}
          placeholder="you@gmail.com"
          className="w-full px-3 py-2.5 rounded-lg text-sm text-[#E6E9F0] placeholder:text-[#5A6275] outline-none transition-colors"
          style={{
            background: "#1B1F2A",
            border: "1px solid #2E3347",
          }}
          onFocus={e => { e.currentTarget.style.borderColor = "#1a56db"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "#2E3347"; }}
        />
      </SectionCard>

      <SectionCard title="Forwarding" description="Control when and how emails are forwarded">
        {/* Enable toggle */}
        <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: "#1C1F28" }}>
          <div>
            <p className="text-sm font-medium text-[#E6E9F0]">Enable forwarding</p>
            <p className="text-xs text-[#5A6275] mt-0.5">Forward all incoming emails to your personal address</p>
          </div>
          <button
            onClick={() => setForwardingEnabled(p => !p)}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0"
            style={{ background: forwardingEnabled ? "#1a56db" : "#2E3347" }}
            disabled={!personalEmail}
            title={!personalEmail ? "Enter a personal email first" : undefined}
          >
            <span
              className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
              style={{ transform: forwardingEnabled ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </div>

        {/* Keep copy toggle */}
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium text-[#E6E9F0]">Keep a copy in Nexus</p>
            <p className="text-xs text-[#5A6275] mt-0.5">Forwarded emails remain in your Nexus inbox too</p>
          </div>
          <button
            onClick={() => setKeepCopy(p => !p)}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0"
            style={{ background: keepCopy ? "#1a56db" : "#2E3347" }}
          >
            <span
              className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
              style={{ transform: keepCopy ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </div>
      </SectionCard>

      {/* Status pill */}
      {forwardingEnabled && personalEmail && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg"
          style={{ background: "#0f9d5818", border: "1px solid #0f9d5830" }}>
          <span className="h-2 w-2 rounded-full bg-[#0f9d58] flex-shrink-0" />
          <p className="text-xs text-[#0f9d58]">
            Active — emails will be forwarded to <strong>{personalEmail}</strong>
          </p>
        </div>
      )}

      {forwardingEnabled && !personalEmail && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg"
          style={{ background: "#ea433518", border: "1px solid #ea433530" }}>
          <AlertTriangle className="h-3.5 w-3.5 text-[#ea4335] flex-shrink-0" />
          <p className="text-xs text-[#ea4335]">Enter a personal email address to activate forwarding.</p>
        </div>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
        style={{ background: "#1a56db" }}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

function MailRulesTab() {
  const [rules, setRules]     = useState<MailRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName]       = useState("");
  const [action, setAction]   = useState("LABEL");
  const [actionVal, setActionVal] = useState("");
  const [conditions, setConditions] = useState([{ field: "from", op: "contains", value: "" }]);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    fetch("/api/inbox/rules").then(r => r.json()).then((d: MailRule[]) => setRules(d)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || conditions.some(c => !c.value.trim())) { toast.error("Fill in all fields"); return; }
    setSaving(true);
    try {
      const actionData: Record<string, string> = {};
      if (action === "LABEL") actionData.label = actionVal;
      if (action === "MOVE_FOLDER") actionData.folderId = actionVal;
      if (action === "PRIORITY") actionData.priority = actionVal;
      if (action === "FORWARD") actionData.to = actionVal;
      const res = await fetch("/api/inbox/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, conditions, action, actionData }) });
      const data = await res.json() as MailRule & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setRules(prev => [...prev, data]);
      setShowForm(false); setName(""); setActionVal(""); setConditions([{ field: "from", op: "contains", value: "" }]);
      toast.success("Rule created");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  };

  const needsValue = ["LABEL","MOVE_FOLDER","PRIORITY","FORWARD"].includes(action);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[#8A92A6]">{rules.length} rule{rules.length !== 1 ? "s" : ""}</p>
        <button onClick={() => setShowForm(v => !v)} className={btnPrimary}><Plus className="h-4 w-4" /> New Rule</button>
      </div>

      {showForm && (
        <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-5 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[#E6E9F0]">New Rule</h4>
            <button onClick={() => setShowForm(false)} className="p-1 text-[#8A92A6] hover:text-[#E6E9F0] rounded"><X className="w-4 h-4" /></button>
          </div>
          <div>
            <label className="text-xs text-[#8A92A6] mb-1 block">Rule name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Move newsletters" className={inputClass} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-[#8A92A6]">When…</label>
              <button onClick={() => setConditions(p => [...p, { field: "from", op: "contains", value: "" }])} className="text-xs text-[#00C2FF] hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add condition</button>
            </div>
            <div className="space-y-2">
              {conditions.map((cond, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select value={cond.field} onChange={e => setConditions(p => p.map((c,idx) => idx===i ? {...c,field:e.target.value}:c))} className={`${selectClass} text-xs`}>{CONDITION_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}</select>
                  <select value={cond.op} onChange={e => setConditions(p => p.map((c,idx) => idx===i ? {...c,op:e.target.value}:c))} className={`${selectClass} text-xs`}>{CONDITION_OPS.map(o => <option key={o} value={o}>{o}</option>)}</select>
                  <input value={cond.value} onChange={e => setConditions(p => p.map((c,idx) => idx===i ? {...c,value:e.target.value}:c))} placeholder="value" className={`flex-1 ${inputClass} text-xs py-1.5`} />
                  {conditions.length > 1 && <button onClick={() => setConditions(p => p.filter((_,idx) => idx!==i))} className="p-1 text-[#8A92A6] hover:text-[#ea4335]"><X className="w-3.5 h-3.5" /></button>}
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-[#8A92A6] mb-1 block">Then…</label>
            <div className="flex gap-2">
              <select value={action} onChange={e => { setAction(e.target.value); setActionVal(""); }} className={selectClass}>{RULE_ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}</select>
              {needsValue && <input value={actionVal} onChange={e => setActionVal(e.target.value)} placeholder={action==="LABEL"?"Label name":action==="FORWARD"?"email@example.com":"Value"} className={`flex-1 ${inputClass}`} />}
            </div>
          </div>
          <button onClick={() => void handleCreate()} disabled={saving} className={`w-full ${btnPrimary} justify-center py-2`}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Create Rule
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-[#8A92A6] text-sm">Loading…</div>
      ) : rules.length === 0 ? (
        <div className="text-center py-12">
          <Filter className="w-10 h-10 text-[#262b3a] mx-auto mb-3" />
          <p className="text-sm text-[#8A92A6]">No rules yet. Create one to auto-sort your inbox.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <div key={rule.id} className={`bg-[#12151D] border rounded-xl p-4 transition-opacity ${rule.isActive ? "border-[#262A35]" : "border-[#1C1F28] opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#E6E9F0] truncate">{rule.name}</p>
                  <p className="text-xs text-[#8A92A6] mt-0.5">{rule.conditions.map(c => `${c.field} ${c.op} "${c.value}"`).join(" AND ")}</p>
                  <p className="text-xs text-[#00C2FF] mt-0.5">→ {RULE_ACTIONS.find(a => a.value === rule.action)?.label ?? rule.action}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={async () => { setRules(p => p.map(r => r.id===rule.id ? {...r,isActive:!r.isActive}:r)); await fetch(`/api/inbox/rules/${rule.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({isActive:!rule.isActive})}).catch(()=>{}); }} className={`p-1.5 rounded-lg ${rule.isActive?"text-[#00C2FF]":"text-[#262b3a]"} hover:bg-[#1B1F2A]`}><ToggleRight className="w-4 h-4" /></button>
                  <button onClick={async () => { setRules(p => p.filter(r => r.id!==rule.id)); await fetch(`/api/inbox/rules/${rule.id}`,{method:"DELETE"}).catch(()=>{}); toast.success("Rule deleted"); }} className="p-1.5 rounded-lg text-[#8A92A6] hover:text-[#ea4335] hover:bg-[#ea4335]/10"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── My HR Tab (self-service) ─────────────────────────────────────────────────

type MyHR = {
  employeeId: string | null;
  role: string;
  hr: { startDate?: string; endDate?: string; phone?: string; emergencyContactName?: string; emergencyContactPhone?: string };
};

function MyHRTab() {
  const [data, setData] = useState<MyHR | null>(null);
  const [form, setForm] = useState({ phone: "", emergencyContactName: "", emergencyContactPhone: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/me/hr")
      .then(r => r.json())
      .then((d: MyHR) => {
        setData(d);
        setForm({
          phone: d.hr?.phone ?? "",
          emergencyContactName: d.hr?.emergencyContactName ?? "",
          emergencyContactPhone: d.hr?.emergencyContactPhone ?? "",
        });
      })
      .catch(() => toast.error("Failed to load HR record"))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/me/hr", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error();
      toast.success("Contact details saved");
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#00C2FF]" /></div>;

  return (
    <>
      <SectionCard title="Employee record" description="Your employee ID and key dates — assigned and managed by HR">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-[#8A92A6] mb-1 block">Employee number</label>
            <div className="flex items-center gap-2">
              <input readOnly value={data?.employeeId ?? "Not assigned yet"} className={`${inputClass} font-mono ${data?.employeeId ? "" : "text-[#5A6275]"}`} />
              {data?.employeeId && (
                <button
                  type="button"
                  onClick={() => { void navigator.clipboard?.writeText(data.employeeId!); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="h-[42px] flex-none px-3 rounded-[9px] border border-[#2E333F] text-[#8A92A6] hover:text-[#E6E9F0] hover:bg-[#1B1F2A] transition-colors"
                  title="Copy employee number"
                >
                  {copied ? <Check className="h-4 w-4 text-[#0f9d58]" /> : <Copy className="h-4 w-4" />}
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-[#8A92A6] mb-1 block">Start date</label>
            <input readOnly value={data?.hr?.startDate || "—"} className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-medium text-[#8A92A6] mb-1 block">End date</label>
            <input readOnly value={data?.hr?.endDate || "—"} className={inputClass} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Contact & emergency" description="Keep these current so we can reach you and your emergency contact">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-[#8A92A6] mb-1 block flex items-center gap-1"><Phone className="h-3 w-3" /> Contact phone</label>
            <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className={inputClass} placeholder="+44 7700 000000" type="tel" />
          </div>
          <div className="hidden sm:block" />
          <div>
            <label className="text-xs font-medium text-[#8A92A6] mb-1 block">Emergency contact name</label>
            <input value={form.emergencyContactName} onChange={e => setForm(p => ({ ...p, emergencyContactName: e.target.value }))} className={inputClass} placeholder="Full name" />
          </div>
          <div>
            <label className="text-xs font-medium text-[#8A92A6] mb-1 block">Emergency contact phone</label>
            <input value={form.emergencyContactPhone} onChange={e => setForm(p => ({ ...p, emergencyContactPhone: e.target.value }))} className={inputClass} placeholder="+44 7700 000000" type="tel" />
          </div>
        </div>
        <div className="flex justify-end mt-5">
          <button onClick={() => void save()} disabled={saving} className={btnPrimary}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </SectionCard>
    </>
  );
}

// ─── Main SettingsView ────────────────────────────────────────────────────────

export function SettingsView({
  user,
  recentLogins,
  mfaEnabled,
}: {
  user: SettingsUser;
  recentLogins: RecentLogin[];
  mfaEnabled: boolean;
}) {
  const [activeTab, setActiveTab]           = useState<Tab>("profile");
  const [currentMfaEnabled, setMfaEnabled]  = useState(mfaEnabled);

  const isAdmin = ["ADMIN", "CEO", "CISO"].includes(user.role);
  const visibleTabs = ALL_TABS.filter(t => {
    if (t.adminOnly && !isAdmin) return false;
    if (t.roleOnly && !t.roleOnly.includes(user.role)) return false;
    return true;
  });

  return (
    <div className="min-h-screen">
      <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-3.5rem)]">

        {/* ── Mobile: full-width select dropdown ──────────────────────────── */}
        <div className="lg:hidden border-b border-[#262A35]/60 px-4 py-3 glass">
          <div className="relative">
            {/* Icon of active tab */}
            {(() => {
              const active = visibleTabs.find(t => t.id === activeTab);
              const Icon = active?.icon;
              return Icon ? (
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#00C2FF]">
                  <Icon className="h-4 w-4" />
                </span>
              ) : null;
            })()}
            <select
              value={activeTab}
              onChange={e => setActiveTab(e.target.value as Tab)}
              className="w-full appearance-none rounded-xl pl-9 pr-9 py-3 text-sm font-semibold text-[#E6E9F0] outline-none"
              style={{ background: "#1B1F2A", border: "1px solid #2E3347" }}
            >
              {visibleTabs.map(tab => (
                <option key={tab.id} value={tab.id}>{tab.label}</option>
              ))}
            </select>
            {/* Chevron */}
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#5A6275]">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </div>
        </div>

        {/* ── Desktop: sidebar rail ─────────────────────────────────────────── */}
        <aside className="hidden lg:flex lg:w-[220px] flex-none border-r border-[#262A35]/50 py-[18px] px-3 glass-strong">
          <nav className="flex flex-col gap-1 w-full">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-[11px] text-left rounded-[9px] h-10 px-3 w-full transition-colors ${
                    active
                      ? "bg-[#00C2FF]/10 text-[#00C2FF]"
                      : "text-[#8A92A6] hover:bg-[#1B1F2A] hover:text-[#E6E9F0]"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                  <span className="text-[13.5px] font-semibold truncate">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 overflow-y-auto px-4 py-6 sm:px-8 lg:px-11 lg:py-9">
          <div className="max-w-[620px] mx-auto lg:mx-0">
            {(() => {
              const tab = visibleTabs.find(t => t.id === activeTab);
              return (
                <div>
                  <h2 className="text-[22px] font-extrabold tracking-[-0.5px] text-[#E6E9F0] mb-1.5">{tab?.label}</h2>
                  <p className="text-[13.5px] text-[#6B7385] mb-8">{tab?.description}</p>
                </div>
              );
            })()}

            {activeTab === "profile"       && <ProfileTab userId={user.id} />}
            {activeTab === "hr"            && <MyHRTab />}
            {activeTab === "appearance"    && <AppearanceTab />}
            {activeTab === "notifications" && <NotificationsTab />}
            {activeTab === "signature"     && <SignatureTab userName={user.fullName} />}
            {activeTab === "mail-rules"    && <MailRulesTab />}
            {activeTab === "forwarding"    && <ForwardingTab />}

            {activeTab === "mailboxes" && <MailboxesTab userEmail={user.email} />}

            {activeTab === "security" && (
              <>
                <SectionCard title="Two-Factor Authentication" description="Add an extra layer of security to your account">
                  <MFASetup mfaEnabled={currentMfaEnabled} onStatusChange={() => setMfaEnabled(p => !p)} />
                </SectionCard>
                <SectionCard title="Active Sessions" description="Devices currently signed in to your account">
                  <SessionManager />
                </SectionCard>
                <SectionCard title="Recent Login Activity" description="Last 10 sign-in attempts">
                  <div className="space-y-2">
                    {recentLogins.length === 0 ? (
                      <p className="text-sm text-center text-[#8A92A6] py-4">No login history.</p>
                    ) : recentLogins.map(login => (
                      <div key={login.id} className="bg-[#1B1F2A] border border-[#262A35] rounded-xl px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${login.success ? "bg-emerald-500" : "bg-red-500"}`} />
                          <div>
                            <p className={`text-xs font-semibold ${login.success ? "text-emerald-400" : "text-red-400"}`}>{login.success ? "Successful" : "Failed"}</p>
                            <p className="text-xs text-[#8A92A6]">{login.ip ?? "Unknown IP"} · {login.userAgent?.split(" ")[0] ?? "Unknown"}</p>
                          </div>
                        </div>
                        <p className="text-xs text-[#8A92A6]">{new Date(login.createdAt).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </SectionCard>
                <SectionCard title="Password">
                  <div className="flex items-center justify-between">
                    <div><p className="text-sm text-[#E6E9F0]">••••••••••••</p><p className="text-xs text-[#8A92A6]">Change via reset link</p></div>
                    <a href="/reset-password" className="text-sm font-medium text-[#00C2FF] hover:text-[#47d6ff] transition">Change password →</a>
                  </div>
                </SectionCard>
              </>
            )}

            {activeTab === "language" && <LanguageTab />}
            {activeTab === "privacy"  && <PrivacyTab userId={user.id} />}
            {activeTab === "ai"       && <AITab />}
            {activeTab === "api-tokens" && (
              <>
                <div className="mb-4 p-4 bg-[#1B1F2A] rounded-xl border border-[#262A35]">
                  <p className="text-xs text-[#8A92A6]">Personal access tokens allow external tools to interact with the CyberSage API on your behalf. Treat them like passwords — never share or commit them.</p>
                </div>
                <APITokensTab />
              </>
            )}
            {activeTab === "roles" && isAdmin && <CustomRolesTab />}
          </div>
        </main>
      </div>
    </div>
  );
}
