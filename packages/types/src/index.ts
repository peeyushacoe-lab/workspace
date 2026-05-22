// ─── Auth ─────────────────────────────────────────────────────────────────────

export type UserRole =
  | "ADMIN" | "CEO" | "CISO"
  | "MANAGER" | "HR" | "FINANCE" | "LEGAL" | "IT"
  | "DEVELOPER" | "DESIGNER" | "MARKETING" | "SALES"
  | "SUPPORT" | "INTERN" | "VIEWER" | "AUDITOR";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  customRole?: string | null;
  avatarUrl?: string | null;
  mfaEnabled: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

// ─── Inbox ────────────────────────────────────────────────────────────────────

export type ThreadPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface InboxThread {
  id: string;
  subject: string;
  mailbox: string;
  mailboxName?: string;
  lastMessage: {
    from: string;
    snippet: string;
    receivedAt: string;
  } | null;
  unreadCount: number;
  isStarred: boolean;
  isArchived: boolean;
  isTrashed: boolean;
  priority: ThreadPriority;
  labels: string[];
  createdAt: string;
}

export interface InboxMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  textBody?: string | null;
  htmlBody?: string | null;
  isRead: boolean;
  receivedAt: string;
}

export interface InboxThreadDetail {
  id: string;
  subject: string;
  messages: InboxMessage[];
  mailbox: { id: string; email: string };
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatChannel {
  id: string;
  name: string;
  type: "DIRECT" | "GROUP" | "CHANNEL" | "ANNOUNCEMENT";
  description?: string | null;
  memberCount?: number;
  lastMessage?: { content: string; createdAt: string } | null;
  unreadCount?: number;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  content: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  createdAt: string;
  updatedAt?: string;
  reactions?: Record<string, string[]>;
  isPinned?: boolean;
}

// ─── Drive ────────────────────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  storageUrl?: string | null;
  folderId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DriveFolder {
  id: string;
  name: string;
  parentId?: string | null;
  createdAt: string;
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  startTime: string;
  endTime: string;
  location?: string | null;
  isAllDay: boolean;
  attendees?: string[];
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}
