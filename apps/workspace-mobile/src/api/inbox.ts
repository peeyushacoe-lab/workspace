import { apiRequest } from "./client";

export interface Thread {
  id: string; subject: string; mailbox: string;
  lastMessage: { from: string; snippet: string; receivedAt: string } | null;
  unreadCount: number; isStarred: boolean; isArchived: boolean;
  isTrashed: boolean; priority: string; createdAt: string;
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

export const inboxApi = {
  list: (params?: { q?: string; cursor?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return apiRequest<Thread[]>(`/api/inbox${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => apiRequest<ThreadDetail>(`/api/inbox/${id}`),
  update: (id: string, data: Partial<{ markRead: boolean; isStarred: boolean; isArchived: boolean; isTrashed: boolean; priority: string }>) =>
    apiRequest(`/api/inbox/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  compose: (data: { to: string; subject: string; body: string; signatureId?: string }) =>
    apiRequest("/api/inbox/compose", { method: "POST", body: JSON.stringify(data) }),
  unreadCount: () => apiRequest<{ count: number }>("/api/inbox/unread-count"),
};
