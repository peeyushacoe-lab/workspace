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
} from "lucide-react";
import { formatDistanceToNow, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { avatarGradient } from "@/lib/avatar";

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
    <div className={`${cls} rounded-full bg-[#00C2FF]/20 text-[#00C2FF] font-semibold flex items-center justify-center flex-shrink-0`}>
      {initials}
    </div>
  );
}

function StatusBadge({ status }: { status: MeetingStatus }) {
  const config = {
    LIVE:      { label: "Live",      cls: "bg-green-500/15 text-green-400 border border-green-500/30" },
    SCHEDULED: { label: "Scheduled", cls: "bg-blue-500/15 text-blue-400 border border-blue-500/30" },
    ENDED:     { label: "Ended",     cls: "bg-[#1B1F2A] text-[#7a8899] border border-[#262A35]" },
    CANCELLED: { label: "Cancelled", cls: "bg-rose-500/15 text-rose-400 border border-rose-500/30" },
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
      <div className="bg-[#12151D] border border-[#262A35] rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#262A35]">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-[#00C2FF]" />
            <h2 className="text-base font-semibold text-[#E6E9F0]">New Meeting</h2>
          </div>
          <button onClick={onClose} className="text-[#7a8899] hover:text-[#E6E9F0] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#7a8899] mb-1.5">Meeting title</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Weekly sync, design review…"
              className="w-full bg-[#1B1F2A] border border-[#262A35] rounded-lg px-3 py-2 text-sm text-[#E6E9F0] placeholder:text-[#4a5568] outline-none focus:border-[#00C2FF]/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#7a8899] mb-1.5">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Agenda, notes…"
              className="w-full bg-[#1B1F2A] border border-[#262A35] rounded-lg px-3 py-2 text-sm text-[#E6E9F0] placeholder:text-[#4a5568] outline-none focus:border-[#00C2FF]/40 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setIsInstant(true)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                isInstant
                  ? "bg-[#00C2FF]/15 border-[#00C2FF]/40 text-[#00C2FF]"
                  : "bg-[#1B1F2A] border-[#262A35] text-[#8A92A6] hover:border-[#00C2FF]/20"
              }`}
            >
              <Video className="w-4 h-4" /> Start now
            </button>
            <button
              onClick={() => setIsInstant(false)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                !isInstant
                  ? "bg-[#00C2FF]/15 border-[#00C2FF]/40 text-[#00C2FF]"
                  : "bg-[#1B1F2A] border-[#262A35] text-[#8A92A6] hover:border-[#00C2FF]/20"
              }`}
            >
              <Calendar className="w-4 h-4" /> Schedule
            </button>
          </div>

          {!isInstant && (
            <div>
              <label className="block text-xs font-medium text-[#7a8899] mb-1.5">Date & Time</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full bg-[#1B1F2A] border border-[#262A35] rounded-lg px-3 py-2 text-sm text-[#E6E9F0] outline-none focus:border-[#00C2FF]/40"
              />
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-[#1B1F2A] text-[#8A92A6] text-sm font-medium hover:bg-[#2e3347] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-[#00C2FF] text-[#06121A] text-sm font-semibold hover:bg-[#0098E6] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
            {isInstant ? "Start meeting" : "Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

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

  // Build Jitsi embed URL. All branding/timer config is passed via hash params.
  // For full white-label (no watermark, no timer), set NEXT_PUBLIC_JITSI_DOMAIN to
  // your self-hosted Jitsi instance. The public meet.jit.si server overrides some
  // interface configs server-side, so self-hosting is the only complete solution.
  const jitsiSrc = [
    joinInfo.jitsiUrl,
    "#",
    [
      `userInfo.displayName=${encodeURIComponent(joinInfo.userName)}`,
      "config.prejoinPageEnabled=false",
      "config.startWithAudioMuted=false",
      "config.startWithVideoMuted=false",
      "config.hideConferenceTimer=true",
      "config.disableDeepLinking=true",
      "config.enableWelcomePage=false",
      "config.disableThirdPartyRequests=true",
      "config.defaultBackground=%230f1321",
      "interfaceConfig.SHOW_JITSI_WATERMARK=false",
      "interfaceConfig.SHOW_WATERMARK_FOR_GUESTS=false",
      "interfaceConfig.SHOW_BRAND_WATERMARK=false",
      "interfaceConfig.SHOW_POWERED_BY=false",
      "interfaceConfig.DISPLAY_WELCOME_FOOTER=false",
      `interfaceConfig.APP_NAME=${encodeURIComponent("CyberSage Meet")}`,
      `interfaceConfig.PROVIDER_NAME=${encodeURIComponent("CyberSage")}`,
      `interfaceConfig.TOOLBAR_BUTTONS=${encodeURIComponent(JSON.stringify([
        "microphone","camera","closedcaptions","desktop","fullscreen",
        "fodeviceselection","hangup","chat","settings","raisehand",
        "videoquality","filmstrip","tileview","help","mute-everyone","security",
      ]))}`,
    ].join("&"),
  ].join("");

  return (
    <div className="fixed inset-0 z-50 bg-[#12151D] flex flex-col">
      {/* Slim header */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-[#12151D] border-b border-[#262A35] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-sm font-semibold text-[#E6E9F0]">{meeting.title}</span>
          <span className="text-xs text-[#7a8899] tabular-nums">{formatElapsed(elapsed)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B1F2A] text-xs text-[#8A92A6] hover:bg-[#2e3347] transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy invite link"}
          </button>
          <button
            onClick={onLeave}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-500 transition-colors"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            Leave
          </button>
          {isHost && (
            <button
              onClick={onEnd}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/20 border border-rose-500/30 text-rose-400 text-xs font-medium hover:bg-rose-600/30 transition-colors"
            >
              End for all
            </button>
          )}
        </div>
      </div>

      {/* Jitsi Meet iframe — full remaining height */}
      <iframe
        src={jitsiSrc}
        allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
        className="flex-1 border-0 w-full"
        title={meeting.title}
      />
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
          ? "bg-[#00C2FF]/8 border-[#00C2FF]/30"
          : "bg-[#12151D] border-[#262A35] hover:border-[#262A35]"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-medium text-[#E6E9F0] leading-tight line-clamp-1">{meeting.title}</p>
        <StatusBadge status={meeting.status} />
      </div>
      <div className="flex items-center gap-2 text-xs text-[#7a8899]">
        <Users className="w-3 h-3" />
        <span>{meeting.participants.length}</span>
        <span>·</span>
        {meeting.scheduledAt ? (
          <span>{format(parseISO(meeting.scheduledAt), "MMM d, h:mm a")}</span>
        ) : (
          <span>{formatDistanceToNow(parseISO(meeting.createdAt), { addSuffix: true })}</span>
        )}
      </div>
      {isHost && <span className="text-xs text-[#00C2FF]/60 mt-0.5 inline-block">Host</span>}
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
            className="w-[30px] h-[30px] -ml-2 first:ml-0 rounded-full border-2 border-[#12151D] flex items-center justify-center text-[10.5px] font-bold text-white"
            style={{ background: avatarGradient(p.user.fullName) }}
            title={p.user.fullName}
          >
            {initials}
          </div>
        );
      })}
      {more > 0 && (
        <div className="w-[30px] h-[30px] -ml-2 rounded-full border-2 border-[#12151D] bg-[#1B1F2A] flex items-center justify-center text-[10px] font-bold text-[#8A92A6]">
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
      className="flex items-center gap-[18px] px-5 py-4 bg-[#12151D] border rounded-[13px] transition-colors"
      style={{ borderColor: isLive ? "rgba(255,92,122,0.3)" : "#262A35" }}
    >
      <button onClick={onSelect} className="w-[58px] flex-none text-center">
        <div className="text-[18px] font-extrabold tracking-tight text-[#E6E9F0] font-mono leading-none">{time}</div>
        <div className="text-[11px] font-semibold text-[#5A6275] mt-0.5">{ampm}</div>
      </button>

      <div className="w-px h-10 bg-white/[0.08]" />

      <button onClick={onSelect} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-[9px] mb-[5px]">
          <span className="text-[14.5px] font-bold text-[#E6E9F0] truncate">{meeting.title}</span>
          {isLive && (
            <span className="inline-flex items-center gap-[5px] text-[10.5px] font-bold text-[#FF5C7A] px-2 py-0.5 rounded-[5px] bg-[#FF5C7A]/[0.14]">
              <span className="w-[6px] h-[6px] rounded-full bg-[#FF5C7A] animate-pulse" />
              LIVE
            </span>
          )}
        </div>
        <div className="text-[12.5px] text-[#6B7385]">{meta}</div>
      </button>

      <AvatarStack participants={meeting.participants} />

      {isLive || meeting.status === "SCHEDULED" ? (
        <button
          onClick={onJoin}
          disabled={joining}
          className="h-9 px-[18px] rounded-lg text-[12.5px] font-bold flex items-center gap-[7px] transition-colors disabled:opacity-60"
          style={
            isLive
              ? { background: "linear-gradient(135deg,#00C2FF,#0098E6)", color: "#06121A" }
              : { background: "#1B1F2A", color: "#E6E9F0" }
          }
        >
          {joining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
          {isLive ? "Join" : "Details"}
        </button>
      ) : (
        <button
          onClick={onSelect}
          className="h-9 px-[18px] rounded-lg text-[12.5px] font-bold flex items-center gap-[7px] bg-[#1B1F2A] text-[#E6E9F0] transition-colors"
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

      <div className="flex h-[calc(100vh-56px)] bg-[#12151D]">
        {/* Sidebar */}
        <div className="w-72 flex flex-col border-r border-[#262A35] bg-[#12151D]">
          <div className="px-4 py-4 border-b border-[#262A35]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MonitorPlay className="w-4 h-4 text-[#00C2FF]" />
                <span className="text-sm font-semibold text-[#E6E9F0]">Sage Meet</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={loadMeetings}
                  className="p-1.5 text-[#7a8899] hover:text-[#E6E9F0] rounded transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowNew(true)}
                  className="p-1.5 bg-[#00C2FF] text-[#06121A] rounded-lg hover:bg-[#0098E6] transition-colors"
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
                      ? "bg-[#00C2FF]/15 text-[#00C2FF]"
                      : "text-[#7a8899] hover:text-[#E6E9F0] hover:bg-[#1B1F2A]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 bg-[#12151D] rounded-xl animate-pulse" />
              ))
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Video className="w-8 h-8 text-[#4a5568] mb-2" />
                <p className="text-sm text-[#7a8899]">No meetings</p>
                <button
                  onClick={() => setShowNew(true)}
                  className="mt-3 text-xs text-[#00C2FF] hover:underline"
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

        {/* Main panel */}
        <div className="flex-1 overflow-y-auto">
          {!selected ? (
            <div className="px-7 pt-7 pb-7 max-w-4xl mx-auto">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3.5 mb-7">
                <div
                  className="px-5 py-[18px] rounded-[13px] border"
                  style={{
                    background: "linear-gradient(135deg, rgba(0,194,255,0.14), rgba(0,194,255,0.04))",
                    borderColor: "rgba(0,194,255,0.25)",
                  }}
                >
                  <div className="text-xs font-semibold text-[#7FD8F5] mb-2">Up next</div>
                  {upNext ? (
                    <>
                      <div className="text-base font-bold text-[#E6E9F0] mb-1 truncate">{upNext.title}</div>
                      <div className="text-[12.5px] text-[#9AA2B4] font-mono">
                        {upNext.scheduledAt
                          ? `${formatDistanceToNow(parseISO(upNext.scheduledAt), { addSuffix: true })} · ${format(parseISO(upNext.scheduledAt), "h:mm a")}`
                          : format(parseISO(upNext.createdAt), "h:mm a")}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-base font-bold text-[#E6E9F0] mb-1">Nothing scheduled</div>
                      <div className="text-[12.5px] text-[#9AA2B4] font-mono">all clear</div>
                    </>
                  )}
                </div>
                <div className="px-5 py-[18px] rounded-[13px] bg-[#12151D] border border-[#262A35]">
                  <div className="text-xs font-semibold text-[#8A92A6] mb-2">Today</div>
                  <div className="text-[28px] font-extrabold tracking-tight text-[#E6E9F0] leading-none">{todayCount}</div>
                  <div className="text-[12.5px] text-[#5A6275] mt-1">meetings scheduled</div>
                </div>
                <div className="px-5 py-[18px] rounded-[13px] bg-[#12151D] border border-[#262A35]">
                  <div className="text-xs font-semibold text-[#8A92A6] mb-2">This week</div>
                  <div className="text-[28px] font-extrabold tracking-tight text-[#E6E9F0] leading-none">
                    {weekCount}
                    <span className="text-[15px] font-semibold text-[#5A6275]"> {weekCount === 1 ? "mtg" : "mtgs"}</span>
                  </div>
                  <div className="text-[12.5px] text-[#5A6275] mt-1">in meetings</div>
                </div>
              </div>

              {/* Scheduled header */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[15px] font-bold text-[#E6E9F0]">Scheduled</span>
                <div className="flex-1" />
                <button
                  onClick={() => setShowNew(true)}
                  className="h-[34px] px-4 rounded-lg text-[12.5px] font-bold text-[#06121A] flex items-center gap-[7px]"
                  style={{ background: "linear-gradient(135deg, #00C2FF, #0098E6)" }}
                >
                  <Plus className="w-[15px] h-[15px]" strokeWidth={2.6} /> New Meeting
                </button>
              </div>

              {/* Meeting rows */}
              <div className="flex flex-col gap-3">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-[78px] bg-[#12151D] border border-[#262A35] rounded-[13px] animate-pulse" />
                  ))
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-[#00C2FF]/10 border border-[#00C2FF]/20 flex items-center justify-center mb-4">
                      <MonitorPlay className="w-8 h-8 text-[#00C2FF]" />
                    </div>
                    <h2 className="text-xl font-semibold text-[#E6E9F0] mb-1">No meetings yet</h2>
                    <p className="text-sm text-[#7a8899] max-w-xs">
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
            <div className="p-6 max-w-3xl mx-auto">
              {/* Meeting header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-semibold text-[#E6E9F0]">{selected.title}</h1>
                    <StatusBadge status={selected.status} />
                  </div>
                  {selected.description && (
                    <p className="text-sm text-[#7a8899]">{selected.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selected.organizer.id === currentUserId && selected.status !== "ENDED" && (
                    <button
                      onClick={() => handleDelete(selected.id)}
                      className="p-2 text-[#7a8899] hover:text-rose-400 rounded-lg hover:bg-rose-400/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-[#12151D] rounded-xl p-4 border border-[#262A35]">
                  <p className="text-xs text-[#7a8899] mb-1 font-medium">Host</p>
                  <div className="flex items-center gap-2">
                    <Avatar name={selected.organizer.fullName} url={selected.organizer.avatarUrl} size="sm" />
                    <span className="text-sm text-[#E6E9F0]">{selected.organizer.fullName}</span>
                  </div>
                </div>
                <div className="bg-[#12151D] rounded-xl p-4 border border-[#262A35]">
                  <p className="text-xs text-[#7a8899] mb-1 font-medium">
                    {selected.scheduledAt ? "Scheduled" : "Created"}
                  </p>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#00C2FF]" />
                    <span className="text-sm text-[#E6E9F0]">
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
                    className="flex items-center gap-2.5 px-6 py-3 bg-[#00C2FF] text-[#06121A] font-semibold text-sm rounded-xl hover:bg-[#0098E6] transition-colors disabled:opacity-60"
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
              <div className="mb-6 flex items-center gap-2 p-3 bg-[#12151D] rounded-xl border border-[#262A35]">
                <ExternalLink className="w-4 h-4 text-[#7a8899] flex-shrink-0" />
                <span className="text-xs text-[#7a8899] truncate flex-1">{`${typeof window !== "undefined" ? window.location.origin : ""}/meet/${selected.roomName}`}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/meet/${selected.roomName}`).then(() => toast.success("Link copied"))}
                  className="text-xs text-[#00C2FF] hover:underline flex-shrink-0"
                >
                  Copy
                </button>
              </div>

              {/* Participants */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-[#E6E9F0] mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#00C2FF]" />
                  Participants ({selected.participants.length})
                </h3>
                <div className="space-y-2">
                  {selected.participants.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-3 bg-[#12151D] rounded-xl border border-[#262A35]"
                    >
                      <Avatar name={p.user.fullName} url={p.user.avatarUrl} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#E6E9F0] font-medium">{p.user.fullName}</p>
                        <p className="text-xs text-[#7a8899]">
                          {p.role === "HOST" ? "Host" : "Participant"}
                          {p.joinedAt && ` · joined ${formatDistanceToNow(parseISO(p.joinedAt), { addSuffix: true })}`}
                        </p>
                      </div>
                      {p.role === "HOST" && (
                        <CheckCircle className="w-4 h-4 text-[#00C2FF] flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Summary */}
              {selected.aiSummary && (
                <div className="p-4 bg-[#00C2FF]/6 border border-[#00C2FF]/15 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-[#00C2FF]" />
                    <span className="text-sm font-medium text-[#00C2FF]">AI Summary</span>
                  </div>
                  <p className="text-sm text-[#8A92A6] leading-relaxed">{selected.aiSummary}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
