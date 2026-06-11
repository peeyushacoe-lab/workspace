// All API calls go through the Electron IPC bridge (no CORS, no cookie issues)

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  method: string,
  path: string,
  opts: { body?: Record<string, unknown>; form?: Record<string, string> } = {},
): Promise<T> {
  const res = await window.nexus.api.request<T>({ method, path, ...opts });
  if (!res.ok) {
    const msg = (res.data as { error?: string })?.error ?? res.error ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, msg);
  }
  return res.data;
}

export const api = {
  get:    <T>(path: string) => request<T>("GET", path),
  post:   <T>(path: string, body: Record<string, unknown>) => request<T>("POST", path, { body }),
  put:    <T>(path: string, body: Record<string, unknown>) => request<T>("PUT", path, { body }),
  del:    <T>(path: string) => request<T>("DELETE", path),
  form:   <T>(path: string, form: Record<string, string>) => request<T>("POST", path, { form }),
};

// ── Auth ──────────────────────────────────────────────────────────────────────

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  mfaEnabled?: boolean;
  organizationId?: string | null;
};

export async function login(email: string, password: string): Promise<{ redirectTo: string }> {
  return api.form("/api/auth/login", { email, password, next: "/inbox" });
}

export async function logout(): Promise<void> {
  await window.nexus.api.logout();
}

export async function getMe(): Promise<SessionUser> {
  return api.get<SessionUser>("/api/auth/me");
}

// ── Inbox ─────────────────────────────────────────────────────────────────────

export type Thread = {
  id: string;
  subject: string;
  mailbox: string;
  mailboxName?: string | null;
  lastMessage: {
    from: string;
    snippet: string;
    receivedAt: string;
  } | null;
  unreadCount: number;
  isStarred: boolean;
  isArchived: boolean;
  isTrashed?: boolean;
  isSnoozed?: boolean;
  priority: string;
  folderId?: string | null;
  labels?: string[];
  createdAt: string;
};

export type InboxMessage = {
  id: string;
  from: string;
  to: string;
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  isRead: boolean;
  receivedAt: string;
  attachments: Array<{
    id: string;
    filename: string;
    storageUrl: string;
    mimeType: string | null;
    size: number | string;
  }>;
};

export type ThreadDetail = {
  id: string;
  subject: string;
  isStarred: boolean;
  isArchived: boolean;
  isTrashed: boolean;
  priority: string;
  folderId?: string | null;
  folder?: { id: string; name: string; color: string | null } | null;
  mailbox: { id: string; email: string };
  messages: InboxMessage[];
};

export type MailFolder = {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  mailboxId: string | null;
  _count?: { threads: number };
};

export type WorkspaceMember = {
  id: string;
  email: string;
  fullName: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  jobTitle: string | null;
  department: string | null;
  statusEmoji: string | null;
  statusMessage: string | null;
};

export type Signature = {
  id: string;
  fullName: string;
  title: string;
  phone: string | null;
  linkedinUrl: string | null;
  website: string | null;
  html: string | null;
  plainText: string | null;
};

export async function getInbox(opts?: { q?: string; cursor?: string }): Promise<Thread[]> {
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.cursor) params.set("cursor", opts.cursor);
  const qs = params.toString();
  return api.get<Thread[]>(`/api/inbox${qs ? `?${qs}` : ""}`);
}

export async function getThread(id: string): Promise<ThreadDetail> {
  return api.get<ThreadDetail>(`/api/inbox/${id}`);
}

export async function updateThread(id: string, patch: {
  markRead?: boolean;
  isStarred?: boolean;
  isArchived?: boolean;
  isTrashed?: boolean;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  folderId?: string | null;
}): Promise<void> {
  await request("PUT", `/api/inbox/${id}`, { body: patch as Record<string, unknown> });
}

export async function getUnreadCount(): Promise<number> {
  const res = await api.get<{ count: number }>("/api/inbox/unread-count");
  return res.count;
}

