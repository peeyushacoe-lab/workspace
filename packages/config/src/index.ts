export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://cybersage-mail.vercel.app";

export const INTERNAL_DOMAIN = "cybersage.uk";

export const TOKEN_KEYS = {
  ACCESS:  "cs_access_token",
  REFRESH: "cs_refresh_token",
  USER:    "cs_user",
} as const;

export const QUERY_KEYS = {
  INBOX:        ["inbox"],
  THREAD:       (id: string) => ["thread", id],
  CHANNELS:     ["channels"],
  MESSAGES:     (id: string) => ["messages", id],
  DRIVE:        (folderId?: string) => ["drive", folderId ?? "root"],
  CALENDAR:     ["calendar"],
  NOTIFICATIONS:["notifications"],
  PROFILE:      ["profile"],
} as const;
