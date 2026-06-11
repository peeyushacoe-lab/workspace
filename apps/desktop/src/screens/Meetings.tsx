import { useState, useEffect, useRef, useCallback, forwardRef } from "react";
import {
  getMeetings, createMeeting, joinMeeting, sendMeetSignal,
  getWorkspaceMembers,
  type Meeting, type WorkspaceMember,
} from "@/api/client";
import { useAuth } from "@/store/auth";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function Meetings() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [active, setActive] = useState<Meeting | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = await getMeetings();
      setMeetings(m);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function meetingTime(m: Meeting): string {
    if (m.status === "LIVE") return "Live now";
    if (m.scheduledAt) {
      const d = new Date(m.scheduledAt);
      return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    }
    return new Date(m.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  if (active) {
    return <CallRoom meeting={active} currentUserId={user?.id ?? ""} currentUserName={user?.fullName ?? "You"} onLeave={() => setActive(null)} />;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-shrink-0 flex items-center justify-between h-[52px] px-5 border-b border-brand-border no-select">
        <h2 className="text-sm font-semibold text-text-primary">Meetings</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-bg-deep transition-fast"
          style={{ background: "linear-gradient(135deg, #00d2ff 0%, #0098c7 100%)" }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          New meeting
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-16 rounded-lg" />)}
          </div>
        )}

        {!loading && meetings.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 h-full text-text-muted">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-25">
              <path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.845v6.31a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
            </svg>
            <p className="text-sm">No meetings yet</p>
            <button onClick={() => setShowCreate(true)} className="text-xs text-brand hover:underline">Start an instant meeting</button>
          </div>
        )}

        <div className="space-y-2 max-w-3xl">
          {meetings.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-brand-border bg-bg-card hover:border-brand/30 transition-fast">
              <div className="h-10 w-10 flex-shrink-0 rounded-lg bg-brand-dim border border-brand-border flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00d2ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.845v6.31a1 1 0 0 1-1.447.894L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-text-primary truncate">{m.title}</p>
                  {m.status === "LIVE" && (
                    <span className="text-[10px] font-bold text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                      LIVE
                    </span>
                  )}
                  {m.status === "ENDED" && (
                    <span className="text-[10px] text-text-muted bg-bg-hover px-1.5 py-0.5 rounded">ENDED</span>
                  )}
                </div>
                <p className="text-[11px] text-text-muted">
                  {meetingTime(m)} · {m.participants.length} participant{m.participants.length === 1 ? "" : "s"} · Organized by {m.organizer.fullName}
                </p>
              </div>
              {m.status !== "ENDED" && (
                <button
                  onClick={() => { joinMeeting(m.id).catch(() => {}); setActive(m); }}
                  className="rounded-md px-4 py-1.5 text-xs font-semibold text-bg-deep transition-fast"
                  style={{ background: "linear-gradient(135deg, #00d2ff 0%, #0098c7 100%)" }}
                >
                  Join
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {showCreate && (
        <CreateMeetingModal
          onClose={() => setShowCreate(false)}
          onCreated={(m, joinNow) => {
            setShowCreate(false);
            load();
            if (joinNow) setActive(m);
          }}
        />
      )}
    </div>
  );
}

function CreateMeetingModal({ onClose, onCreated }: { onClose: () => void; onCreated: (m: Meeting, joinNow: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"instant" | "scheduled">("instant");

  useEffect(() => { getWorkspaceMembers().then(setMembers).catch(() => {}); }, []);

  async function handleCreate(joinNow: boolean) {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const m = await createMeeting({
        title: title.trim(),
        scheduledAt: mode === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        isInstant: mode === "instant",
        participantIds: Array.from(selected),
      });
      onCreated(m, joinNow);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  const filtered = members.filter(m => m.fullName.toLowerCase().includes(memberSearch.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 no-select">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[460px] max-h-[85vh] rounded-xl border border-brand-border bg-bg-card shadow-2xl flex flex-col overflow-hidden">
        <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-brand-border px-4">
          <h3 className="text-sm font-semibold text-text-primary">New meeting</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex border-b border-brand-border">
          <button onClick={() => setMode("instant")} className={`flex-1 py-2 text-xs font-medium transition-fast ${mode === "instant" ? "text-brand border-b-2 border-brand bg-brand-dim/30" : "text-text-muted hover:text-text-secondary"}`}>Instant</button>
          <button onClick={() => setMode("scheduled")} className={`flex-1 py-2 text-xs font-medium transition-fast ${mode === "scheduled" ? "text-brand border-b-2 border-brand bg-brand-dim/30" : "text-text-muted hover:text-text-secondary"}`}>Scheduled</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-text-muted mb-1">Title</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Weekly sync" className="w-full rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/40" />
          </div>
          {mode === "scheduled" && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-text-muted mb-1">When</label>
              <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="w-full rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/40" />
            </div>
          )}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-text-muted mb-1">Invite ({selected.size} selected)</label>
            <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search workspace" className="w-full rounded-md border border-brand-border bg-bg-deep px-3 py-2 text-sm text-text-primary outline-none focus:border-brand/40 mb-2" />
            <div className="max-h-[180px] overflow-y-auto rounded-md border border-brand-border bg-bg-deep">
              {filtered.slice(0, 50).map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelected(prev => { const n = new Set(prev); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-hover transition-fast ${selected.has(m.id) ? "bg-brand-dim/40" : ""}`}
                >
                  <div className="h-5 w-5 flex-shrink-0 rounded-full bg-brand-dim border border-brand-border flex items-center justify-center text-[10px] font-bold text-brand">{m.fullName[0]?.toUpperCase()}</div>
                  <span className="flex-1 text-[12px] text-text-primary truncate">{m.fullName}</span>
                  {selected.has(m.id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00d2ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 flex items-center justify-end gap-2 border-t border-brand-border px-4 py-3">
          <button onClick={onClose} disabled={saving} className="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-hover">Cancel</button>
          {mode === "instant" ? (
            <button onClick={() => handleCreate(true)} disabled={saving || !title.trim()} className="rounded-md px-4 py-1.5 text-xs font-semibold text-bg-deep disabled:opacity-50" style={{ background: "linear-gradient(135deg, #00d2ff 0%, #0098c7 100%)" }}>
              {saving ? "Starting…" : "Start meeting"}
            </button>
          ) : (
            <button onClick={() => handleCreate(false)} disabled={saving || !title.trim() || !scheduledAt} className="rounded-md px-4 py-1.5 text-xs font-semibold text-bg-deep disabled:opacity-50" style={{ background: "linear-gradient(135deg, #00d2ff 0%, #0098c7 100%)" }}>
              {saving ? "Scheduling…" : "Schedule"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Call room ────────────────────────────────────────────────────────────────

type PeerInfo = { peerId: string; name: string; stream?: MediaStream; pc?: RTCPeerConnection };

function CallRoom({
  meeting, currentUserId, currentUserName, onLeave,
}: {
  meeting: Meeting;
  currentUserId: string;
  currentUserName: string;
  onLeave: () => void;
}) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [screenShare, setScreenShare] = useState(false);
  const [peers, setPeers] = useState<Map<string, PeerInfo>>(new Map());
  const [error, setError] = useState("");

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const peersRef = useRef<Map<string, PeerInfo>>(new Map());
  const screenStreamRef = useRef<MediaStream | null>(null);

  const roomId = meeting.roomName;

  // Get local stream
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to access camera/mic");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function syncPeers() {
    setPeers(new Map(peersRef.current));
  }

  function createPeerConnection(remotePeerId: string, remoteName: string, polite: boolean): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks
    if (localStream) {
      for (const track of localStream.getTracks()) {
        pc.addTrack(track, localStream);
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendMeetSignal({
          roomId,
          type: "ice-candidate",
          payload: e.candidate.toJSON(),
          targetPeerId: remotePeerId,
        }).catch(() => {});
      }
    };

    pc.ontrack = (e) => {
      const peer = peersRef.current.get(remotePeerId);
      if (peer) {
        peer.stream = e.streams[0];
        peersRef.current.set(remotePeerId, peer);
        syncPeers();
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        peersRef.current.delete(remotePeerId);
        syncPeers();
      }
    };

    peersRef.current.set(remotePeerId, { peerId: remotePeerId, name: remoteName, pc });
    syncPeers();
    return pc;
  }

  // Signaling
  useEffect(() => {
    if (!localStream) return;

    // Announce arrival
    sendMeetSignal({ roomId, type: "peer-joined", payload: { name: currentUserName } }).catch(() => {});

    const unsubscribe = window.nexus.meet.subscribe(roomId, async (raw) => {
      const msg = raw as { type: string; senderId?: string; senderName?: string; payload?: unknown; targetPeerId?: string };
      if (!msg.type || msg.senderId === currentUserId) return;

      const remoteId = msg.senderId ?? "";
      const remoteName = msg.senderName ?? "Peer";

      if (msg.type === "peer-joined") {
        // New peer — we (the older one) create the offer
        const pc = peersRef.current.get(remoteId)?.pc ?? createPeerConnection(remoteId, remoteName, false);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendMeetSignal({ roomId, type: "offer", payload: offer, targetPeerId: remoteId });
      } else if (msg.type === "offer") {
        const pc = peersRef.current.get(remoteId)?.pc ?? createPeerConnection(remoteId, remoteName, true);
        await pc.setRemoteDescription(new RTCSessionDescription(msg.payload as RTCSessionDescriptionInit));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendMeetSignal({ roomId, type: "answer", payload: answer, targetPeerId: remoteId });
      } else if (msg.type === "answer") {
        const pc = peersRef.current.get(remoteId)?.pc;
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg.payload as RTCSessionDescriptionInit));
      } else if (msg.type === "ice-candidate") {
        const pc = peersRef.current.get(remoteId)?.pc;
        if (pc) await pc.addIceCandidate(new RTCIceCandidate(msg.payload as RTCIceCandidateInit)).catch(() => {});
      } else if (msg.type === "peer-left") {
        const peer = peersRef.current.get(remoteId);
        peer?.pc?.close();
        peersRef.current.delete(remoteId);
        syncPeers();
      }
    });

    return () => {
      sendMeetSignal({ roomId, type: "peer-left", payload: {} }).catch(() => {});
      unsubscribe();
    };
  }, [localStream, roomId, currentUserId, currentUserName]);

  function toggleAudio() {
    if (!localStream) return;
    const next = !audioOn;
    localStream.getAudioTracks().forEach(t => t.enabled = next);
    setAudioOn(next);
  }

  function toggleVideo() {
    if (!localStream) return;
    const next = !videoOn;
    localStream.getVideoTracks().forEach(t => t.enabled = next);
    setVideoOn(next);
  }

  async function toggleScreenShare() {
    if (screenShare) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      setScreenShare(false);
      // Restore camera
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          for (const peer of peersRef.current.values()) {
            const sender = peer.pc?.getSenders().find(s => s.track?.kind === "video");
            sender?.replaceTrack(videoTrack);
          }
          if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
        }
      }
    } else {
      try {
        const ds = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = ds;
        const screenTrack = ds.getVideoTracks()[0];
        for (const peer of peersRef.current.values()) {
          const sender = peer.pc?.getSenders().find(s => s.track?.kind === "video");
          sender?.replaceTrack(screenTrack!);
        }
        if (localVideoRef.current) localVideoRef.current.srcObject = ds;
        ds.getVideoTracks()[0]!.onended = () => toggleScreenShare();
        setScreenShare(true);
      } catch { /* user cancelled */ }
    }
  }

  function leave() {
    localStream?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    for (const peer of peersRef.current.values()) peer.pc?.close();
    peersRef.current.clear();
    sendMeetSignal({ roomId, type: "peer-left", payload: {} }).catch(() => {});
    onLeave();
  }

  const peerList = Array.from(peers.values());
  // Layout: 1 = full screen, 2 = side by side, 3-4 = 2x2, more = grid
  const total = peerList.length + 1;
  const gridCls =
    total === 1 ? "grid-cols-1" :
    total === 2 ? "grid-cols-2" :
    total <= 4 ? "grid-cols-2 grid-rows-2" :
    "grid-cols-3 grid-rows-3";

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg-deep">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between h-[52px] px-5 border-b border-brand-border no-select">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <p className="text-sm font-semibold text-text-primary">{meeting.title}</p>
          <span className="text-xs text-text-muted">· {total} participant{total === 1 ? "" : "s"}</span>
        </div>
        <button
          onClick={() => navigator.clipboard.writeText(`Meeting: ${meeting.title}\nRoom: ${roomId}`)}
          className="text-xs text-text-muted hover:text-text-primary transition-fast"
        >
          Copy invite
        </button>
      </div>

      {/* Video grid */}
      <div className="flex-1 p-4 overflow-hidden">
        {error ? (
          <div className="flex h-full items-center justify-center text-danger text-sm">
            {error}
          </div>
        ) : (
          <div className={`grid ${gridCls} gap-3 h-full`}>
            <VideoTile
              ref={localVideoRef}
              name={`${currentUserName} (you)`}
              muted={true}
              videoOn={videoOn}
              audioOn={audioOn}
              isLocal
            />
            {peerList.map(p => (
              <PeerVideoTile key={p.peerId} peer={p} />
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 flex items-center justify-center gap-3 py-4 border-t border-brand-border no-select">
        <CallButton onClick={toggleAudio} active={audioOn} title={audioOn ? "Mute" : "Unmute"}>
          {audioOn ? (
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" />
          ) : (
            <>
              <path d="M1 1l22 22M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 19v3M8 22h8" />
            </>
          )}
        </CallButton>
        <CallButton onClick={toggleVideo} active={videoOn} title={videoOn ? "Turn off video" : "Turn on video"}>
          {videoOn ? (
            <path d="M23 7l-7 5 7 5V7zM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
          ) : (
            <>
              <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10M1 1l22 22" />
            </>
          )}
        </CallButton>
        <CallButton onClick={toggleScreenShare} active={screenShare} title={screenShare ? "Stop sharing" : "Share screen"}>
          <path d="M14 3h7v7M10 14L21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
        </CallButton>
        <button
          onClick={leave}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 hover:bg-red-600 transition-fast"
          title="Leave call"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22.92 18.06A19.79 19.79 0 0 1 12 21a19.79 19.79 0 0 1-10.92-2.94l1.92-3.06a2 2 0 0 1 2.18-.89l3.83 1A11.05 11.05 0 0 1 9 12c0-1 .03-2 .08-3l-3.83-1.07a2 2 0 0 1-1.45-2.29l1.4-4.51a2 2 0 0 1 2.34-1.37 19.79 19.79 0 0 1 7.92 0 2 2 0 0 1 2.34 1.37l1.4 4.51a2 2 0 0 1-1.45 2.29L13.92 9c.05 1 .08 2 .08 3a11.05 11.05 0 0 1 0 4.11l3.83-1a2 2 0 0 1 2.18.89z" transform="rotate(135 12 12)" />
          </svg>
        </button>
      </div>
    </div>
  );
}

const VideoTile = forwardRef<HTMLVideoElement, {
  name: string;
  muted: boolean;
  videoOn: boolean;
  audioOn: boolean;
  isLocal?: boolean;
}>(({ name, muted, videoOn, audioOn, isLocal }, ref) => {
  return (
    <div className="relative aspect-video rounded-lg overflow-hidden bg-bg-card border border-brand-border">
      <video ref={ref} autoPlay playsInline muted={muted} className={`w-full h-full object-cover ${isLocal ? "scale-x-[-1]" : ""} ${videoOn ? "" : "hidden"}`} />
      {!videoOn && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-20 w-20 rounded-full bg-brand-dim border border-brand-border flex items-center justify-center text-3xl font-bold text-brand">
            {name[0]?.toUpperCase()}
          </div>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-2 px-2 py-1 rounded bg-black/60 text-xs text-white">
        {!audioOn && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 1l22 22M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
          </svg>
        )}
        {name}
      </div>
    </div>
  );
});
VideoTile.displayName = "VideoTile";

function PeerVideoTile({ peer }: { peer: PeerInfo }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && peer.stream) {
      videoRef.current.srcObject = peer.stream;
    }
  }, [peer.stream]);

  const hasVideo = (peer.stream?.getVideoTracks() ?? []).some(t => t.enabled);
  const hasAudio = (peer.stream?.getAudioTracks() ?? []).some(t => t.enabled);

  return (
    <div className="relative aspect-video rounded-lg overflow-hidden bg-bg-card border border-brand-border">
      <video ref={videoRef} autoPlay playsInline className={`w-full h-full object-cover ${hasVideo ? "" : "hidden"}`} />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-20 w-20 rounded-full bg-brand-dim border border-brand-border flex items-center justify-center text-3xl font-bold text-brand">
            {peer.name[0]?.toUpperCase()}
          </div>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-2 px-2 py-1 rounded bg-black/60 text-xs text-white">
        {!hasAudio && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 1l22 22M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
          </svg>
        )}
        {peer.name}
      </div>
    </div>
  );
}

function CallButton({ onClick, active, title, children }: { onClick: () => void; active: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-12 w-12 items-center justify-center rounded-full transition-fast ${
        active ? "bg-bg-card border border-brand-border text-text-primary" : "bg-red-500/20 border border-red-500/50 text-red-400"
      }`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}
