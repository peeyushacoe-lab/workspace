"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Mail, MapPin, Globe, Phone, Building2, ArrowLeft,
  Loader2, Clock, User,
} from "lucide-react";
import { avatarGradient } from "@/lib/avatar";
import { roleLabels } from "@/lib/auth";
import type { UserRole } from "@/generated/prisma/enums";

type PersonDetail = {
  id: string;
  fullName: string;
  displayName: string | null;
  email: string;
  role: UserRole;
  avatarUrl: string | null;
  coverUrl: string | null;
  jobTitle: string | null;
  department: string | null;
  company: string | null;
  phone: string | null;
  website: string | null;
  location: string | null;
  timezone: string | null;
  bio: string | null;
  pronouns: string | null;
  statusMessage: string | null;
  statusEmoji: string | null;
  createdAt: string;
};

type PresenceData = { status: string; updatedAt: string };

const STATUS_COLORS: Record<string, string> = {
  online: "var(--ok)",
  away: "var(--warn)",
  busy: "var(--crit)",
  in_meeting: "var(--violet)",
  dnd: "var(--crit)",
  offline: "var(--subtle)",
};

const STATUS_LABELS: Record<string, string> = {
  online: "Online",
  away: "Away",
  busy: "Busy",
  in_meeting: "In a meeting",
  dnd: "Do not disturb",
  offline: "Offline",
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

export default function PersonProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [presence, setPresence] = useState<PresenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/people/${id}`).then((r) => r.ok ? r.json() as Promise<PersonDetail> : Promise.reject(r.status)),
      fetch(`/api/presence?userIds=${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => r.ok ? r.json() as Promise<Record<string, PresenceData>> : Promise.resolve({} as Record<string, PresenceData>)),
    ])
      .then(([p, pres]) => {
        setPerson(p);
        setPresence((pres as Record<string, PresenceData>)[id] ?? null);
      })
      .catch((err) => {
        if (err === 404) setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-full bg-surface flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-subtle" />
      </div>
    );
  }

  if (notFound || !person) {
    return (
      <div className="min-h-full bg-surface flex flex-col items-center justify-center gap-4">
        <User className="w-12 h-12 text-subtle" />
        <p className="text-subtle text-sm">Profile not found</p>
        <button onClick={() => router.back()} className="text-xs text-accent hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const presenceStatus = presence?.status ?? "offline";
  const presenceColor = STATUS_COLORS[presenceStatus] ?? "var(--subtle)";
  const presenceLabel = STATUS_LABELS[presenceStatus] ?? "Offline";

  return (
    <div className="min-h-full bg-surface text-foreground">
      {/* Back button */}
      <div className="px-6 pt-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-xs text-subtle hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to People
        </button>
      </div>

      {/* Cover */}
      <div
        className="h-32 mx-6 mt-4 rounded-xl"
        style={{
          background: person.coverUrl
            ? `url(${person.coverUrl}) center/cover no-repeat`
            : avatarGradient(person.email),
          opacity: person.coverUrl ? 1 : 0.3,
        }}
      />

      {/* Profile section */}
      <div className="px-6 -mt-10 pb-10 max-w-3xl">
        {/* Avatar row */}
        <div className="flex items-end gap-4 mb-6">
          <div className="relative">
            {person.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={person.avatarUrl}
                alt={person.fullName}
                className="w-20 h-20 rounded-full object-cover border-4 border-border"
              />
            ) : (
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white border-4 border-border"
                style={{ background: avatarGradient(person.email) }}
              >
                {initials(person.fullName)}
              </div>
            )}
            {/* Presence dot */}
            <span
              className="absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-border"
              style={{ background: presenceColor }}
              title={presenceLabel}
            />
          </div>

          <div className="pb-2">
            <h1 className="text-xl font-bold text-foreground">
              {person.displayName || person.fullName}
              {person.pronouns && (
                <span className="ml-2 text-xs font-normal text-subtle">({person.pronouns})</span>
              )}
            </h1>
            {person.jobTitle && (
              <p className="text-sm text-muted">{person.jobTitle}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-full bg-surface-sunken text-muted border border-border">
                {roleLabels[person.role] ?? person.role}
              </span>
              <span
                className="flex items-center gap-1 text-[11px] font-medium"
                style={{ color: presenceColor }}
              >
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: presenceColor }} />
                {person.statusEmoji && <span>{person.statusEmoji}</span>}
                {person.statusMessage || presenceLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Left: bio + contact */}
          <div className="md:col-span-2 space-y-5">
            {person.bio && (
              <div className="bg-surface border border-border rounded-xl p-5">
                <h2 className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">About</h2>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{person.bio}</p>
              </div>
            )}

            <div className="bg-surface border border-border rounded-xl p-5">
              <h2 className="text-xs font-semibold text-subtle uppercase tracking-wider mb-4">Contact</h2>
              <div className="space-y-3">
                <a
                  href={`mailto:${person.email}`}
                  className="flex items-center gap-3 text-sm text-muted hover:text-accent transition-colors"
                >
                  <Mail className="w-4 h-4 flex-shrink-0 text-subtle" />
                  <span className="font-mono truncate">{person.email}</span>
                </a>
                {person.phone && (
                  <div className="flex items-center gap-3 text-sm text-muted">
                    <Phone className="w-4 h-4 flex-shrink-0 text-subtle" />
                    <span>{person.phone}</span>
                  </div>
                )}
                {person.website && (
                  <a
                    href={person.website.startsWith("http") ? person.website : `https://${person.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 text-sm text-muted hover:text-accent transition-colors"
                  >
                    <Globe className="w-4 h-4 flex-shrink-0 text-subtle" />
                    <span className="truncate">{person.website}</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Right: details */}
          <div className="space-y-5">
            <div className="bg-surface border border-border rounded-xl p-5">
              <h2 className="text-xs font-semibold text-subtle uppercase tracking-wider mb-4">Details</h2>
              <div className="space-y-3">
                {person.department && (
                  <div className="flex items-start gap-2.5">
                    <Building2 className="w-3.5 h-3.5 text-subtle mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-subtle">Department</p>
                      <p className="text-sm text-foreground">{person.department}</p>
                    </div>
                  </div>
                )}
                {person.location && (
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-3.5 h-3.5 text-subtle mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-subtle">Location</p>
                      <p className="text-sm text-foreground">{person.location}</p>
                    </div>
                  </div>
                )}
                {person.timezone && person.timezone !== "UTC" && (
                  <div className="flex items-start gap-2.5">
                    <Clock className="w-3.5 h-3.5 text-subtle mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] text-subtle">Timezone</p>
                      <p className="text-sm text-foreground">{person.timezone}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2.5">
                  <User className="w-3.5 h-3.5 text-subtle mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-subtle">Member since</p>
                    <p className="text-sm text-foreground">
                      {new Date(person.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="bg-surface border border-border rounded-xl p-5">
              <h2 className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">Actions</h2>
              <a
                href={`/inbox?compose=${encodeURIComponent(person.email)}`}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors"
              >
                <Mail className="w-4 h-4" />
                Send email
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
