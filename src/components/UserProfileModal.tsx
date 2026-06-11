"use client";
import { useEffect, useState } from "react";
import { X, Mail, MapPin, Globe, Building2, Briefcase, Clock } from "lucide-react";
import { roleLabels } from "@/lib/auth";
import type { UserRole } from "@/generated/prisma/enums";

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-[#111827] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Cover / header */}
        <div className="relative h-24 bg-gradient-to-r from-[#0c2340] to-[#0a2218]">
          {profile?.coverUrl && (
            <img src={profile.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white/70 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Avatar */}
        <div className="px-6 pb-4">
          <div className="-mt-10 mb-3">
            {profile?.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={displayName}
                className="w-20 h-20 rounded-full border-4 border-[#111827] object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-full border-4 border-[#111827] bg-cyan-500 flex items-center justify-center text-2xl font-semibold text-white">
                {initials || "?"}
              </div>
            )}
          </div>

          {loading && (
            <div className="py-8 text-center text-slate-400 text-sm">Loading profile…</div>
          )}

          {error && (
            <div className="py-8 text-center text-red-400 text-sm">{error}</div>
          )}

          {profile && !loading && (
            <>
              <div className="mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-semibold text-white">{displayName}</h2>
                  {profile.pronouns && (
                    <span className="text-xs text-slate-500 font-normal">({profile.pronouns})</span>
                  )}
                </div>
                {(profile.statusEmoji || profile.statusMessage) && (
                  <p className="text-sm text-slate-400 mt-0.5">
                    {profile.statusEmoji} {profile.statusMessage}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-cyan-950/60 text-cyan-400 border border-cyan-900/40">
                    {roleLabel}
                  </span>
                  {profile.jobTitle && (
                    <span className="text-sm text-slate-300">{profile.jobTitle}</span>
                  )}
                </div>
                {profile.department && (
                  <p className="text-xs text-slate-500 mt-1">{profile.department}</p>
                )}
              </div>

              {profile.bio && (
                <p className="text-sm text-slate-300 leading-relaxed mb-4 border-t border-white/6 pt-4">
                  {profile.bio}
                </p>
              )}

              <div className="space-y-2 mb-5">
                <InfoRow icon={<Mail size={14} />} value={profile.email} />
                {profile.location && <InfoRow icon={<MapPin size={14} />} value={profile.location} />}
                {profile.department && <InfoRow icon={<Building2 size={14} />} value={profile.department} />}
                {profile.jobTitle && <InfoRow icon={<Briefcase size={14} />} value={profile.jobTitle} />}
                {profile.timezone && <InfoRow icon={<Clock size={14} />} value={profile.timezone} />}
                {profile.website && (
                  <InfoRow
                    icon={<Globe size={14} />}
                    value={profile.website}
                    link={profile.website}
                  />
                )}
              </div>

              <div className="flex gap-3 border-t border-white/6 pt-4">
                <button
                  onClick={() => { onCompose?.(profile.email); onClose(); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-[#003543] font-semibold text-sm py-2.5 rounded-lg transition-colors"
                >
                  <Mail size={15} />
                  Send email
                </button>
                <button
                  onClick={() => { navigator.clipboard?.writeText(profile.email); }}
                  className="px-4 py-2.5 rounded-lg border border-white/10 hover:border-white/20 text-slate-400 hover:text-white text-sm transition-colors"
                  title="Copy email address"
                >
                  Copy email
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
    <div className="flex items-center gap-2.5 text-sm text-slate-400">
      <span className="text-slate-500 flex-shrink-0">{icon}</span>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400 truncate transition-colors">
          {value}
        </a>
      ) : (
        <span className="truncate">{value}</span>
      )}
    </div>
  );
}
