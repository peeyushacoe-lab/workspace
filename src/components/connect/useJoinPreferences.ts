"use client";

import { useEffect, useState } from "react";
import { DEFAULT_CONNECT_SETTINGS, type ConnectSettings } from "@/lib/connect-settings";

/**
 * Just the "how do I arrive in a call" preferences, fetched independently of
 * the Connect settings context.
 *
 * The meeting surfaces are mounted in *both* shells — `/meet` lives in the
 * Nexus portal, outside `ConnectSettingsProvider` — so reading from that
 * context would make the preference apply in Connect and silently not apply in
 * Nexus. Settings claims to apply "everywhere you're signed in", and a setting
 * that quietly depends on which shell you happened to open is worse than no
 * setting at all: you'd learn it works, trust it, and then join a call unmuted.
 *
 * The promise is cached at module scope, so N meeting components on a page
 * share one request and a second meeting in the same session costs nothing.
 */

let cached: Promise<ConnectSettings["calls"]> | null = null;

function fetchJoinPrefs(): Promise<ConnectSettings["calls"]> {
  cached ??= fetch("/api/connect/settings", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { settings?: ConnectSettings } | null) => d?.settings?.calls ?? DEFAULT_CONNECT_SETTINGS.calls)
    .catch(() => DEFAULT_CONNECT_SETTINGS.calls);
  return cached;
}

export function useJoinPreferences(): ConnectSettings["calls"] {
  const [prefs, setPrefs] = useState<ConnectSettings["calls"]>(DEFAULT_CONNECT_SETTINGS.calls);

  useEffect(() => {
    let cancelled = false;
    void fetchJoinPrefs().then((p) => { if (!cancelled) setPrefs(p); });
    return () => { cancelled = true; };
  }, []);

  return prefs;
}

/** Drop the cache so a change made in Settings applies to the next call
 *  without a reload. */
export function invalidateJoinPreferences() {
  cached = null;
}
