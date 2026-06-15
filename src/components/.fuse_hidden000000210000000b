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
    <div className={`${cls} rounded-full bg-[#1a56db]/20 text-[#1a56db] font-semibold flex items-center justify-center flex-shrink-0`}>
      {initials}
    </div>
  );
}

function StatusBadge({ status }: { status: MeetingStatus }) {
  const config = {
    LIVE:      { label: "Live",      cls: "bg-green-500/15 text-green-400 border border-green-500/30" },
    SCHEDULED: { label: "Scheduled", cls: "bg-blue-500/15 text-blue-400 border border-blue-500/30" },
    ENDED:     { label: "Ended",     cls: "bg-[#f1f3f4] text-[#7a8899] border border-[#e8eaed]" },
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
      <div className="bg-white border border-[#e8eaed] rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8eaed]">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-[#1a56db]" />
            <h2 className="text-base font-semibold text-[#202124]">New Meeting</h2>
          </div>
          <button onClick={onClose} className="text-[#7a8899] hover:text-[#202124] transition-colors">
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
              className="w-full bg-[#f1f3f4] border border-[#e8eaed] rounded-lg px-3 py-2 text-sm text-[#202124] placeholder:text-[#4a5568] outline-none focus:border-[#1a56db]/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#7a8899] mb-1.5">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Agenda, notes…"
              className="w-full bg-[#f1f3f4] border border-[#e8eaed] rounded-lg px-3 py-2 text-sm text-[#202124] placeholder:text-[#4a5568] outline-none focus:border-[#1a56db]/40 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setIsInstant(true)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                isInstant
                  ? "bg-[#1a56db]/15 border-[#1a56db]/40 text-[#1a56db]"
                  : "bg-[#f1f3f4] border-[#e8eaed] text-[#5f6368] hover:border-[#1a56db]/20"
              }`}
            >
              <Video className="w-4 h-4" /> Start now
            </button>
            <button
              onClick={() => setIsInstant(false)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                !isInstant
                  ? "bg-[#1a56db]/15 border-[#1a56db]/40 text-[#1a56db]"
                  : "bg-[#f1f3f4] border-[#e8eaed] text-[#5f6368] hover:border-[#1a56db]/20"
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
                className="w-full bg-[#f1f3f4] border border-[#e8eaed] rounded-lg px-3 py-2 text-sm text-[#202124] outline-none focus:border-[#1a56db]/40"
              />
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-[#f1f3f4] text-[#5f6368] text-sm font-medium hover:bg-[#2e3347] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-[#1a56db] text-white text-sm font-semibold hover:bg-[#1447c0] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
    <div className="fixed inset-0 z-50 bg-[#f8fafd] flex flex-col">
      {/* Slim header */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-white border-b border-[#e8eaed] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-sm font-semibold text-[#202124]">{meeting.title}</span>
          <span className="text-xs text-[#7a8899] tabular-nums">{formatElapsed(elapsed)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f1f3f4] text-xs text-[#5f6368] hover:bg-[#2e3347] transition-colors"
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
          ? "bg-[#1a56db]/8 border-[#1a56db]/30"
          : "bg-white border-[#e8eaed] hover:border-[#e8eaed]"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-medium text-[#202124] leading-tight line-clamp-1">{meeting.title}</p>
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
      {isHost && <span className="text-xs text-[#1a56db]/60 mt-0.5 inline-block">Host</span>}
    </button>
  );
}

export function MeetView({
  currentUserId,
  currentUserName,
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

      <div className="flex h-[calc(100vh-56px)] bg-white">
        {/* Sidebar */}
        <div className="w-72 flex flex-col border-r border-[#e8eaed] bg-white">
          <div className="px-4 py-4 border-b border-[#e8eaed]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MonitorPlay className="w-4 h-4 text-[#1a56db]" />
                <span className="text-sm font-semibold text-[#202124]">Sage Meet</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={loadMeetings}
                  className="p-1.5 text-[#7a8899] hover:text-[#202124] rounded transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowNew(true)}
                  className="p-1.5 bg-[#1a56db] text-white rounded-lg hover:bg-[#1447c0] transition-colors"
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
                      ? "bg-[#1a56db]/15 text-[#1a56db]"
                      : "text-[#7a8899] hover:text-[#202124] hover:bg-[#f1f3f4]"
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
                <div key={i} className="h-20 bg-white rounded-xl animate-pulse" />
              ))
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Video className="w-8 h-8 text-[#4a5568] mb-2" />
                <p className="text-sm text-[#7a8899]">No meetings</p>
                <button
                  onClick={() => setShowNew(true)}
                  className="mt-3 text-xs text-[#1a56db] hover:underline"
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
            <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-[#1a56db]/10 border border-[#1a56db]/20 flex items-center justify-center">
                <MonitorPlay className="w-8 h-8 text-[#1a56db]" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[#202124] mb-1">Sage Meet</h2>
                <p className="text-sm text-[#7a8899] max-w-xs">
                  HD video meetings with AI-powered transcription and smart summaries.
                </p>
              </div>
              <button
                onClick={() => setShowNew(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#1a56db] text-white font-semibold text-sm rounded-xl hover:bg-[#1447c0] transition-colors"
              >
                <Plus className="w-4 h-4" /> New meeting
              </button>
            </div>
          ) : (
            <div className="p-6 max-w-3xl mx-auto">
              {/* Meeting header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-semibold text-[#202124]">{selected.title}</h1>
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
                <div className="bg-white rounded-xl p-4 border border-[#e8eaed]">
                  <p className="text-xs text-[#7a8899] mb-1 font-medium">Host</p>
                  <div className="flex items-center gap-2">
                    <Avatar name={selected.organizer.fullName} url={selected.organizer.avatarUrl} size="sm" />
                    <span className="text-sm text-[#202124]">{selected.organizer.fullName}</span>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-4 border border-[#e8eaed]">
                  <p className="text-xs text-[#7a8899] mb-1 font-medium">
                    {selected.scheduledAt ? "Scheduled" : "Created"}
                  </p>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#1a56db]" />
                    <span className="text-sm text-[#202124]">
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
                    className="flex items-center gap-2.5 px-6 py-3 bg-[#1a56db] text-white font-semibold text-sm rounded-xl hover:bg-[#1447c0] transition-colors disabled:opacity-60"
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
              <div className="mb-6 flex items-center gap-2 p-3 bg-white rounded-xl border border-[#e8eaed]">
                <ExternalLink className="w-4 h-4 text-[#7a8899] flex-shrink-0" />
                <span className="text-xs text-[#7a8899] truncate flex-1">{`${typeof window !== "undefined" ? window.location.origin : ""}/meet/${selected.roomName}`}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/meet/${selected.roomName}`).then(() => toast.success("Link copied"))}
                  className="text-xs text-[#1a56db] hover:underline flex-shrink-0"
                >
                  Copy
                </button>
              </div>

              {/* Participants */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-[#202124] mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#1a56db]" />
                  Participants ({selected.participants.length})
                </h3>
                <div className="space-y-2">
                  {selected.participants.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-3 bg-white rounded-xl border border-[#e8eaed]"
                    >
                      <Avatar name={p.user.fullName} url={p.user.avatarUrl} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#202124] font-medium">{p.user.fullName}</p>
                        <p className="text-xs text-[#7a8899]">
                          {p.role === "HOST" ? "Host" : "Participant"}
                          {p.joinedAt && ` · joined ${formatDistanceToNow(parseISO(p.joinedAt), { addSuffix: true })}`}
                        </p>
                      </div>
                      {p.role === "HOST" && (
                        <CheckCircle className="w-4 h-4 text-[#1a56db] flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Summary */}
              {selected.aiSummary && (
                <div className="p-4 bg-[#1a56db]/6 border border-[#1a56db]/15 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-[#1a56db]" />
                    <span className="text-sm font-medium text-[#1a56db]">AI Summary</span>
                  </div>
                  <p className="text-sm text-[#5f6368] leading-relaxed">{selected.aiSummary}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
