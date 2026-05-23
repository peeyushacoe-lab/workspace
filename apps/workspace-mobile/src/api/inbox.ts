import { apiRequest } from "./client";

export interface Thread {
  id: string; subject: string; mailbox: string;
  lastMessage: { from: string; snippet: string; receivedAt: string } | null;
  unreadCount: number; isStarred: boolean; isArchived: boolean;
  isTrashed: boolean; priority: string; createdAt: string; updatedAt: string;
}

export interface Message {
  id: string; from: string; to: string; subject: string;
  textBody?: string | null; htmlBody?: string | null;
  isRead: boolean; receivedAt: string;
}

export interface ThreadDetail {
  id: string; subject: string;
  messages: Message[];
  mailbox: { id: string; email: string };
}

export interface MobileProfile {
  id: string; email: string; fullName: string; role: string; customRole?: string | null;
  displayName?: string | null; bio?: string | null; jobTitle?: string | null;
  avatarUrl?: string | null; statusEmoji?: string | null; statusMessage?: string | null;
}

export const inboxApi = {
  list: (params?: { q?: string; cursor?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return apiRequest<Thread[]>(`/api/mobile/inbox${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => apiRequest<ThreadDetail>(`/api/mobile/inbox/${id}`),
  update: (id: string, data: Partial<{ isStarred: boolean; isArchived: boolean; isTrashed: boolean }>) =>
    apiRequest(`/api/mobile/inbox/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  compose: (data: { to: string; subject: string; body: string; replyToThreadId?: string }) =>
    apiRequest("/api/mobile/compose", { method: "POST", body: JSON.stringify(data) }),
  unreadCount: () => apiRequest<{ count: number }>("/api/inbox/unread-count"),
};

export const profileApi = {
  get: () => apiRequest<MobileProfile>("/api/mobile/profile"),
  update: (data: Partial<MobileProfile> & { currentPassword?: string; newPassword?: string }) =>
    apiRequest<MobileProfile>("/api/mobile/profile", { method: "PUT", body: JSON.stringify(data) }),
};
