/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Video,
  PhoneOff,
  Plus,
  Users,
  Clock,
  Calendar,
  CheckCircle,
  Loader2,
  X,
  Copy,
  Check,
  Sparkles,
  MonitorPlay,
  Trash2,
  ExternalLink,
  RefreshCw,
  ChevronLeft,
} from "lucide-react";
import { formatDistanceToNow, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { avatarGradient } from "@/lib/avatar";
import { useJoinPreferences } from "@/components/connect/useJoinPreferences";
import { loadJitsiExternalApi, type JitsiExternalApi } from "@/lib/jitsi";
import { IconButton } from "@/components/ui/icon-button";
import { Panel } from "@/components/ui/panel";
import { Mic, MicOff, VideoOff, MonitorUp, Users as UsersIcon } from "lucide-react";

type MeetingStatus = "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";

type Participant = {
  id: string;
  userId: string;
  role: string;
  joinedAt: string | null;
  user: { id: string; fullName: string; avatarUrl: string | null };
};

type Meeting = {
  id: string;
  title: string;
  description: string | null;
  roomName: string;
  status: MeetingStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  aiSummary: string | null;
  transcriptUrl: string | null;
  organizer: { id: string; fullName: string; avatarUrl: string | null };
  participants: Participant[];
  createdAt: string;
};

type JoinInfo = {
  roomName: string;
  jitsiUrl: string;
  jitsiDomain: string;
  userId: string;
  userName: string;
};

type InMeetingState = {
  meeting: Meeting;
  joinInfo: JoinInfo;
  elapsed: number;
};

function Avatar({ name, url, size = "md" }: { name: string; url?: string | null; size?: "sm" | "md" | "lg" }) {
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const cls = size === "sm" ? "w-7 h-7 text-xs" : size === "lg" ? "w-12 h-12 text-base" : "w-9 h-9 text-sm";
  if (url) return <img src={url} className={`${cls} rounded-full object-cover flex-shrink-0`} alt={name} />;
  return (
    <div className={`${cls} rounded-full bg-accent/20 text-accent font-semibold flex items-center justify-center flex-shrink-0`}>
      {initials}
    </div>
  );
}

function StatusBadge({ status }: { status: MeetingStatus }) {
  const config = {
    LIVE:      { label: "Live",      cls: "bg-ok/15 text-ok border border-ok/30" },
    SCHEDULED: { label: "Scheduled", cls: "bg-accent/15 text-accent border border-accent/30" },
    ENDED:     { label: "Ended",     cls: "bg-surface-sunken text-muted border border-border" },
    CANCELLED: { label: "Cancelled", cls: "bg-crit/15 text-crit border border-crit/30" },
  };
  const { label, cls } = config[status];
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function NewMeetingModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (m: Meeting) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [isInstant, setIsInstant] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/meet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          scheduledAt: !isInstant && scheduledAt ? scheduledAt : undefined,
          isInstant,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const meeting = await res.json() as Meeting;
      toast.success("Meeting created");
      onCreated(meeting);
    } catch {
      toast.error("Failed to create meeting");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60  p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-accent" />
            <h2 className="text-base font-semibold text-foreground">New Meeting</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Meeting title</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Weekly sync, design review…"
              className="w-full bg-surface-sunken border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-subtle outline-none focus:border-accent/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Agenda, notes…"
              className="w-full bg-surface-sunken border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-subtle outline-none focus:border-accent/40 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setIsInstant(true)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                isInstant
                  ? "bg-accent/15 border-accent/40 text-accent"
                  : "bg-surface-sunken border-border text-muted hover:border-accent/20"
              }`}
            >
              <Video className="w-4 h-4" /> Start now
            </button>
            <button
              onClick={() => setIsInstant(false)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                !isInstant
                  ? "bg-accent/15 border-accent/40 text-accent"
                  : "bg-surface-sunken border-border text-muted hover:border-accent/20"
              }`}
            >
              <Calendar className="w-4 h-4" /> Schedule
            </button>
          </div>

          {!isInstant && (
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">Date & Time</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full bg-surface-sunken border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-accent/40"
              />
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-surface-sunken text-muted text-sm font-medium hover:bg-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
            {isInstant ? "Start meeting" : "Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

type MeetingParticipant = { id: string; displayName: string };

/**
 * The live meeting room — Connect's own chrome around the Jitsi surface.
 *
 * Previously a raw `<iframe src="{url}#config.foo=bar&...">` — hash-param
 * config, no script, no JitsiMeetExternalAPI instance. That embeds Jitsi's own
 * default toolbar with no way to react to state (mute, camera, who's in the
 * call) or drive it programmatically; the only integration point was
 * `postMessage`-free, one-way. Rebuilt on the External API (already used by
 * CallStage.tsx for 1:1 calls, via the shared `loadJitsiExternalApi()`
 * loader) specifically so this header/control-bar/participants-panel chrome
 * can exist at all — Jitsi's own toolbar is turned off
 * (`TOOLBAR_BUTTONS: []`) and every control below is this app's own,
 * talking to the call over `executeCommand`/`addListener`.
 */
function InMeetingRoom({
  state,
  onLeave,
  onEnd,
  currentUserId,
}: {
  state: InMeetingState;
  onLeave: () => void;
  onEnd: () => void;
  currentUserId: string;
}) {
  const { meeting, joinInfo, elapsed } = state;
  const isHost = meeting.organizer.id === currentUserId;
  const [copied, setCopied] = useState(false);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [participants, setParticipants] = useState<MeetingParticipant[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiExternalApi | null>(null);
  const joinPrefs = useJoinPreferences();

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const copyLink = () => {
    navigator.clipboard.writeText(joinInfo.jitsiUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  useEffect(() => {
    let disposed = false;

    loadJitsiExternalApi()
      .then((JitsiMeetExternalAPI) => {
        if (disposed || !containerRef.current) return;

        const api = new JitsiMeetExternalAPI(joinInfo.jitsiDomain, {
          roomName: joinInfo.roomName,
          parentNode: containerRef.current,
          width: "100%",
          height: "100%",
          userInfo: { displayName: joinInfo.userName },
          configOverwrite: {
            prejoinPageEnabled: false,
            // Settings → Calls & meetings. The prejoin page is disabled, so
            // these are the only chance to arrive muted — without them the
            // preference would be silently ignored and someone who asked to
            // join quietly would join live.
            startWithAudioMuted: joinPrefs.joinMuted,
            startWithVideoMuted: joinPrefs.joinCameraOff,
            disableDeepLinking: true,
            enableWelcomePage: false,
            disableThirdPartyRequests: true,
            // The header above already carries a running timer — a second one
            // baked into the Jitsi surface itself would be a duplicate clock.
            hideConferenceTimer: true,
            defaultBackground: "#0f1321",
          },
          interfaceConfigOverwrite: {
            // The whole point of moving off the hash-param iframe: this app's
            // own control bar replaces Jitsi's, rather than living alongside it.
            TOOLBAR_BUTTONS: [],
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_POWERED_BY: false,
            DISPLAY_WELCOME_FOOTER: false,
            APP_NAME: "Sage Connect",
            NATIVE_APP_NAME: "Sage Connect",
            PROVIDER_NAME: "Cybersage",
            DEFAULT_BACKGROUND: "#0f1321",
          },
        });
        apiRef.current = api;

        const refreshRoster = () => {
          try {
            setParticipants(api.getParticipantsInfo().map((p) => ({ id: p.participantId, displayName: p.displayName || "Guest" })));
          } catch {
            /* API not ready for this call yet — next event will retry */
          }
        };

        api.addListener("videoConferenceJoined", refreshRoster);
        api.addListener("participantJoined", refreshRoster);
        api.addListener("participantLeft", refreshRoster);
        api.addListener("audioMuteStatusChanged", (e) => setMuted(Boolean((e as { muted?: boolean })?.muted)));
        api.addListener("videoMuteStatusChanged", (e) => setVideoOff(Boolean((e as { muted?: boolean })?.muted)));
        api.addListener("screenSharingStatusChanged", (e) => setSharingScreen(Boolean((e as { on?: boolean })?.on)));
        // A safety net, not the primary exit path — with our own toolbar
        // replacing Jitsi's, there's no in-call hangup button to trigger this,
        // but a dropped connection or host-ended call still fires it.
        api.addListener("readyToClose", () => onLeave());
      })
      .catch((err) => {
        console.error("[MeetView] Failed to load Jitsi External API:", err);
        toast.error("Couldn't connect to the meeting server");
      });

    return () => {
      disposed = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
    // roomName/domain are stable for the lifetime of a call; intentionally not re-running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinInfo.roomName]);

  const handleLeaveClick = () => {
    apiRef.current?.dispose();
    apiRef.current = null;
    onLeave();
  };

  return (
    <div className="fixed inset-0 z-50 bg-surface flex flex-col">
      {/* Slim header */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-surface border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-ok animate-pulse" />
          <span className="text-sm font-semibold text-foreground">{meeting.title}</span>
          <span className="text-xs text-muted tabular-nums">{formatElapsed(elapsed)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-sunken text-xs text-muted hover:bg-hover transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-ok" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy invite link"}
          </button>
          {isHost && (
            <button
              onClick={onEnd}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-crit/20 border border-crit/30 text-crit text-xs font-medium hover:bg-crit/30 transition-colors"
            >
              End for all
            </button>
          )}
        </div>
      </div>

      {/* Jitsi surface + participants panel */}
      <div className="flex flex-1 min-h-0">
        <div ref={containerRef} className="flex-1 min-w-0" />
        {showParticipants && (
          <Panel title={`Participants (${participants.length})`} onClose={() => setShowParticipants(false)}>
            {participants.length === 0 ? (
              <p className="px-1 py-4 text-center text-xs text-subtle">Waiting for others to join…</p>
            ) : (
              <ul className="space-y-1">
                {participants.map((p) => (
                  <li key={p.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                    <div
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold text-white"
                      style={{ background: avatarGradient(p.displayName) }}
                    >
                      {p.displayName.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <span className="truncate text-[13px] text-foreground">{p.displayName}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>

      {/* This app's own control bar — Jitsi's is switched off above */}
      <div className="flex flex-shrink-0 items-center justify-center gap-2 border-t border-border-soft bg-surface px-4 py-3">
        <IconButton
          icon={muted ? MicOff : Mic}
          label={muted ? "Unmute" : "Mute"}
          size="lg"
          destructive={muted}
          onClick={() => apiRef.current?.executeCommand("toggleAudio")}
        />
        <IconButton
          icon={videoOff ? VideoOff : Video}
          label={videoOff ? "Turn camera on" : "Turn camera off"}
          size="lg"
          destructive={videoOff}
          onClick={() => apiRef.current?.executeCommand("toggleVideo")}
        />
        <IconButton
          icon={MonitorUp}
          label={sharingScreen ? "Stop sharing screen" : "Share screen"}
          size="lg"
          active={sharingScreen}
          onClick={() => apiRef.current?.executeCommand("toggleShareScreen")}
        />
        <IconButton
          icon={UsersIcon}
          label={showParticipants ? "Hide participants" : "Show participants"}
          size="lg"
          active={showParticipants}
          onClick={() => setShowParticipants((v) => !v)}
        />
        <div className="mx-1 h-6 w-px bg-border-soft" />
        <IconButton icon={PhoneOff} label="Leave call" size="lg" destructive onClick={handleLeaveClick} />
      </div>
    </div>
  );
}

function MeetingCard({
  meeting,
  selected,
  onSelect,
  currentUserId,
}: {
  meeting: Meeting;
  selected: boolean;
  onSelect: () => void;
  currentUserId: string;
}) {
  const isHost = meeting.organizer.id === currentUserId;
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
        selected
          ? "bg-accent/8 border-accent/30"
          : "bg-surface border-border hover:border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-medium text-foreground leading-tight line-clamp-1">{meeting.title}</p>
        <StatusBadge status={meeting.status} />
      </div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <Users className="w-3 h-3" />
        <span>{meeting.participants.length}</span>
        <span>·</span>
        {meeting.scheduledAt ? (
          <span>{format(parseISO(meeting.scheduledAt), "MMM d, h:mm a")}</span>
        ) : (
          <span>{formatDistanceToNow(parseISO(meeting.createdAt), { addSuffix: true })}</span>
        )}
      </div>
      {isHost && <span className="text-xs text-accent/60 mt-0.5 inline-block">Host</span>}
    </button>
  );
}

// Overlapping gradient avatar stack used in the Nexus meeting row.
function AvatarStack({ participants }: { participants: Participant[] }) {
  const shown = participants.slice(0, 3);
  const more = participants.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((p) => {
        const initials = p.user.fullName.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
        return (
          <div
            key={p.id}
            className="w-[30px] h-[30px] -ml-2 first:ml-0 rounded-full border-2 border-border flex items-center justify-center text-[10.5px] font-bold text-white"
            style={{ background: avatarGradient(p.user.fullName) }}
            title={p.user.fullName}
          >
            {initials}
          </div>
        );
      })}
      {more > 0 && (
        <div className="w-[30px] h-[30px] -ml-2 rounded-full border-2 border-border bg-surface-sunken flex items-center justify-center text-[10px] font-bold text-muted">
          +{more}
        </div>
      )}
    </div>
  );
}

// Full-width Nexus meeting row: time · divider · title (+LIVE) · meta · avatars · action.
function MeetingRow({
  meeting,
  onSelect,
  onJoin,
  joining,
}: {
  meeting: Meeting;
  onSelect: () => void;
  onJoin: () => void;
  joining: boolean;
}) {
  const when = meeting.scheduledAt
    ? parseISO(meeting.scheduledAt)
    : parseISO(meeting.createdAt);
  const time = format(when, "h:mm");
  const ampm = format(when, "a");
  const isLive = meeting.status === "LIVE";
  const meta = `${meeting.participants.length} ${meeting.participants.length === 1 ? "attendee" : "attendees"} · Jitsi`;

  return (
    <div
      className="flex items-center gap-[18px] px-5 py-4 bg-surface border rounded-[13px] transition-colors"
      style={{ borderColor: isLive ? "color-mix(in srgb, var(--crit) 30%, transparent)" : "var(--border)" }}
    >
      <button onClick={onSelect} className="w-[58px] flex-none text-center">
        <div className="text-[18px] font-extrabold tracking-tight text-foreground font-mono leading-none">{time}</div>
        <div className="text-[11px] font-semibold text-subtle mt-0.5">{ampm}</div>
      </button>

      <div className="w-px h-10 bg-surface/[0.08]" />

      <button onClick={onSelect} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-[9px] mb-[5px]">
          <span className="text-[14.5px] font-bold text-foreground truncate">{meeting.title}</span>
          {isLive && (
            <span className="inline-flex items-center gap-[5px] text-[10.5px] font-bold text-crit px-2 py-0.5 rounded-[5px] bg-crit/[0.14]">
              <span className="w-[6px] h-[6px] rounded-full bg-crit animate-pulse" />
              LIVE
            </span>
          )}
        </div>
        <div className="text-[12.5px] text-muted">{meta}</div>
      </button>

      <AvatarStack participants={meeting.participants} />

      {isLive || meeting.status === "SCHEDULED" ? (
        <button
          onClick={onJoin}
          disabled={joining}
          className="h-9 px-[18px] rounded-lg text-[12.5px] font-bold flex items-center gap-[7px] transition-colors disabled:opacity-60"
          style={
            isLive
              ? { background: "linear-gradient(135deg,var(--accent),var(--accent-hover))", color: "#ffffff" }
              : { background: "var(--surface-sunken)", color: "var(--foreground)" }
          }
        >
          {joining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
          {isLive ? "Join" : "Details"}
        </button>
      ) : (
        <button
          onClick={onSelect}
          className="h-9 px-[18px] rounded-lg text-[12.5px] font-bold flex items-center gap-[7px] bg-surface-sunken text-foreground transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Details
        </button>
      )}
    </div>
  );
}

export function MeetView({
  currentUserId,
  currentUserName: _currentUserName,
}: {
  currentUserId: string;
  currentUserName: string;
}) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "scheduled" | "ended">("all");
  const [showNew, setShowNew] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [inMeeting, setInMeeting] = useState<InMeetingState | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadMeetings = useCallback(async () => {
    try {
      const res = await fetch("/api/meet");
      if (res.ok) setMeetings(await res.json() as Meeting[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadMeetings(); }, [loadMeetings]);

  const filtered = meetings.filter((m) => {
    if (filter === "active") return m.status === "LIVE";
    if (filter === "scheduled") return m.status === "SCHEDULED";
    if (filter === "ended") return m.status === "ENDED";
    return true;
  });

  const selected = meetings.find((m) => m.id === selectedId) ?? null;

  // Derived summary stats for the Nexus summary cards (display-only, no state change).
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upNext = meetings
    .filter((m) => m.status === "SCHEDULED" && m.scheduledAt && parseISO(m.scheduledAt) >= now)
    .sort((a, b) => parseISO(a.scheduledAt!).getTime() - parseISO(b.scheduledAt!).getTime())[0]
    ?? meetings.find((m) => m.status === "LIVE")
    ?? null;
  const todayCount = meetings.filter((m) => {
    const d = m.scheduledAt ? parseISO(m.scheduledAt) : parseISO(m.createdAt);
    return d >= startOfToday && d < endOfToday;
  }).length;
  const weekCount = meetings.filter((m) => {
    const d = m.scheduledAt ? parseISO(m.scheduledAt) : parseISO(m.createdAt);
    return d >= startOfToday && d < endOfWeek;
  }).length;

  const handleJoin = async (meetingId: string) => {
    setJoining(meetingId);
    try {
      const res = await fetch(`/api/meet/${meetingId}/join`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const joinInfo = await res.json() as JoinInfo;

      // Reload meeting to get updated status + participants
      const mRes = await fetch(`/api/meet/${meetingId}`);
      const meeting = await mRes.json() as Meeting;
      setMeetings((prev) => prev.map((m) => (m.id === meetingId ? meeting : m)));

      let seconds = 0;
      elapsedRef.current = setInterval(() => {
        seconds++;
        setInMeeting((prev) => prev ? { ...prev, elapsed: seconds } : null);
      }, 1000);

      setInMeeting({ meeting, joinInfo, elapsed: 0 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to join meeting");
    } finally {
      setJoining(null);
    }
  };

  const handleLeave = () => {
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
    setInMeeting(null);
    void loadMeetings();
  };

  const handleEndMeeting = async () => {
    if (!inMeeting) return;
    await fetch(`/api/meet/${inMeeting.meeting.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ENDED", endedAt: new Date().toISOString() }),
    });
    handleLeave();
    toast.success("Meeting ended");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this meeting?")) return;
    await fetch(`/api/meet/${id}`, { method: "DELETE" });
    setMeetings((prev) => prev.filter((m) => m.id !== id));
    if (selectedId === id) setSelectedId(null);
    toast.success("Meeting deleted");
  };

  const FILTERS = [
    { id: "all" as const, label: "All" },
    { id: "active" as const, label: "Live" },
    { id: "scheduled" as const, label: "Upcoming" },
    { id: "ended" as const, label: "Past" },
  ];

  return (
    <>
      {inMeeting && (
        <InMeetingRoom
          state={inMeeting}
          onLeave={handleLeave}
          onEnd={handleEndMeeting}
          currentUserId={currentUserId}
        />
      )}

      {showNew && (
        <NewMeetingModal
          onClose={() => setShowNew(false)}
          onCreated={(m) => {
            setMeetings((prev) => [m, ...prev]);
            setSelectedId(m.id);
            setShowNew(false);
            if (m.status === "LIVE") void handleJoin(m.id);
          }}
        />
      )}

      <div className="flex h-[calc(100vh-7.25rem)] lg:h-full bg-surface">
        {/* Sidebar — full width on mobile when no meeting selected */}
        <div className={`${selectedId ? "hidden lg:flex" : "flex"} w-full lg:w-72 flex-col border-r border-border bg-surface`}>
          <div className="px-4 py-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MonitorPlay className="w-4 h-4 text-accent" />
                <span className="text-sm font-semibold text-foreground">Sage Meet</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={loadMeetings}
                  className="p-1.5 text-muted hover:text-foreground rounded transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowNew(true)}
                  className="p-1.5 bg-accent text-accent-foreground rounded-lg hover:bg-accent-hover transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`flex-1 text-xs px-2 py-1 rounded-lg font-medium transition-colors ${
                    filter === f.id
                      ? "bg-accent/15 text-accent"
                      : "text-muted hover:text-foreground hover:bg-surface-sunken"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 bg-surface rounded-xl animate-pulse" />
              ))
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Video className="w-8 h-8 text-subtle mb-2" />
                <p className="text-sm text-muted">No meetings</p>
                <button
                  onClick={() => setShowNew(true)}
                  className="mt-3 text-xs text-accent hover:underline"
                >
                  Create one
                </button>
              </div>
            ) : (
              filtered.map((m) => (
                <MeetingCard
                  key={m.id}
                  meeting={m}
                  selected={selectedId === m.id}
                  onSelect={() => setSelectedId(m.id)}
                  currentUserId={currentUserId}
                />
              ))
            )}
          </div>
        </div>

        {/* Main panel — hidden on mobile when no meeting selected */}
        <div className={`${!selectedId ? "hidden lg:block" : "block"} flex-1 overflow-y-auto overflow-x-hidden`}>
          {!selected ? (
            <div className="px-7 pt-7 pb-7 max-w-4xl mx-auto">
              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-7">
                <div
                  className="px-5 py-[18px] rounded-[13px] border"
                  style={{
                    background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, transparent), color-mix(in srgb, var(--accent) 4%, transparent))",
                    borderColor: "color-mix(in srgb, var(--accent) 25%, transparent)",
                  }}
                >
                  <div className="text-xs font-semibold text-accent mb-2">Up next</div>
                  {upNext ? (
                    <>
                      <div className="text-base font-bold text-foreground mb-1 truncate">{upNext.title}</div>
                      <div className="text-[12.5px] text-muted font-mono">
                        {upNext.scheduledAt
                          ? `${formatDistanceToNow(parseISO(upNext.scheduledAt), { addSuffix: true })} · ${format(parseISO(upNext.scheduledAt), "h:mm a")}`
                          : format(parseISO(upNext.createdAt), "h:mm a")}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-base font-bold text-foreground mb-1">Nothing scheduled</div>
                      <div className="text-[12.5px] text-muted font-mono">all clear</div>
                    </>
                  )}
                </div>
                <div className="px-5 py-[18px] rounded-[13px] bg-surface border border-border">
                  <div className="text-xs font-semibold text-muted mb-2">Today</div>
                  <div className="text-[28px] font-extrabold tracking-tight text-foreground leading-none">{todayCount}</div>
                  <div className="text-[12.5px] text-subtle mt-1">meetings scheduled</div>
                </div>
                <div className="px-5 py-[18px] rounded-[13px] bg-surface border border-border">
                  <div className="text-xs font-semibold text-muted mb-2">This week</div>
                  <div className="text-[28px] font-extrabold tracking-tight text-foreground leading-none">
                    {weekCount}
                    <span className="text-[15px] font-semibold text-subtle"> {weekCount === 1 ? "mtg" : "mtgs"}</span>
                  </div>
                  <div className="text-[12.5px] text-subtle mt-1">in meetings</div>
                </div>
              </div>

              {/* Scheduled header */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[15px] font-bold text-foreground">Scheduled</span>
                <div className="flex-1" />
                <button
                  onClick={() => setShowNew(true)}
                  className="h-[34px] px-4 rounded-lg text-[12.5px] font-bold text-accent-foreground flex items-center gap-[7px]"
                  style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-hover))" }}
                >
                  <Plus className="w-4 h-4" /> New Meeting
                </button>
              </div>

              {/* Meeting rows */}
              <div className="flex flex-col gap-3">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-[78px] bg-surface border border-border rounded-[13px] animate-pulse" />
                  ))
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
                      <MonitorPlay className="w-8 h-8 text-accent" />
                    </div>
                    <h2 className="text-xl font-semibold text-foreground mb-1">No meetings yet</h2>
                    <p className="text-sm text-muted max-w-xs">
                      HD video meetings with AI-powered transcription and smart summaries.
                    </p>
                  </div>
                ) : (
                  filtered.map((m) => (
                    <MeetingRow
                      key={m.id}
                      meeting={m}
                      onSelect={() => setSelectedId(m.id)}
                      onJoin={() => void handleJoin(m.id)}
                      joining={joining === m.id}
                    />
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 lg:p-6 max-w-3xl mx-auto">
              {/* Mobile back button */}
              <button
                onClick={() => setSelectedId(null)}
                className="lg:hidden flex items-center gap-1.5 text-accent text-sm font-medium mb-4"
              >
                <ChevronLeft className="w-4 h-4" />
                All meetings
              </button>
              {/* Meeting header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-semibold text-foreground">{selected.title}</h1>
                    <StatusBadge status={selected.status} />
                  </div>
                  {selected.description && (
                    <p className="text-sm text-muted">{selected.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selected.organizer.id === currentUserId && selected.status !== "ENDED" && (
                    <button
                      onClick={() => handleDelete(selected.id)}
                      className="p-2 text-muted hover:text-crit rounded-lg hover:bg-crit/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-surface rounded-xl p-4 border border-border">
                  <p className="text-xs text-muted mb-1 font-medium">Host</p>
                  <div className="flex items-center gap-2">
                    <Avatar name={selected.organizer.fullName} url={selected.organizer.avatarUrl} size="sm" />
                    <span className="text-sm text-foreground">{selected.organizer.fullName}</span>
                  </div>
                </div>
                <div className="bg-surface rounded-xl p-4 border border-border">
                  <p className="text-xs text-muted mb-1 font-medium">
                    {selected.scheduledAt ? "Scheduled" : "Created"}
                  </p>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-accent" />
                    <span className="text-sm text-foreground">
                      {selected.scheduledAt
                        ? format(parseISO(selected.scheduledAt), "MMM d, yyyy h:mm a")
                        : formatDistanceToNow(parseISO(selected.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Join button */}
              {selected.status !== "ENDED" && selected.status !== "CANCELLED" && (
                <div className="mb-6">
                  <button
                    onClick={() => handleJoin(selected.id)}
                    disabled={joining === selected.id}
                    className="flex items-center gap-2.5 px-6 py-3 bg-accent text-accent-foreground font-semibold text-sm rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-60"
                  >
                    {joining === selected.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Video className="w-4 h-4" />
                    )}
                    {joining === selected.id ? "Joining…" : selected.status === "LIVE" ? "Join live meeting" : "Join meeting"}
                  </button>
                </div>
              )}

              {/* Join link */}
              <div className="mb-6 flex items-center gap-2 p-3 bg-surface rounded-xl border border-border">
                <ExternalLink className="w-4 h-4 text-muted flex-shrink-0" />
                <span className="text-xs text-muted truncate flex-1">{`${typeof window !== "undefined" ? window.location.origin : ""}/meet/${selected.roomName}`}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/meet/${selected.roomName}`).then(() => toast.success("Link copied"))}
                  className="text-xs text-accent hover:underline flex-shrink-0"
                >
                  Copy
                </button>
              </div>

              {/* Participants */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-accent" />
                  Participants ({selected.participants.length})
                </h3>
                <div className="space-y-2">
                  {selected.participants.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-3 bg-surface rounded-xl border border-border"
                    >
                      <Avatar name={p.user.fullName} url={p.user.avatarUrl} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground font-medium">{p.user.fullName}</p>
                        <p className="text-xs text-muted">
                          {p.role === "HOST" ? "Host" : "Participant"}
                          {p.joinedAt && ` · joined ${formatDistanceToNow(parseISO(p.joinedAt), { addSuffix: true })}`}
                        </p>
                      </div>
                      {p.role === "HOST" && (
                        <CheckCircle className="w-4 h-4 text-accent flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Summary */}
              {selected.aiSummary && (
                <div className="p-4 bg-accent/6 border border-accent/15 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-accent" />
                    <span className="text-sm font-medium text-accent">AI Summary</span>
                  </div>
                  <p className="text-sm text-muted leading-relaxed">{selected.aiSummary}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