export async function composeEmail(payload: {
  to: string;
  subject: string;
  body: string;
  htmlBody?: string;
  cc?: string[];
  bcc?: string[];
  replyToThreadId?: string;
  signatureId?: string;
}): Promise<{ ok: boolean; delivery: "internal" | "external" }> {
  return api.post<{ ok: boolean; delivery: "internal" | "external" }>("/api/inbox/compose", payload as Record<string, unknown>);
}

export async function getFolders(): Promise<MailFolder[]> {
  return api.get<MailFolder[]>("/api/inbox/folders");
}

export async function createFolder(data: { name: string; color?: string; icon?: string }): Promise<MailFolder> {
  return api.post<MailFolder>("/api/inbox/folders", data as Record<string, unknown>);
}

export async function getWorkspaceMembers(): Promise<WorkspaceMember[]> {
  return api.get<WorkspaceMember[]>("/api/workspace/members");
}

export async function getSignature(): Promise<Signature | null> {
  const arr = await api.get<Signature[]>("/api/signatures");
  return arr[0] ?? null;
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export type Channel = {
  id: string;
  name: string;
  description?: string | null;
  type: string;            // CHANNEL | DM | GROUP
  isPrivate?: boolean;
  unreadCount: number;
  memberCount?: number;
  lastMessage?: { body: string; createdAt: string } | null;
  members?: Array<{ userId: string; role: string }>;
  updatedAt?: string;
};

export type ChatMessage = {
  id: string;
  channelId: string;
  content: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  isUrgent: boolean;
  parentId?: string | null;
  attachmentUrl?: string | null;
  attachmentMime?: string | null;
  attachmentName?: string | null;
  user: { id: string; fullName: string; avatarUrl?: string | null; role: string };
  reactions: Array<{ emoji: string; user: { id: string; fullName: string } }>;
  replies?: Array<{ id: string }>;
};

export async function getChannels(): Promise<Channel[]> {
  const raw = await api.get<Array<Channel & { members?: Array<{ userId: string }> }>>("/api/chat/channels");
  return raw.map(ch => ({ ...ch, memberCount: ch.members?.length ?? 0 }));
}

export async function createChannel(data: {
  name: string;
  description?: string;
  type?: "CHANNEL" | "DM" | "GROUP";
  isPrivate?: boolean;
  memberIds?: string[];
}): Promise<Channel> {
  return api.post<Channel>("/api/chat/channels", data as Record<string, unknown>);
}

export async function getMessages(channelId: string, opts?: { parentId?: string; before?: string }): Promise<ChatMessage[]> {
  const params = new URLSearchParams();
  if (opts?.parentId) params.set("parentId", opts.parentId);
  if (opts?.before) params.set("before", opts.before);
  const qs = params.toString();
  return api.get<ChatMessage[]>(`/api/chat/channels/${channelId}/messages${qs ? `?${qs}` : ""}`);
}

export async function sendMessage(channelId: string, payload: {
  content: string;
  parentId?: string;
  isUrgent?: boolean;
  attachmentUrl?: string;
  attachmentMime?: string;
  attachmentName?: string;
}): Promise<ChatMessage> {
  return api.post<ChatMessage>(`/api/chat/channels/${channelId}/messages`, payload as Record<string, unknown>);
}

export async function editMessage(messageId: string, content: string): Promise<ChatMessage> {
  return api.put<ChatMessage>(`/api/chat/messages/${messageId}`, { content });
}

export async function deleteMessage(messageId: string): Promise<void> {
  await api.del<{ ok: boolean }>(`/api/chat/messages/${messageId}`);
}

export async function toggleReaction(messageId: string, emoji: string): Promise<{ reactions: ChatMessage["reactions"] }> {
  return api.post<{ reactions: ChatMessage["reactions"] }>(`/api/chat/messages/${messageId}/reactions`, { emoji });
}

export async function getChannelMembers(channelId: string): Promise<Array<{ userId: string; role: string; user: WorkspaceMember }>> {
  return api.get<Array<{ userId: string; role: string; user: WorkspaceMember }>>(`/api/chat/channels/${channelId}/members`);
}

export async function markChannelRead(channelId: string): Promise<void> {
  await request("POST", `/api/chat/channels/${channelId}/read`, { body: {} });
}

export async function sendTyping(channelId: string): Promise<void> {
  await request("POST", `/api/chat/channels/${channelId}/typing`, { body: {} });
}

// ── Calendar ──────────────────────────────────────────────────────────────────

export type CalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  color?: string | null;
  meetingUrl?: string | null;
  isRecurring: boolean;
  organizer?: { id: string; fullName: string } | null;
  attendees?: Array<{ userId?: string | null; email: string; name?: string | null }>;
};

