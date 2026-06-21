"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Phone, Video, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import type { ActiveCall, CallMedia } from "@/lib/call-signaling";
import { CallStage } from "./CallStage";

type ActiveSession = {
  callId: string;
  roomName: string;
  media: CallMedia;
  peerName: string;
};

type CallContextValue = {
  startCall: (channelId: string, peerName: string, media: CallMedia) => Promise<void>;
  busy: boolean;
};

const CallContext = createContext<CallContextValue | null>(null);

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) {
    // Safe no-op fallback if a consumer renders outside the provider.
    return { startCall: async () => {}, busy: false };
  }
  return ctx;
}

// ─── Ringer: synthesised tones, no bundled audio asset ──────────────────────
class Ringer {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  private ensureCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      if (!this.ctx) this.ctx = new AC();
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private beep(freq: number, duration: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  start(kind: "incoming" | "ringback") {
    this.stop();
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const ring = () => {
      if (kind === "incoming") {
        this.beep(660, 0.35);
        setTimeout(() => this.beep(550, 0.35), 400);
      } else {
        this.beep(440, 0.5);
      }
    };
    ring();
    this.timer = setInterval(ring, kind === "incoming" ? 1800 : 2400);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export function CallProvider({
  currentUserName,
  children,
}: {
  currentUserName: string;
  children: React.ReactNode;
}) {
  const [incoming, setIncoming] = useState<ActiveCall | null>(null);
  const [outgoing, setOutgoing] = useState<ActiveCall | null>(null);
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [busy, setBusy] = useState(false);

  const ringerRef = useRef<Ringer | null>(null);
  if (!ringerRef.current && typeof window !== "undefined") {
    ringerRef.current = new Ringer();
  }
  // Keep the latest outgoing/incoming visible to the SSE handler without
  // re-subscribing the stream on every state change.
  const outgoingRef = useRef<ActiveCall | null>(null);
  const incomingRef = useRef<ActiveCall | null>(null);
  const activeRef = useRef<ActiveSession | null>(null);
  outgoingRef.current = outgoing;
  incomingRef.current = incoming;
  activeRef.current = active;

  const signal = useCallback(async (callId: string, action: string) => {
    await fetch("/api/chat/call/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, action }),
    }).catch(() => {});
  }, []);

  // ─── Incoming signal stream ───────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource("/api/chat/call/stream");
    es.onmessage = (e) => {
      let sig: { type: string; data: { callId?: string; roomName?: string } } & {
        data: ActiveCall;
      };
      try {
        sig = JSON.parse(e.data);
      } catch {
        return;
      }
      const ringer = ringerRef.current;
      switch (sig.type) {
        case "call.incoming": {
          // Ignore if we're already in/handling a call.
          if (activeRef.current || incomingRef.current || outgoingRef.current) {
            void fetch("/api/chat/call/signal", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ callId: sig.data.callId, action: "decline" }),
            }).catch(() => {});
            return;
          }
          setIncoming(sig.data);
          ringer?.start("incoming");
          break;
        }
        case "call.accepted": {
          const out = outgoingRef.current;
          if (out && out.callId === sig.data.callId) {
            ringer?.stop();
            setActive({
              callId: out.callId,
              roomName: out.roomName,
              media: out.media,
              peerName: out.callee.name,
            });
            setOutgoing(null);
          }
          break;
        }
        case "call.declined": {
          const out = outgoingRef.current;
          if (out && out.callId === sig.data.callId) {
            ringer?.stop();
            toast.info(out.callee.name + " is unavailable");
            setOutgoing(null);
          }
          break;
        }
        case "call.cancelled": {
          const inc = incomingRef.current;
          if (inc && inc.callId === sig.data.callId) {
            ringer?.stop();
            setIncoming(null);
          }
          break;
        }
        case "call.ended": {
          if (activeRef.current && activeRef.current.callId === sig.data.callId) {
            setActive(null);
            toast.info("Call ended");
          }
          break;
        }
        default:
          break;
      }
    };
    es.onerror = () => {
      // Browser auto-reconnects; nothing to do.
    };
    return () => es.close();
  }, []);

  // ─── Polling fallback ─────────────────────────────────────────────────────
  // On serverless (Vercel + Upstash), Redis pub/sub → SSE delivery isn't
  // guaranteed, so we also poll. This is what makes ringing reliable; the SSE
  // path above just makes it instant when it works. Deduped via state refs.
  useEffect(() => {
    const tick = async () => {
      if (activeRef.current) return; // already in a call
      const out = outgoingRef.current;
      const inc = incomingRef.current;
      try {
        const res = await fetch(
          "/api/chat/call/poll" + (out ? "?callId=" + encodeURIComponent(out.callId) : ""),
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          incoming: ActiveCall | null;
          outgoing: { status: string } | null;
        };

        // Caller waiting on an outgoing 1:1 call
        if (out && data.outgoing) {
          if (data.outgoing.status === "accepted") {
            ringerRef.current?.stop();
            setActive({ callId: out.callId, roomName: out.roomName, media: out.media, peerName: out.callee.name });
            setOutgoing(null);
            return;
          }
          if (data.outgoing.status === "declined" || data.outgoing.status === "ended") {
            ringerRef.current?.stop();
            toast.info(out.callee.name + " is unavailable");
            setOutgoing(null);
            return;
          }
        }

        // New incoming call discovered by polling
        if (!out && !inc && data.incoming) {
          setIncoming(data.incoming);
          ringerRef.current?.start("incoming");
          return;
        }

        // Incoming call cancelled by the caller
        if (inc && !data.incoming) {
          ringerRef.current?.stop();
          setIncoming(null);
        }
      } catch {
        /* ignore poll errors */
      }
    };
    const interval = setInterval(() => void tick(), 3000);
    return () => clearInterval(interval);
  }, []);

  const startCall = useCallback(
    async (channelId: string, peerName: string, media: CallMedia) => {
      if (active || outgoing || incoming) {
        toast.error("You're already on a call");
        return;
      }
      setBusy(true);
      try {
        const res = await fetch("/api/chat/call/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId, media }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.error || "Could not start the call");
          return;
        }
        const { call } = (await res.json()) as { call: ActiveCall };
        if (call.isGroup) {
          // Group host joins the room immediately; the others ring to join.
          setActive({
            callId: call.callId,
            roomName: call.roomName,
            media: call.media,
            peerName: call.callee.name,
          });
        } else {
          setOutgoing(call);
          ringerRef.current?.start("ringback");
        }
      } catch {
        toast.error("Could not start the call");
      } finally {
        setBusy(false);
      }
    },
    [active, outgoing, incoming],
  );

  const acceptIncoming = useCallback(async () => {
    const inc = incoming;
    if (!inc) return;
    ringerRef.current?.stop();
    await signal(inc.callId, "accept");
    setActive({
      callId: inc.callId,
      roomName: inc.roomName,
      media: inc.media,
      peerName: inc.caller.name,
    });
    setIncoming(null);
  }, [incoming, signal]);

  const declineIncoming = useCallback(async () => {
    const inc = incoming;
    if (!inc) return;
    ringerRef.current?.stop();
    setIncoming(null);
    await signal(inc.callId, "decline");
  }, [incoming, signal]);

  const cancelOutgoing = useCallback(async () => {
    const out = outgoing;
    if (!out) return;
    ringerRef.current?.stop();
    setOutgoing(null);
    await signal(out.callId, "cancel");
  }, [outgoing, signal]);

  const endActive = useCallback(async () => {
    const a = active;
    if (!a) return;
    setActive(null);
    await signal(a.callId, "end");
  }, [active, signal]);

  // Auto-give-up on an unanswered outgoing call (server invite expires at 60s).
  useEffect(() => {
    if (!outgoing) return;
    const t = setTimeout(() => {
      toast.info("No answer from " + outgoing.callee.name);
      void cancelOutgoing();
    }, 45_000);
    return () => clearTimeout(t);
  }, [outgoing, cancelOutgoing]);

  // Auto-dismiss a ringing incoming call that's never answered.
  useEffect(() => {
    if (!incoming) return;
    const t = setTimeout(() => void declineIncoming(), 50_000);
    return () => clearTimeout(t);
  }, [incoming, declineIncoming]);

  const value = useMemo<CallContextValue>(() => ({ startCall, busy }), [startCall, busy]);

  return (
    <CallContext.Provider value={value}>
      {children}

      {/* Incoming call */}
      {incoming && (
        <CallModal
          title={incoming.caller.name}
          subtitle={"Incoming " + (incoming.media === "audio" ? "voice" : "video") + " call"}
          media={incoming.media}
          primary={{ label: "Accept", tone: "accept", onClick: () => void acceptIncoming() }}
          secondary={{ label: "Decline", onClick: () => void declineIncoming() }}
        />
      )}

      {/* Outgoing call */}
      {outgoing && !active && (
        <CallModal
          title={outgoing.callee.name}
          subtitle={"Calling…"}
          media={outgoing.media}
          secondary={{ label: "Cancel", onClick: () => void cancelOutgoing() }}
        />
      )}

      {/* Connected call */}
      {active && (
        <CallStage
          roomName={active.roomName}
          media={active.media}
          peerName={active.peerName}
          displayName={currentUserName}
          onEnd={() => void endActive()}
        />
      )}
    </CallContext.Provider>
  );
}

