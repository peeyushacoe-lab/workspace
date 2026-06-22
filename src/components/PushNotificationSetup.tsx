"use client";

/**
 * PushNotificationSetup
 *
 * Shows a bottom-sheet permission prompt when:
 *   - the browser supports Web Push
 *   - permission hasn't been granted or denied yet
 *   - user hasn't dismissed the prompt in this session
 *
 * Works on Safari (iOS 16.4+), Chrome, Brave, Firefox, Edge — any browser
 * that supports the Push API. On iOS Safari the user must have added the app
 * to their Home Screen, OR be on iOS 16.4+ which supports push in-browser.
 */

import { useEffect, useState, useRef } from "react";
import { Bell, X, BellOff } from "lucide-react";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const DISMISSED_KEY = "nexus_push_dismissed_at";
const SUBSCRIBED_KEY = "nexus_push_subscribed";
// Re-prompt after 7 days if dismissed
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
}

async function registerAndSubscribe(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  if (!VAPID_PUBLIC) return null;

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  // Check for existing subscription first
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
  });
}

async function saveSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
  });
}

export function PushNotificationSetup() {
  const [show, setShow] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "done" | "denied">("idle");
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;

    // Must support Push API
    if (!("PushManager" in window) || !("serviceWorker" in navigator)) return;
    if (!VAPID_PUBLIC) return;

    const perm = Notification.permission;

    // Already granted — silently subscribe in background (e.g. new device/session)
    if (perm === "granted") {
      handled.current = true;
      void registerAndSubscribe().then((sub) => {
        if (sub) {
          void saveSubscription(sub);
          localStorage.setItem(SUBSCRIBED_KEY, "1");
        }
      });
      return;
    }

    // Already denied — nothing we can do
    if (perm === "denied") return;

    // Already subscribed this session
    if (localStorage.getItem(SUBSCRIBED_KEY) === "1") return;

    // Check dismiss TTL
    const dismissedAt = localStorage.getItem(DISMISSED_KEY);
    if (dismissedAt && Date.now() - Number(dismissedAt) < DISMISS_TTL_MS) return;

    // Show prompt
    handled.current = true;
    // Small delay so layout settles after navigation
    const timer = setTimeout(() => setShow(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  async function handleAllow() {
    setState("loading");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState("denied");
        localStorage.setItem(DISMISSED_KEY, String(Date.now()));
        setTimeout(() => setShow(false), 2000);
        return;
      }
      const sub = await registerAndSubscribe();
      if (sub) {
        await saveSubscription(sub);
        localStorage.setItem(SUBSCRIBED_KEY, "1");
      }
      setState("done");
      setTimeout(() => setShow(false), 1800);
    } catch {
      setState("denied");
      setTimeout(() => setShow(false), 2000);
    }
  }

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setShow(false);
  }

  if (!show) return null;

  return (
    <>
      {/* Backdrop on mobile */}
      <div
        className="fixed inset-0 z-[998] bg-black/40 backdrop-blur-sm sm:hidden"
        onClick={handleDismiss}
      />

      {/* Bottom sheet (mobile) / top-right toast (desktop) */}
      <div
        className={[
          "fixed z-[999] transition-all duration-300",
          // Mobile: full-width bottom sheet
          "bottom-0 left-0 right-0 rounded-t-2xl",
          // Desktop: small card top-right
          "sm:bottom-auto sm:top-4 sm:right-4 sm:left-auto sm:rounded-xl sm:w-80",
        ].join(" ")}
        style={{ background: "#16191F", border: "1px solid #262A35" }}
      >
        {/* Handle bar (mobile only) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-[#3A3F4B]" />
        </div>

        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "#1a56db22" }}>
                <Bell className="w-5 h-5" style={{ color: "#1a56db" }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#E6E9F0]">Stay in the loop</p>
                <p className="text-xs text-[#5A6275] mt-0.5">Get notified for emails &amp; messages</p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 rounded-lg text-[#5A6275] hover:text-[#E6E9F0] hover:bg-[#1B1F2A] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          {state === "idle" && (
            <>
              <p className="text-xs text-[#8A92A6] mb-4 leading-relaxed">
                Nexus will send you push notifications when you receive a new email or a chat message —
                even when the app is in the background.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleAllow}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
                  style={{ background: "#1a56db" }}
                >
                  Enable notifications
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-3 py-2.5 rounded-lg text-sm font-medium text-[#5A6275] hover:text-[#E6E9F0] hover:bg-[#1B1F2A] transition-colors"
                >
                  Not now
                </button>
              </div>
            </>
          )}

          {state === "loading" && (
            <p className="text-xs text-[#5A6275] text-center py-3">
              Requesting permission…
            </p>
          )}

          {state === "done" && (
            <div className="flex items-center gap-2 py-2">
              <Bell className="w-4 h-4 text-[#0f9d58]" />
              <p className="text-sm text-[#0f9d58] font-medium">Notifications enabled!</p>
            </div>
          )}

          {state === "denied" && (
            <div className="flex items-center gap-2 py-2">
              <BellOff className="w-4 h-4 text-[#5A6275]" />
              <p className="text-sm text-[#5A6275]">
                Permission denied. You can enable it in your browser settings.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
