/**
 * Sage Connect user settings.
 *
 * Stored in `User.preferences.connect`, alongside the existing
 * `preferences.notifications` block that `shouldNotify` already reads — the
 * notification matrix is deliberately *not* duplicated here. Connect and Nexus
 * are one identity, and a person who silences chat mentions in one place has
 * silenced them, full stop.
 *
 * Every setting in this file changes real behaviour. That constraint is the
 * whole design: a settings page whose switches do nothing is worse than one
 * that's missing them, because it teaches people not to trust the controls.
 * Anything that would need server work not yet done is absent rather than
 * present-and-inert.
 */

export type DensityPreference = "comfortable" | "compact";

export type ConnectSettings = {
  appearance: {
    /**
     * Deliberately no theme setting.
     *
     * Atrium is light-first and dark mode is opt-in at the layout level (see
     * CLAUDE.md). A picker defaulting to "system" meant anyone on a dark-OS
     * machine got flipped to a theme they never asked for — and because the
     * class can only be applied after hydration, they got a dark-then-light
     * flash on every navigation on top of it. There is no way to apply a
     * client-stored theme before first paint without an inline blocking
     * script, so the honest options were "flash" or "don't". This is "don't".
     */
    /** Row padding in conversation lists and message rows. */
    density: DensityPreference;
    /** Suppresses transitions and the typing/loading animations. Also set
     *  automatically for anyone whose OS reports prefers-reduced-motion. */
    reduceMotion: boolean;
    /** Scales Connect's base type. Applied as a root font-size, so everything
     *  built in rem/em follows without per-component work. */
    largerText: boolean;
  };
  messaging: {
    /** Enter sends, Shift+Enter newlines. Off swaps them. */
    enterToSend: boolean;
    /** Render inline previews for image attachments and GIFs. */
    mediaPreviews: boolean;
    /** Show the "X is typing" strip from other people. Independent of whether
     *  *you* broadcast yours — see privacy.shareTyping. */
    showTypingIndicators: boolean;
  };
  calls: {
    /** Join meetings with the microphone already muted. */
    joinMuted: boolean;
    /** Join meetings with the camera already off. */
    joinCameraOff: boolean;
  };
  privacy: {
    /**
     * Send read receipts. Off means opening a conversation no longer tells the
     * sender you've seen it — enforced server-side in the messages route, not
     * just hidden in the UI, because a privacy setting that only stops the
     * display is not a privacy setting.
     */
    shareReadReceipts: boolean;
    /** Broadcast your typing state to others. */
    shareTyping: boolean;
  };
};

export const DEFAULT_CONNECT_SETTINGS: ConnectSettings = {
  appearance: {
    density: "comfortable",
    reduceMotion: false,
    largerText: false,
  },
  messaging: {
    enterToSend: true,
    mediaPreviews: true,
    showTypingIndicators: true,
  },
  calls: {
    // Defaults chosen so joining a meeting is never a surprise: arriving
    // unmuted on camera into a call you meant to listen to is the single most
    // common complaint about every product in this category.
    joinMuted: false,
    joinCameraOff: false,
  },
  privacy: {
    shareReadReceipts: true,
    shareTyping: true,
  },
};

/**
 * Merge stored settings over the defaults, one level into each section.
 *
 * Deliberately tolerant: `preferences` is untyped JSON that predates this
 * file, may be null, may hold a half-written shape from an older release, and
 * is read on every message send. A throw here would take chat down, so
 * anything unrecognised is ignored rather than rejected.
 */
export function readConnectSettings(preferences: unknown): ConnectSettings {
  const root = isRecord(preferences) ? preferences : {};
  const stored = isRecord(root.connect) ? root.connect : {};

  return {
    appearance: mergeSection(DEFAULT_CONNECT_SETTINGS.appearance, stored.appearance),
    messaging: mergeSection(DEFAULT_CONNECT_SETTINGS.messaging, stored.messaging),
    calls: mergeSection(DEFAULT_CONNECT_SETTINGS.calls, stored.calls),
    privacy: mergeSection(DEFAULT_CONNECT_SETTINGS.privacy, stored.privacy),
  };
}

/**
 * Produce the full `preferences` object to persist, with `connect` replaced by
 * the merged result. Everything else in `preferences` — HR lifecycle state,
 * employee ids, the notification matrix — is preserved untouched. Several
 * unrelated features keep state in this same blob, so a naive overwrite here
 * would quietly delete them.
 */
export function writeConnectSettings(
  preferences: unknown,
  patch: DeepPartial<ConnectSettings>,
): Record<string, unknown> {
  const root = isRecord(preferences) ? { ...preferences } : {};
  const current = readConnectSettings(root);

  root.connect = {
    appearance: mergeSection(current.appearance, patch.appearance),
    messaging: mergeSection(current.messaging, patch.messaging),
    calls: mergeSection(current.calls, patch.calls),
    privacy: mergeSection(current.privacy, patch.privacy),
  };
  return root;
}

// ── internals ────────────────────────────────────────────────────────────────

export type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Copy only keys that exist on the default and match its primitive type. An
 * unknown key, or a string where a boolean belongs, is dropped — which is what
 * keeps a hand-edited or stale `preferences` blob from producing an invalid
 * settings object downstream.
 */
function mergeSection<T extends Record<string, unknown>>(defaults: T, incoming: unknown): T {
  if (!isRecord(incoming)) return { ...defaults };
  const out = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const value = incoming[key as string];
    if (value === undefined) continue;
    if (typeof value === typeof defaults[key]) {
      out[key] = value as T[keyof T];
    }
  }
  return out;
}

export const DENSITY_VALUES: DensityPreference[] = ["comfortable", "compact"];