// ─── Ring / outgoing modal ──────────────────────────────────────────────────
function CallModal({
  title,
  subtitle,
  media,
  primary,
  secondary,
}: {
  title: string;
  subtitle: string;
  media: CallMedia;
  primary?: { label: string; tone: "accept"; onClick: () => void };
  secondary: { label: string; onClick: () => void };
}) {
  return (
    <div className="nexfade fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="nexpop w-[320px] bg-[#12151D] border border-[#262A35] rounded-2xl shadow-2xl p-6 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-full bg-[#00C2FF]/10 flex items-center justify-center mb-4">
          {media === "audio" ? (
            <Phone className="w-7 h-7 text-[#00C2FF]" />
          ) : (
            <Video className="w-7 h-7 text-[#00C2FF]" />
          )}
        </div>
        <p className="text-lg font-semibold text-[#E6E9F0]">{title}</p>
        <p className="text-sm text-[#8A92A6] mt-1 mb-6">{subtitle}</p>
        <div className="flex items-center gap-3">
          <button
            onClick={secondary.onClick}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-[#ea4335] text-white hover:bg-[#d33426] transition-colors"
          >
            <PhoneOff className="w-4 h-4" />
            {secondary.label}
          </button>
          {primary && (
            <button
              onClick={primary.onClick}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-[#0f9d58] text-white hover:bg-[#0c7a43] transition-colors"
            >
              <Phone className="w-4 h-4" />
              {primary.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
