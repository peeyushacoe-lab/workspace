/**
 * Notification preference helpers
 *
 * Preferences are stored in user.preferences JSON:
 *   preferences.notifications.matrix  — NotifMatrix (type → { inApp, push, email })
 *   preferences.notifications.quietHoursEnabled  — boolean
 *   preferences.notifications.quietStart          — "HH:MM"
 *   preferences.notifications.quietEnd            — "HH:MM"
 *
 * Notification types (must match SettingsView.tsx NOTIF_ROWS keys):
 *   newMail | chatMentions | calendarReminders | meetingInvite |
 *   taskAssigned | fileShared | socAlerts | dlpAlerts
 */

export type NotifType =
  | "newMail"
  | "chatMentions"
  | "calendarReminders"
  | "meetingInvite"
  | "taskAssigned"
  | "fileShared"
  | "socAlerts"
  | "dlpAlerts";

export type NotifChannel = "inApp" | "push" | "email";

interface NotifMatrix {
  [key: string]: { inApp: boolean; push: boolean; email: boolean } | undefined;
}

interface NotifPrefs {
  matrix?: NotifMatrix;
  quietHoursEnabled?: boolean;
  quietStart?: string; // "HH:MM"
  quietEnd?: string;   // "HH:MM"
}

// Default on/off for each type × channel (mirrors SettingsView.tsx DEFAULT_MATRIX)
const DEFAULTS: Record<NotifType, { inApp: boolean; push: boolean; email: boolean }> = {
  newMail:           { inApp: true,  push: true,  email: false },
  chatMentions:      { inApp: true,  push: true,  email: false },
  calendarReminders: { inApp: true,  push: true,  email: false },
  meetingInvite:     { inApp: true,  push: true,  email: false },
  taskAssigned:      { inApp: true,  push: false, email: false },
  fileShared:        { inApp: true,  push: false, email: false },
  socAlerts:         { inApp: true,  push: true,  email: true  },
  dlpAlerts:         { inApp: true,  push: true,  email: true  },
};

/** Check if the current server-side wall-clock time is inside quiet hours. */
function isQuietHours(prefs: NotifPrefs): boolean {
  if (!prefs.quietHoursEnabled) return false;
  const start = prefs.quietStart ?? "22:00";
  const end   = prefs.quietEnd   ?? "08:00";

  const now = new Date();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const nowMins   = now.getUTCHours() * 60 + now.getUTCMinutes();
  const startMins = (sh ?? 22) * 60 + (sm ?? 0);
  const endMins   = (eh ?? 8)  * 60 + (em ?? 0);

  if (startMins <= endMins) {
    // Same-day window e.g. 08:00-20:00
    return nowMins >= startMins && nowMins < endMins;
  } else {
    // Overnight window e.g. 22:00-08:00
    return nowMins >= startMins || nowMins < endMins;
  }
}

/**
 * Returns true if a notification of `type` should be delivered via `channel`
 * for the given user preferences JSON blob.
 *
 * @param preferences  — raw value of user.preferences from Prisma (may be null/undefined)
 * @param type         — notification type key
 * @param channel      — "inApp" | "push" | "email"
 */
export function shouldNotify(
  preferences: Record<string, unknown> | null | undefined,
  type: NotifType,
  channel: NotifChannel,
): boolean {
  const notifPrefs = (preferences?.notifications ?? {}) as NotifPrefs;
  const matrix     = notifPrefs.matrix ?? {};
  const row        = matrix[type] ?? DEFAULTS[type];
  const enabled    = row[channel];

  if (!enabled) return false;

  // Suppress push/email (but not in-app) during quiet hours
  if (channel !== "inApp" && isQuietHours(notifPrefs)) return false;

  return true;
}
