"use client";

import { useEffect, useRef } from "react";
import { Phone, Video, PhoneOff } from "lucide-react";
import type { CallMedia } from "@/lib/call-signaling";

const JITSI_DOMAIN = process.env.NEXT_PUBLIC_JITSI_DOMAIN ?? "meet.jit.si";

type JitsiApi = {
  dispose: () => void;
  addListener: (event: string, cb: () => void) => void;
};

// Full-screen Jitsi overlay for an active 1:1 call. Audio calls start with the
// camera off (the user can still turn it on). Hanging up here closes the stage.
export function CallStage({
  roomName,
  media,
  peerName,
  displayName,
  onEnd,
}: {
  roomName: string;
  media: CallMedia;
  peerName: string;
  displayName: string;
  onEnd: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const domain = JITSI_DOMAIN;

    const script = document.createElement("script");
    script.src = "https://" + domain + "/external_api.js";
    script.async = true;
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const JitsiAPI = (window as any).JitsiMeetExternalAPI as
        | (new (domain: string, opts: unknown) => JitsiApi)
        | undefined;
      if (!containerRef.current || !JitsiAPI) return;

      const api = new JitsiAPI(domain, {
        roomName,
        parentNode: containerRef.current,
        width: "100%",
        height: "100%",
        userInfo: { displayName },
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: media === "audio",
          prejoinPageEnabled: false,
          disableDeepLinking: true,
          enableWelcomePage: false,
          hideConferenceTimer: false,
          disableThirdPartyRequests: true,
          liveStreamingEnabled: false,
          fileRecordingsEnabled: false,
          defaultBackground: "#0f1321",
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          SHOW_BRAND_WATERMARK: false,
          SHOW_POWERED_BY: false,
          DISPLAY_WELCOME_FOOTER: false,
          APP_NAME: "CyberSage Meet",
          NATIVE_APP_NAME: "CyberSage Meet",
          PROVIDER_NAME: "CyberSage",
          DEFAULT_BACKGROUND: "#0f1321",
          TOOLBAR_BUTTONS: [
            "microphone", "camera", "desktop", "fullscreen",
            "fodeviceselection", "hangup", "settings", "raisehand",
            "videoquality", "tileview",
          ],
        },
      });

      apiRef.current = api;
      api.addListener("readyToClose", () => onEnd());
    };

    document.head.appendChild(script);
    return () => {
      apiRef.current?.dispose();
      apiRef.current = null;
      try {
        document.head.removeChild(script);
      } catch {
        /* already removed */
      }
    };
    // roomName is stable for the lifetime of a call; intentionally not re-running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#0f1321]">
      <div className="flex items-center justify-between px-4 py-2 bg-[#12151D] border-b border-[#262A35] flex-shrink-0">
        <div className="flex items-center gap-2">
          {media === "audio" ? (
            <Phone className="w-4 h-4 text-[#00C2FF]" />
          ) : (
            <Video className="w-4 h-4 text-[#00C2FF]" />
          )}
          <span className="text-sm font-semibold text-[#E6E9F0]">
            {media === "audio" ? "Voice call" : "Video call"} with {peerName}
          </span>
        </div>
        <button
          onClick={onEnd}
          className="flex items-center gap-1.5 text-xs font-semibold text-white px-3 py-1.5 rounded-lg bg-[#ea4335] hover:bg-[#d33426] transition-colors"
        >
          <PhoneOff className="w-3.5 h-3.5" />
          Leave call
        </button>
      </div>
      <div ref={containerRef} className="flex-1 w-full" />
    </div>
  );
}
