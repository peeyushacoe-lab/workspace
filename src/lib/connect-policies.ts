import { prisma } from "@/lib/prisma";

/**
 * Organisation-wide Connect policies.
 *
 * Stored in the existing `Organization.settings` JSON column, so this needs no
 * migration — deliberately, because the alternative was blocking an admin
 * feature on a schema change.
 *
 * The rule from the settings work applies doubly here: **every policy in this
 * file is enforced server-side.** A policy an admin sets, believes, and tells
 * their auditor about, which turns out to be a UI-only suggestion, is worse
 * than no policy at all. So this file is short: it contains what can actually
 * be enforced today, and nothing aspirational.
 *
 * Meeting policies are the notable absence. Jitsi's behaviour is configured
 * client-side, so a "recording disabled" toggle here would be a request, not a
 * control — anyone reading the page source could ignore it. That needs a
 * self-hosted Jitsi with JWT-gated features before it can be honest.
 */

export type ConnectPolicies = {
  messaging: {
    /** Hard cap on message length, enforced on send and on edit. */
    maxMessageLength: number;
    /** Allow files and images to be attached to chat messages. */
    allowAttachments: boolean;
    /** Allow people to edit a message after sending it. */
    allowEditing: boolean;
    /** Allow people to delete their own messages. Workspace admins can always
     *  delete, for moderation — that is not governed by this. */
    allowDeleting: boolean;
    /** Allow the urgent flag, which bypasses notification preferences. */
    allowUrgent: boolean;
  };
  files: {
    /** Maximum chat/Drive upload size in megabytes. */
    maxUploadMb: number;
  };
  retention: {
    /**
     * Delete chat messages older than this many days. 0 means keep forever.
     * Messages under an active legal hold are never deleted regardless — the
     * retention job checks holds before it removes anything.
     */
    messageRetentionDays: number;
  };
};

export const DEFAULT_POLICIES: ConnectPolicies = {
  messaging: {
    // Matches the hard-coded limit the send route already applied, so turning
    // policies on changes nothing until someone deliberately changes a value.
    maxMessageLength: 10_000,
    allowAttachments: true,
    allowEditing: true,
    allowDeleting: true,
    allowUrgent: true,
  },
  files: {
    maxUploadMb: 100,
  },
  retention: {
    // Off by default. A retention policy that silently starts deleting a
    // company's history because it shipped with a default is a catastrophe,
    // not a feature.
    messageRetentionDays: 0,
  },
};

export const POLICY_BOUNDS = {
  maxMessageLength: { min: 280, max: 40_000 },
  maxUploadMb: { min: 1, max: 500 },
  messageRetentionDays: { min: 0, max: 3650 },
};

export function readPolicies(settings: unknown): ConnectPolicies {
  const root = isRecord(settings) ? settings : {};
  const stored = isRecord(root.connectPolicies) ? root.connectPolicies : {};
  return {
    messaging: merge(DEFAULT_POLICIES.messaging, stored.messaging),
    files: merge(DEFAULT_POLICIES.files, stored.files),
    retention: merge(DEFAULT_POLICIES.retention, stored.retention),
  };
}

/** Merge a patch into the org's settings blob, preserving everything else in
 *  it — `settings` is shared with feature flags and other subsystems. */
export function writePolicies(settings: unknown, patch: DeepPartial<ConnectPolicies>) {
  const root = isRecord(settings) ? { ...settings } : {};
  const current = readPolicies(root);
  root.connectPolicies = {
    messaging: merge(current.messaging, patch.messaging),
    files: merge(current.files, patch.files),
    retention: merge(current.retention, patch.retention),
  };
  return root;
}

/**
 * Policies for the org a user belongs to.
 *
 * Called on the hot send path, so it must never throw and must never be the
 * reason a message fails: any lookup problem falls back to defaults, which are
 * exactly the limits that applied before policies existed.
 */
export async function policiesForUser(userId: string): Promise<ConnectPolicies> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { organization: { select: { settings: true } } },
    });
    return readPolicies(user?.organization?.settings);
  } catch {
    return DEFAULT_POLICIES;
  }
}

// ── internals ────────────────────────────────────────────────────────────────

export type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Type-checked shallow merge — a stored value of the wrong type is ignored
 *  rather than allowed to produce an invalid policy object. */
function merge<T extends Record<string, unknown>>(defaults: T, incoming: unknown): T {
  if (!isRecord(incoming)) return { ...defaults };
  const out = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const value = incoming[key as string];
    if (value !== undefined && typeof value === typeof defaults[key]) {
      out[key] = value as T[keyof T];
    }
  }
  return out;
}

/** Clamp a number into its documented range. Used on write, so an out-of-range
 *  value can never be persisted rather than being rejected at read time. */
export function clampPolicyNumber(key: keyof typeof POLICY_BOUNDS, value: number): number {
  const { min, max } = POLICY_BOUNDS[key];
  if (!Number.isFinite(value)) return DEFAULT_POLICIES.messaging.maxMessageLength;
  return Math.min(max, Math.max(min, Math.round(value)));
}
