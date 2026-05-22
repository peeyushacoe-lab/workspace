"use client";
import { useEffect } from "react";
import { toast } from "sonner";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;

    const subscribeToPush = async (reg: ServiceWorkerRegistration) => {
      if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;

      try {
        const existing = await reg.pushManager.getSubscription();
        if (!existing) {
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
          });
          await fetch("/api/notifications/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription: sub.toJSON() }),
          });
        }
      } catch {
        // Push subscription failed — non-fatal, continue silently
      }
    };

    const handleUpdateFound = () => {
      if (!registration) return;
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (
          newWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          // A new SW is waiting — prompt user to reload
          toast("Update available", {
            description: "A new version of CyberSage is ready.",
            action: {
              label: "Reload",
              onClick: () => window.location.reload(),
            },
            duration: Infinity,
          });
        }
      });
    };

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registration = reg;
        reg.addEventListener("updatefound", handleUpdateFound);
        // Periodically check for updates
        reg.update().catch(() => {});
        return subscribeToPush(reg);
      })
      .catch(console.error);

    // Also check for controller change (handles reload-after-update)
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (registration) {
        registration.removeEventListener("updatefound", handleUpdateFound);
      }
    };
  }, []);

  return null;
}
