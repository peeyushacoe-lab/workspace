"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Phone } from "lucide-react";

// Set NEXT_PUBLIC_JITSI_DOMAIN in your env to point at a self-hosted Jitsi instance
// (e.g. "meet.yourdomain.com"). Without it the public meet.jit.si is used, which
// cannot fully suppress third-party branding from the client side.
const JITSI_DOMAIN = process.env.NEXT_PUBLIC_JITSI_DOMAIN ?? "meet.jit.si";

export default function MeetRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<{ dispose: () => void } | null>(null);

  useEffect(() => {
    if (!roomId || !containerRef.current) return;

    const domain = JITSI_DOMAIN;
    const scriptSrc = `https://${domain}/external_api.js`;

    const script = document.createElement("script");
    script.src = scriptSrc;
    script.async = true;
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const JitsiAPI = (window as any).JitsiMeetExternalAPI as
        | (new (domain: string, opts: unknown) => { dispose: () => void; addListener: (e: string, cb: () => void) => void })
        | undefined;
      if (!containerRef.current || !JitsiAPI) return;

      const api = new JitsiAPI(domain, {
        roomName: roomId,
        parentNode: containerRef.current,
        width: "100%",
        height: "100%",
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          prejoinPageEnabled: false,          // skip the pre-join lobby screen
          disableDeepLinking: true,           // never redirect to native app
          enableWelcomePage: false,
          hideConferenceTimer: true,          // hide the built-in call timer
          disableRemoteMute: false,
          defaultBackground: "#0f1321",
          brandingDataUrl: "",                // no external branding
          // Disable features that expose third-party branding
          disableThirdPartyRequests: true,
          liveStreamingEnabled: false,
          fileRecordingsEnabled: false,
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          SHOW_BRAND_WATERMARK: false,
          BRAND_WATERMARK_LINK: "",
          SHOW_POWERED_BY: false,
          DISPLAY_WELCOME_FOOTER: false,
          GENERATE_ROOMNAMES_ON_WELCOME_PAGE: false,
          APP_NAME: "CyberSage Meet",
          NATIVE_APP_NAME: "CyberSage Meet",
          PROVIDER_NAME: "CyberSage",
          DEFAULT_BACKGROUND: "#0f1321",
          DEFAULT_LOCAL_DISPLAY_NAME: "Me",
          TOOLBAR_ALWAYS_VISIBLE: false,
          TOOLBAR_BUTTONS: [
            "microphone", "camera", "closedcaptions", "desktop", "fullscreen",
            "fodeviceselection", "hangup", "chat", "settings", "raisehand",
            "videoquality", "filmstrip", "tileview", "help", "mute-everyone", "security",
          ],
        },
      });

      apiRef.current = api;

      // Auto-leave when the user hangs up inside Jitsi
      api.addListener("readyToClose", () => {
        router.back();
      });
    };

    document.head.appendChild(script);
    return () => {
      apiRef.current?.dispose();
      apiRef.current = null;
      try { document.head.removeChild(script); } catch { /* already removed */ }
    };
  }, [roomId, router]);

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-[#e8eaed] flex-shrink-0">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-[#1a56db]" />
          <span className="text-sm font-semibold text-[#202124]">CyberSage Meet</span>
          <span className="text-xs text-[#9aa0a6] font-mono">{roomId}</span>
        </div>
        <button
          onClick={() => router.back()}
          className="text-xs text-[#5f6368] hover:text-[#202124] px-3 py-1.5 rounded-lg border border-[#e8eaed] hover:bg-[#f1f3f4] transition-colors"
        >
          Leave call
        </button>
      </div>
      {/* Jitsi container — fills remaining height */}
      <div ref={containerRef} className="flex-1 w-full" />
    </div>
  );
}
