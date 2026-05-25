"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Phone } from "lucide-react";

export default function MeetRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!roomId || !containerRef.current) return;

    const script = document.createElement("script");
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const JitsiAPI = (window as any).JitsiMeetExternalAPI as (new (domain: string, opts: unknown) => { dispose: () => void }) | undefined;
      if (!containerRef.current || !JitsiAPI) return;
      const api = new JitsiAPI("meet.jit.si", {
        roomName: roomId,
        parentNode: containerRef.current,
        width: "100%",
        height: "100%",
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          prejoinPageEnabled: true,
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          TOOLBAR_BUTTONS: [
            "microphone", "camera", "closedcaptions", "desktop", "fullscreen",
            "fodeviceselection", "hangup", "profile", "chat", "recording",
            "livestreaming", "etherpad", "sharedvideo", "settings", "raisehand",
            "videoquality", "filmstrip", "invite", "feedback", "stats", "shortcuts",
            "tileview", "videobackgroundblur", "download", "help", "mute-everyone",
          ],
        },
      });
      return () => api.dispose();
    };
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, [roomId]);

  return (
    <div className="flex flex-col h-screen bg-[#0f1321]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1b1f2e] border-b border-[rgba(0,210,255,0.1)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-[#00d2ff]" />
          <span className="text-sm font-semibold text-[#dfe1f6]">CyberSage Meet</span>
          <span className="text-xs text-[#5c6b72] font-mono">{roomId}</span>
        </div>
        <button
          onClick={() => router.back()}
          className="text-xs text-[#bbc9cf] hover:text-[#dfe1f6] px-3 py-1.5 rounded-lg border border-[rgba(0,255,255,0.1)] hover:bg-[#262939] transition-colors"
        >
          Leave call
        </button>
      </div>
      {/* Jitsi container */}
      <div ref={containerRef} className="flex-1 w-full" />
    </div>
  );
}
