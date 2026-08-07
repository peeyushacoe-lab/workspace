"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  DEFAULT_CONNECT_SETTINGS,
  type ConnectSettings,
  type DeepPartial,
} from "@/lib/connect-settings";
import { invalidateJoinPreferences } from "@/components/connect/useJoinPreferences";

/**
 * Loads a person's Connect settings once, applies the ones that change how the
 * app looks, and shares the rest with anything that needs to read them.
 *
 * Mounted in the Connect shell rather than per-page so a setting applies the
 * moment it's saved, everywhere, without a reload — and so appearance changes
 * don't flash on every navigation.
 *
 * The appearance settings are applied as classes on `<html>` rather than as
 * React state threaded through components — `largerText` works by moving the
 * root font size so every rem-based measurement in the product follows
 * without touching a single component.
 *
 * Note there is no theme here. Anything applied from a *client-fetched*
 * preference can only land after hydration, which means a visible flash of the
 * wrong theme on every navigation. Atrium is light-first and dark mode is
 * opt-in at the layout level, so the correct move was to remove the setting
 * rather than ship the flash. See src/lib/connect-settings.ts.
 */

type Ctx = {
  settings: ConnectSettings;
  /** Optimistically applies locally, then persists. Reverts on failure. */
  update: (patch: DeepPartial<ConnectSettings>) => Promise<void>;
  loaded: boolean;
};

const SettingsContext = createContext<Ctx>({
  settings: DEFAULT_CONNECT_SETTINGS,
  update: async () => {},
  loaded: false,
});

export function useConnectSettings() {
  return useContext(SettingsContext);
}

export function ConnectSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<ConnectSettings>(DEFAULT_CONNECT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/connect/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { settings: ConnectSettings } | null) => {
        if (!cancelled && d?.settings) setSettings(d.settings);
      })
      .catch(() => {
        // Defaults are a working product. A failed settings fetch must not stop
        // someone using chat.
      })
      .finally(() => !cancelled && setLoaded(true));
    return () => { cancelled = true; };
  }, []);

  const update = useCallback(
    async (patch: DeepPartial<ConnectSettings>) => {
      const previous = settings;
      // Apply first: a toggle that waits on a round trip before moving feels
      // broken, and these are all instantly reversible.
      const optimistic: ConnectSettings = {
        appearance: { ...settings.appearance, ...patch.appearance },
        messaging: { ...settings.messaging, ...patch.messaging },
        calls: { ...settings.calls, ...patch.calls },
        privacy: { ...settings.privacy, ...patch.privacy },
      };
      setSettings(optimistic);
      try {
        const res = await fetch("/api/connect/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error("Failed");
        const data = (await res.json()) as { settings: ConnectSettings };
        // Trust the server's version — it validated and merged, and may have
        // rejected a value the UI thought was fine.
        setSettings(data.settings);
        // Meeting surfaces read the join preferences through their own cached
        // fetch (they also mount in the Nexus shell, outside this provider), so
        // that cache has to be dropped or the next call would use stale values.
        invalidateJoinPreferences();
      } catch (err) {
        setSettings(previous);
        throw err;
      }
    },
    [settings],
  );

  // ── Apply appearance to the document ──────────────────────────────────────
  const { reduceMotion, largerText, density } = settings.appearance;

  useEffect(() => {
    const root = document.documentElement;
    // Respect the OS setting too — someone who has asked their system to
    // reduce motion should not have to ask again here.
    const osReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.classList.toggle("connect-reduce-motion", reduceMotion || osReduced);
  }, [reduceMotion]);

  useEffect(() => {
    document.documentElement.classList.toggle("connect-larger-text", largerText);
  }, [largerText]);

  useEffect(() => {
    document.documentElement.classList.toggle("connect-compact", density === "compact");
  }, [density]);

  return (
    <SettingsContext.Provider value={{ settings, update, loaded }}>
      {children}
    </SettingsContext.Provider>
  );
}
