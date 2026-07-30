"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { connectSocket } from "@/lib/socket-client";

declare global {
  interface Window {
    cyberSageDesktop?: {
      isDesktop: boolean;
      installUpdate: () => Promise<void>;
      onUpdateAvailable: (cb: (v: { version: string }) => void) => void;
      onUpdateDownloaded: (cb: (v: { version: string }) => void) => void;
      onNetworkStatus: (cb: (s: { online: boolean }) => void) => void;
      onSystemResume: (cb: () => void) => void;
      setBadge: (count: number) => Promise<void>;
    };
  }
}

export function DesktopBridge() {
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);

  useEffect(() => {
    const desktop = window.cyberSageDesktop;
    if (!desktop?.isDesktop) return;

    desktop.onUpdateAvailable(({ version }) => {
      toast.info(`Update ${version} is downloading…`, { duration: 5000 });
    });

    desktop.onUpdateDownloaded(({ version }) => {
      setUpdateVersion(version);
    });

    desktop.onNetworkStatus(({ online }) => {
      if (online) {
        toast.success("Back online", { duration: 2000 });
        connectSocket();
      } else {
        toast.warning("You are offline", { duration: Infinity, id: "offline" });
      }
    });

    // Reconnect socket after laptop wake
    desktop.onSystemResume(() => {
      connectSocket();
    });
  }, []);

  if (!updateVersion) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-surface border border-accent/30 rounded-xl px-4 py-3 shadow-xl flex items-center gap-3 text-sm">
      <span className="text-foreground">CyberSage <strong className="text-accent">{updateVersion}</strong> is ready</span>
      <button
        onClick={() => window.cyberSageDesktop?.installUpdate()}
        className="bg-accent text-accent-foreground font-semibold px-3 py-1 rounded-lg text-xs hover:opacity-90 transition-opacity"
      >
        Restart &amp; update
      </button>
      <button onClick={() => setUpdateVersion(null)} className="text-subtle hover:text-muted text-xs">
        Later
      </button>
    </div>
  );
}
