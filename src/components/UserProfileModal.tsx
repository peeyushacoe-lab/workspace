"use client";
import { useEffect, useState } from "react";
import { X, Mail, MapPin, Globe, Building2, Briefcase, Clock, Loader2 } from "lucide-react";
import { roleLabels } from "@/lib/auth";
import type { UserRole } from "@/generated/prisma/enums";
import { usableMediaUrl } from "@/lib/media-url";

interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  displayName: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  role: UserRole;
  customRole: string | null;
  jobTitle: string | null;
  department: string | null;
  bio: string | null;
  statusEmoji: string | null;
  statusMessage: string | null;
  pronouns: string | null;
  location: string | null;
  timezone: string | null;
  website: string | null;
  createdAt: string;
}

interface Props {
  userId: string | null;
  onClose: () => void;
  onCompose?: (email: string) => void;
}

// Consistent avatar colour palette (matches SidebarLayout)
const AVATAR_COLORS = [
  { bg: "bg-accent", text: "text-accent-foreground" },
  { bg: "bg-violet", text: "text-white" },
  { bg: "bg-ok", text: "text-white" },
  { bg: "bg-warn", text: "text-white" },
  { bg: "bg-crit", text: "text-white" },
  { bg: "bg-accent", text: "text-white" },
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function UserProfileModal({ userId, onClose, onCompose }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setProfile(null);
    setError(null);
    fetch(`/api/workspace/users/${userId}`)
      .then(r => r.ok ? r.json() as Promise<UserProfile> : Promise.reject(new Error("Not found")))
      .then(setProfile)
      .catch(() => setError("Could not load profile"))
      .finally(() => setLoading(false));
  }, [userId]);

  if (!userId) return null;

  const displayName = profile?.displayName ?? profile?.fullName ?? "";
  const initials = displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const roleLabel = profile ? (profile.customRole ?? roleLabels[profile.role] ?? profile.role) : "";
  const color = avatarColor(displayName || "?");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-sm bg-surface border border-border rounded-2xl shadow-xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Cover banner */}
        <div className="relative h-24 bg-gradient-to-r from-accent-soft to-accent-soft">
          {profile?.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-surface/80 hover:bg-surface text-muted hover:text-foreground transition-colors shadow-sm"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content area — avatar overlaps cover */}
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          {/* Avatar — -mt-10 pulls it up to overlap cover bottom */}
          <div className="-mt-10 mb-3 flex items-end justify-between">
            <div className="rounded-full border-4 border-border shadow-sm overflow-hidden flex-shrink-0">
              {usableMediaUrl(profile?.avatarUrl) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={usableMediaUrl(profile?.avatarUrl) as string}
                  alt={displayName}
                  className="w-20 h-20 object-cover"
                />
              ) : (
                <div className={`w-20 h-20 ${color.bg} ${color.text} flex items-center justify-center text-2xl font-semibold`}>
                  {initials || "?"}
                </div>
              )}
            </div>
          </div>

          {loading && (
            <div className="py-8 flex items-center justify-center gap-2 text-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading profile…
            </div>
          )}

          {error && (
            <div className="py-6 text-center text-crit text-sm">{error}</div>
          )}

          {profile && !loading && (
            <>
              <div className="mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold text-foreground">{displayName}</h2>
                  {profile.pronouns && (
                    <span className="text-xs text-subtle">({profile.pronouns})</span>
                  )}
                </div>
                {(profile.statusEmoji || profile.statusMessage) && (
                  <p className="text-sm text-muted mt-0.5">
                    {profile.statusEmoji} {profile.statusMessage}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent-soft text-accent border border-accent/20">
                    {roleLabel}
                  </span>
                  {profile.jobTitle && (
                    <span className="text-sm text-muted">{profile.jobTitle}</span>
                  )}
                </div>
                {profile.department && (
                  <p className="text-xs text-subtle mt-1">{profile.department}</p>
                )}
              </div>

              {profile.bio && (
                <p className="text-sm text-muted leading-relaxed mb-4 border-t border-border pt-4">
                  {profile.bio}
                </p>
              )}

              <div className="space-y-2 mb-5">
                <InfoRow icon={<Mail className="w-3.5 h-3.5" />} value={profile.email} />
                {profile.location && <InfoRow icon={<MapPin className="w-3.5 h-3.5" />} value={profile.location} />}
                {profile.department && <InfoRow icon={<Building2 className="w-3.5 h-3.5" />} value={profile.department} />}
                {profile.jobTitle && <InfoRow icon={<Briefcase className="w-3.5 h-3.5" />} value={profile.jobTitle} />}
                {profile.timezone && <InfoRow icon={<Clock className="w-3.5 h-3.5" />} value={profile.timezone} />}
                {profile.website && (
                  <InfoRow icon={<Globe className="w-3.5 h-3.5" />} value={profile.website} link={profile.website} />
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 border-t border-border pt-4">
                <button
                  onClick={() => { onCompose?.(profile.email); onClose(); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-accent-foreground font-semibold text-sm py-2.5 rounded-lg transition-colors"
                >
                  <Mail size={14} />
                  Send email
                </button>
                <button
                  onClick={() => { void navigator.clipboard?.writeText(profile.email); }}
                  className="px-4 py-2.5 rounded-lg border border-border hover:bg-surface-sunken text-muted hover:text-foreground text-sm transition-colors"
                  title="Copy email address"
                >
                  Copy
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, value, link }: { icon: React.ReactNode; value: string; link?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <span className="text-subtle flex-shrink-0">{icon}</span>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="hover:text-accent truncate transition-colors">
          {value}
        </a>
      ) : (
        <span className="truncate">{value}</span>
      )}
    </div>
  );
}