export async function getCalendarEvents(from: string, to: string): Promise<CalendarEvent[]> {
  return api.get<CalendarEvent[]>(`/api/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

export async function createCalendarEvent(data: {
  title: string;
  startAt: string;
  endAt: string;
  description?: string;
  location?: string;
  color?: string;
  meetingUrl?: string;
  allDay?: boolean;
  attendeeIds?: string[];
}): Promise<CalendarEvent> {
  return api.post<CalendarEvent>("/api/calendar/events", data as Record<string, unknown>);
}

export async function updateCalendarEvent(id: string, data: Partial<{
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  color: string;
  meetingUrl: string | null;
  status: "TENTATIVE" | "CONFIRMED" | "CANCELLED";
}>): Promise<CalendarEvent> {
  return api.put<CalendarEvent>(`/api/calendar/events/${id}`, data as Record<string, unknown>);
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  await api.del<void>(`/api/calendar/events/${id}`);
}

export async function getCalendarEvent(id: string): Promise<CalendarEvent & {
  attendees?: Array<{ id: string; userId?: string | null; email: string; name?: string | null; status: string; user?: { id: string; fullName: string } | null }>;
  organizer?: { id: string; fullName: string } | null;
}> {
  return api.get(`/api/calendar/events/${id}`);
}

export async function rsvpEvent(eventId: string, status: "ACCEPTED" | "DECLINED" | "MAYBE"): Promise<void> {
  await api.post(`/api/calendar/events/${eventId}/rsvp`, { status });
}

// ── Drive ─────────────────────────────────────────────────────────────────────

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string | null;
  size: string | number;
  isStarred: boolean;
  isTrashed: boolean;
  folderId?: string | null;
  url?: string | null;
  updatedAt: string;
  createdAt: string;
};

export type DriveFolder = {
  id: string;
  name: string;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getDriveFiles(folderId?: string | null, query?: string): Promise<DriveFile[]> {
  const params = new URLSearchParams();
  if (folderId) params.set("folderId", folderId);
  if (query) params.set("q", query);
  if (!folderId && !query) params.set("all", "true");
  const qs = params.toString();
  return api.get<DriveFile[]>(`/api/drive/files${qs ? `?${qs}` : ""}`);
}

export async function getDriveFolders(parentId?: string | null): Promise<DriveFolder[]> {
  const params = new URLSearchParams();
  if (parentId) params.set("parentId", parentId);
  return api.get<DriveFolder[]>(`/api/drive/folders?${params.toString()}`);
}

export async function createDriveFolder(name: string, parentId?: string | null): Promise<DriveFolder> {
  return api.post<DriveFolder>("/api/drive/folders", { name, parentId: parentId ?? null });
}

export async function updateDriveFile(id: string, data: Partial<{ name: string; isStarred: boolean; isTrashed: boolean; folderId: string | null }>): Promise<DriveFile> {
  return api.put<DriveFile>(`/api/drive/files/${id}`, data as Record<string, unknown>);
}

export async function deleteDriveFile(id: string): Promise<void> {
  await api.del<void>(`/api/drive/files/${id}`);
}

export async function uploadDriveFile(file: File, folderId?: string | null, onProgress?: (pct: number) => void): Promise<DriveFile> {
  // Read file into base64 and send through IPC. Electron can't FormData over IPC, so
  // we serialize to JSON and let the main process rebuild a multipart body via net.fetch.
  // For now, fall back to letting the renderer use fetch directly via IPC's request.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1] ?? "";
        onProgress?.(50);
        const result = await window.nexus.api.request<DriveFile>({
          method: "POST",
          path: "/api/drive/upload-base64",
          body: {
            name: file.name,
            type: file.type || "application/octet-stream",
            size: file.size,
            base64,
            folderId: folderId ?? null,
          } as Record<string, unknown>,
          timeout: 120_000,
        });
        onProgress?.(100);
        if (!result.ok) reject(new Error((result.data as { error?: string })?.error ?? `Upload failed (HTTP ${result.status})`));
        else resolve(result.data);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// ── Meet (Video calls) ───────────────────────────────────────────────────────

export type Meeting = {
  id: string;
  title: string;
  description?: string | null;
  roomName: string;
  status: "SCHEDULED" | "LIVE" | "ENDED";
  scheduledAt?: string | null;
  organizer: { id: string; fullName: string; avatarUrl?: string | null };
  participants: Array<{ id: string; userId: string; role: string; user: { id: string; fullName: string; avatarUrl?: string | null } }>;
  passcode?: string | null;
  createdAt: string;
};

export async function getMeetings(): Promise<Meeting[]> {
  return api.get<Meeting[]>("/api/meet");
}

export async function createMeeting(data: {
  title: string;
  description?: string;
  scheduledAt?: string;
  isInstant?: boolean;
  participantIds?: string[];
  passcode?: string;
}): Promise<Meeting> {
  return api.post<Meeting>("/api/meet", data as Record<string, unknown>);
}

export async function getMeeting(id: string): Promise<Meeting> {
  return api.get<Meeting>(`/api/meet/${id}`);
}

export async function joinMeeting(id: string): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>(`/api/meet/${id}/join`, {});
}

export async function sendMeetSignal(payload: {
  roomId: string;
  type: "offer" | "answer" | "ice-candidate" | "peer-joined" | "peer-left";
  payload: unknown;
  targetPeerId?: string;
}): Promise<void> {
  await api.post(`/api/meet/signal`, payload as unknown as Record<string, unknown>);
}

// ── Global search ────────────────────────────────────────────────────────────

export type SearchResults = {
  mail: Array<{ id: string; subject: string; updatedAt?: string; priority?: string; url?: string }>;
  chat: Array<{ id: string; content: string; channelId: string; channelName: string; sender: string; createdAt?: string }>;
  people: Array<{ id: string; fullName: string; email: string; role: string; avatarUrl?: string | null }>;
};

export async function globalSearch(q: string): Promise<SearchResults> {
  return api.get<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`);
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export type Note = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  color?: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getNotes(query?: string): Promise<Note[]> {
  const qs = query ? `?q=${encodeURIComponent(query)}` : "";
  return api.get<Note[]>(`/api/notes${qs}`);
}

export async function createNote(data: { title?: string; content?: string; color?: string }): Promise<Note> {
  return api.post<Note>("/api/notes", data as Record<string, unknown>);
}

export async function updateNote(id: string, data: { title?: string; content?: string; pinned?: boolean; color?: string | null }): Promise<Note> {
  return api.put<Note>(`/api/notes/${id}`, data as Record<string, unknown>);
}

export async function deleteNote(id: string): Promise<void> {
  await api.del<{ ok: boolean }>(`/api/notes/${id}`);
}

// ── AI ────────────────────────────────────────────────────────────────────────

export async function aiChat(
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
): Promise<{ reply: string }> {
  return api.post<{ reply: string }>("/api/ai/chat", { message, history: history as unknown as Record<string, unknown>[] } as unknown as Record<string, unknown>);
}
