"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Mail, MapPin, Globe, Phone, Building2, ArrowLeft,
  Loader2, Clock, User, MessageSquare, CalendarPlus, Users,
  FileText, Table2, Presentation, StickyNote, CalendarDays, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { AppLink } from "@/components/AppLink";
import { avatarGradient } from "@/lib/avatar";
import { usableMediaUrl } from "@/lib/media-url";
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

  // ── Added by getProfileExtras ──
  isSelf: boolean;
  // Reporting line and teams are directory facts. The three `shared*` lists are
  // filtered by what the VIEWER can already reach, not by what this person has
  // been doing — see lib/people-profile.ts.
  manager: PersonRef | null;
  directReports: PersonRef[];
  teams: { id: string; name: string; isLead: boolean }[];
  sharedDocs: { id: string; title: string; kind: DocKind; updatedAt: string; href: string }[];
  sharedEvents: { id: string; title: string; startAt: string; endAt: string; allDay: boolean; isAttendee: boolean }[];
  sharedChannels: { id: string; name: string; type: string }[];
};

type PersonRef = { id: string; fullName: string; jobTitle: string | null; avatarUrl: string | null };
type DocKind = "doc" | "sheet" | "slide" | "note";

const DOC_ICONS: Record<DocKind, React.ElementType> = {
  doc: FileText,
  sheet: Table2,
  slide: Presentation,
  note: StickyNote,
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

/**
 * Section wrapper. Renders nothing when there is no content — an empty "Teams"
 * frame reads as broken, whereas an absent one reads as "not applicable", which
 * is the truth for most people on most sections.
 */
function ProfileSection({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string;
  icon: React.ElementType;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <h2 className="mb-4 flex items-center gap-2 text-xs font-semibold text-subtle">
        <Icon className="w-3.5 h-3.5" />
        {title}
      </h2>
      {children}
    </div>
  );
}

/** Compact person row, used for the manager and each direct report. */
function PersonRow({ person, email }: { person: PersonRef; email?: string }) {
  // usableMediaUrl, not the raw column: when R2_PUBLIC_URL is unset, avatarUrl
  // holds a bare storage key like "cmqwr7xxo0000...", which has no scheme, so the
  // browser resolves it against the current page and 404s. Returning null lets
  // the initials fallback below do its job.
  const avatar = usableMediaUrl(person.avatarUrl);
  return (
    <Link
      href={`/people/${person.id}`}
      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-hover"
    >
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt={person.fullName} className="h-7 w-7 flex-shrink-0 rounded-full object-cover" />
      ) : (
        <div
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
          style={{ background: avatarGradient(email ?? person.id) }}
        >
          {initials(person.fullName)}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-foreground">{person.fullName}</p>
        {person.jobTitle && <p className="truncate text-[11px] text-subtle">{person.jobTitle}</p>}
      </div>
    </Link>
  );
}

export default function PersonProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [presence, setPresence] = useState<PresenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [startingDm, setStartingDm] = useState(false);

  /**
   * Start (or reopen) the DM with this person.
   *
   * Goes through /api/chat/dm rather than POSTing a channel directly, because
   * that route find-or-creates: clicking this twice must reopen the same
   * conversation, not fork a second one holding half the history.
   */
  const startConversation = useCallback(async () => {
    if (!id) return;
    setStartingDm(true);
    try {
      const res = await fetch("/api/chat/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not open the conversation");
      }
      const { channelId } = (await res.json()) as { channelId: string };
      // Full navigation, not router.push: Connect may live on its own hostname,
      // and ChatView reads ?channel= on mount.
      window.location.href = `/connect/chat?channel=${channelId}`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the conversation");
      setStartingDm(false);
    }
  }, [id]);

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

  // Your own profile hides "Start conversation" — you can't DM yourself, and the
  // API rejects it anyway. Comes from the server so the page needs no extra
  // request to identify the viewer.
  const isSelf = person.isSelf;

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
            {usableMediaUrl(person.avatarUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={usableMediaUrl(person.avatarUrl)!}
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
                <h2 className="text-xs font-semibold text-subtle mb-3">About</h2>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{person.bio}</p>
              </div>
            )}

            <div className="bg-surface border border-border rounded-xl p-5">
              <h2 className="text-xs font-semibold text-subtle mb-4">Contact</h2>
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
              <h2 className="text-xs font-semibold text-subtle mb-4">Details</h2>
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

            {/* ── Reporting line ── */}
            <ProfileSection title="Reports to" icon={ChevronUp} count={person.manager ? 1 : 0}>
              {person.manager && <PersonRow person={person.manager} />}
            </ProfileSection>

            <ProfileSection title={`Direct reports (${person.directReports.length})`} icon={Users} count={person.directReports.length}>
              <div className="space-y-1">
                {person.directReports.map((r) => <PersonRow key={r.id} person={r} />)}
              </div>
            </ProfileSection>

            {/* ── Teams ── */}
            <ProfileSection title="Teams" icon={Users} count={person.teams.length}>
              <div className="flex flex-wrap gap-1.5">
                {person.teams.map((t) => (
                  <Link
                    key={t.id}
                    href="/teams"
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-sunken px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground"
                  >
                    {t.name}
                    {t.isLead && <span className="text-accent">· lead</span>}
                  </Link>
                ))}
              </div>
            </ProfileSection>

            {/* ── Quick actions ── */}
            <div className="bg-surface border border-border rounded-xl p-5">
              <h2 className="text-xs font-semibold text-subtle mb-3">Actions</h2>
              <div className="space-y-2">
                {!isSelf && (
                  <button
                    type="button"
                    onClick={() => void startConversation()}
                    disabled={startingDm}
                    className="flex w-full items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
                  >
                    {startingDm
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <MessageSquare className="w-4 h-4" />}
                    Start conversation
                  </button>
                )}

                {/* /compose?to= — the previous link was /inbox?compose=, a param
                    no view has ever read, so "Send email" did nothing. */}
                <AppLink
                  href={`/compose?to=${encodeURIComponent(person.email)}`}
                  className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-hover hover:text-foreground"
                >
                  <Mail className="w-4 h-4" />
                  Send email
                </AppLink>

                <AppLink
                  href={`/calendar?invite=${encodeURIComponent(person.email)}`}
                  className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-hover hover:text-foreground"
                >
                  <CalendarPlus className="w-4 h-4" />
                  Schedule meeting
                </AppLink>
              </div>
            </div>
          </div>
        </div>

        {/* ── Shared work ──
            Everything below is scoped to what YOU can already open. It is not a
            feed of what this person has been doing. */}
        {(person.sharedDocs.length > 0 ||
          person.sharedEvents.length > 0 ||
          person.sharedChannels.length > 0) && (
          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
            <ProfileSection title="Documents you share" icon={FileText} count={person.sharedDocs.length}>
              <div className="space-y-1">
                {person.sharedDocs.map((d) => {
                  const Icon = DOC_ICONS[d.kind] ?? FileText;
                  return (
                    <AppLink
                      key={d.id}
                      href={d.href}
                      className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-hover"
                    >
                      <Icon className="w-3.5 h-3.5 flex-shrink-0 text-accent" />
                      <span className="truncate text-[13px] text-foreground">{d.title}</span>
                    </AppLink>
                  );
                })}
              </div>
            </ProfileSection>

            <ProfileSection title="Shared events" icon={CalendarDays} count={person.sharedEvents.length}>
              <div className="space-y-1">
                {person.sharedEvents.map((e) => (
                  <Link
                    key={e.id}
                    href="/calendar"
                    className="-mx-2 block rounded-lg px-2 py-1.5 transition-colors hover:bg-hover"
                  >
                    <p className="truncate text-[13px] text-foreground">{e.title}</p>
                    <p className="text-[11px] text-subtle">
                      {new Date(e.startAt).toLocaleDateString("en-GB", {
                        day: "numeric", month: "short", timeZone: "UTC",
                      })}
                      {e.isAttendee && " · you're invited"}
                    </p>
                  </Link>
                ))}
              </div>
            </ProfileSection>

            <ProfileSection title="Conversations in common" icon={MessageSquare} count={person.sharedChannels.length}>
              <div className="space-y-1">
                {person.sharedChannels.map((c) => (
                  <AppLink
                    key={c.id}
                    href={`/connect/chat?channel=${c.id}`}
                    className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-hover"
                  >
                    <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-subtle" />
                    <span className="truncate text-[13px] text-foreground">
                      {c.type === "DIRECT" ? c.name : `#${c.name}`}
                    </span>
                  </AppLink>
                ))}
              </div>
            </ProfileSection>
          </div>
        )}
      </div>
    </div>
  );
}
