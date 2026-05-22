"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function OfflineComposeBanner() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "OFFLINE_QUEUE_FLUSHED" && event.data.count > 0) {
        toast.success(`${event.data.count} queued email${event.data.count > 1 ? "s" : ""} sent`, {
          description: "Your offline-composed emails have been delivered.",
        });
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  return null;
}
