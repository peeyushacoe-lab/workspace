"use client";
import { useEffect, useState } from "react";

type Status = "offline" | "back-online" | "online";

export function OfflineIndicator() {
  const [status, setStatus] = useState<Status>("online");

  useEffect(() => {
    // Initialise from current browser state
    if (!navigator.onLine) setStatus("offline");

    let backOnlineTimer: ReturnType<typeof setTimeout> | null = null;

    const handleOffline = () => {
      if (backOnlineTimer) clearTimeout(backOnlineTimer);
      setStatus("offline");
    };

    const handleOnline = () => {
      setStatus("back-online");
      backOnlineTimer = setTimeout(() => setStatus("online"), 2000);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      if (backOnlineTimer) clearTimeout(backOnlineTimer);
    };
  }, []);

  if (status === "online") return null;

  if (status === "offline") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[#0f172a] text-white text-sm px-4 py-2 rounded-full shadow-lg"
      >
        <span className="w-2 h-2 rounded-full bg-amber-400" />
        You are offline — some features may be unavailable
      </div>
    );
  }

  // back-online flash
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[#0f172a] text-white text-sm px-4 py-2 rounded-full shadow-lg"
    >
      <svg
        className="w-4 h-4 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      Back online
    </div>
  );
}
