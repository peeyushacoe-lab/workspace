"use client";

import { useEffect, useRef } from "react";
import { Phone, Video, PhoneOff } from "lucide-react";
import type { CallMedia } from "@/lib/call-signaling";
import { JITSI_DOMAIN, loadJitsiExternalApi, type JitsiExternalApi } from "@/lib/jitsi";
import { useJoinPreferences } from "@/components/connect/useJoinPreferences";

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
  const apiRef = useRef<JitsiExternalApi | null>(null);
  const joinPrefs = useJoinPreferences();

  useEffect(() => {
    if (!containerRef.current) return;
    const domain = JITSI_DOMAIN;
    let disposed = false;

    // Fetch a JWT for self-hosted auth; null on the public server.
    const jwtPromise = fetch(`/api/meet/token?room=${encodeURIComponent(roomName)}`)
      .then((r) => (r.ok ? r.json() : { jwt: null }))
      .catch(() => ({ jwt: null }))
      .then(({ jwt }: { jwt: string | null }) => jwt);

    Promise.all([loadJitsiExternalApi(), jwtPromise]).then(([JitsiMeetExternalAPI, jwt]) => {
      if (disposed || !containerRef.current) return;

      const api = new JitsiMeetExternalAPI(domain, {
        roomName,
        ...(jwt ? { jwt } : {}),
        parentNode: containerRef.current,
        width: "100%",
        height: "100%",
        userInfo: { displayName },
        configOverwrite: {
          // Settings → Calls & meetings. An audio call always starts with the
          // camera off regardless of the preference — the preference can only
          // make a video call quieter, never make an audio call visible.
          startWithAudioMuted: joinPrefs.joinMuted,
          startWithVideoMuted: media === "audio" || joinPrefs.joinCameraOff,
          prejoinPageEnabled: false,
          disableDeepLinking: true,
          enableWelcomePage: false,
          hideConferenceTimer: false,
          disableThirdPartyRequests: true,
          liveStreamingEnabled: false,
          fileRecordingsEnabled: false,
          defaultBackground: "#f0efec",
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
          DEFAULT_BACKGROUND: "#f0efec",
          TOOLBAR_BUTTONS: [
            "microphone", "camera", "desktop", "fullscreen",
            "fodeviceselection", "hangup", "settings", "raisehand",
            "videoquality", "tileview",
          ],
        },
      });

      apiRef.current = api;
      api.addListener("readyToClose", () => onEnd());
    }).catch((err) => {
      console.error("[CallStage] Failed to load Jitsi External API:", err);
    });

    return () => {
      disposed = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
    // roomName is stable for the lifetime of a call; intentionally not re-running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-surface">
      <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          {media === "audio" ? (
            <Phone className="w-4 h-4 text-accent" />
          ) : (
            <Video className="w-4 h-4 text-accent" />
          )}
          <span className="text-sm font-semibold text-foreground">
            {media === "audio" ? "Voice call" : "Video call"} with {peerName}
          </span>
        </div>
        <button
          onClick={onEnd}
          className="flex items-center gap-1.5 text-xs font-semibold text-white px-3 py-1.5 rounded-lg bg-crit hover:bg-crit transition-colors"
        >
          <PhoneOff className="w-3.5 h-3.5" />
          Leave call
        </button>
      </div>
      <div ref={containerRef} className="flex-1 w-full" />
    </div>
  );
}
