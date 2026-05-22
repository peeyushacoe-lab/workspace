import { EventEmitter } from "events";

// ---------------------------------------------------------------------------
// Workspace Event Map — every domain action that other parts of the system
// (workers, Sentinel integration, analytics, audit) can subscribe to.
// ---------------------------------------------------------------------------

export type WorkspaceEventMap = {
  // Mail
  MAIL_SENT: {
    logId: string;
    campaignId?: string;
    recipientEmail: string;
    subject: string;
    actorId: string;
    fromEmail: string;
  };
  MAIL_RECEIVED: {
    threadId: string;
    messageId: string;
    mailboxId: string;
    from: string;
    subject: string;
  };
  MAIL_ARCHIVED: { threadId: string; actorId: string };
  MAIL_DELETED: { threadId: string; actorId: string };

  // Files
  FILE_UPLOADED: {
    fileId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    actorId: string;
    folderId?: string;
  };
  FILE_DOWNLOADED: { fileId: string; fileName: string; actorId: string };
  FILE_DELETED: { fileId: string; fileName: string; actorId: string };
  FILE_SHARED: {
    fileId: string;
    fileName: string;
    actorId: string;
    role: string;
    email?: string;
    createLink: boolean;
  };
  FILE_SCAN_COMPLETE: {
    fileId: string;
    fileName: string;
    threatDetected: boolean;
    reason?: string;
  };

  // Chat
  CHAT_MESSAGE_CREATED: {
    channelId: string;
    messageId: string;
    actorId: string;
    hasAttachment: boolean;
    content: string;
  };
  CHAT_MESSAGE_DELETED: { channelId: string; messageId: string; actorId: string };

  // Users
  USER_LOGIN: {
    userId: string;
    email: string;
    role: string;
    ipAddress?: string;
    success: boolean;
    userAgent?: string;
  };
  USER_CREATED: { userId: string; email: string; role: string; actorId: string };
  USER_UPDATED: { userId: string; actorId: string; fields: string[] };
  USER_DELETED: { userId: string; email: string; actorId: string };
  USER_PASSWORD_RESET: { userId: string; email: string };
  USER_MFA_ENABLED: { userId: string };
  USER_MFA_DISABLED: { userId: string; actorId: string };

  // Calendar
  CALENDAR_EVENT_CREATED: {
    eventId: string;
    title: string;
    actorId: string;
    startAt: string;
    attendeeCount: number;
  };
  CALENDAR_EVENT_UPDATED: { eventId: string; title: string; actorId: string };
  CALENDAR_EVENT_DELETED: { eventId: string; actorId: string };
  CALENDAR_RSVP: { eventId: string; userId: string; status: string };

  // Notes / Docs
  NOTE_CREATED: { noteId: string; title: string; actorId: string; isDoc: boolean };
  NOTE_UPDATED: { noteId: string; actorId: string };
  NOTE_DELETED: { noteId: string; actorId: string };

  // Drive
  FOLDER_CREATED: { folderId: string; name: string; actorId: string };
  FOLDER_DELETED: { folderId: string; actorId: string };

  // AI
  AI_INTERACTION: {
    actorId: string;
    type: string;
    model?: string;
    tokensUsed?: number;
    latencyMs?: number;
  };

  // Security (Sentinel surface)
  SECURITY_THREAT_DETECTED: {
    targetType: "email" | "file" | "chat" | "login";
    targetId: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    reason: string;
    actorId?: string;
  };
};

export type WorkspaceEventKey = keyof WorkspaceEventMap;

// ---------------------------------------------------------------------------
// Typed emitter — enforces payload shape at call sites
// ---------------------------------------------------------------------------

class WorkspaceEventEmitter extends EventEmitter {
  emit<K extends WorkspaceEventKey>(event: K, payload: WorkspaceEventMap[K]): boolean {
    return super.emit(event, payload);
  }

  on<K extends WorkspaceEventKey>(
    event: K,
    listener: (payload: WorkspaceEventMap[K]) => void,
  ): this {
    return super.on(event, listener);
  }

  off<K extends WorkspaceEventKey>(
    event: K,
    listener: (payload: WorkspaceEventMap[K]) => void,
  ): this {
    return super.off(event, listener);
  }

  once<K extends WorkspaceEventKey>(
    event: K,
    listener: (payload: WorkspaceEventMap[K]) => void,
  ): this {
    return super.once(event, listener);
  }
}

// Singleton — survive Next.js hot-reload in dev
const g = global as unknown as { __workspaceEvents?: WorkspaceEventEmitter };
export const workspaceEvents: WorkspaceEventEmitter =
  g.__workspaceEvents ?? new WorkspaceEventEmitter();

workspaceEvents.setMaxListeners(100);

if (process.env.NODE_ENV !== "production") {
  g.__workspaceEvents = workspaceEvents;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Emit a workspace event. Always fire-and-forget — never blocks the request
 * path. Errors in listeners are caught and logged to avoid request failures.
 */
export function emitEvent<K extends WorkspaceEventKey>(
  event: K,
  payload: WorkspaceEventMap[K],
): void {
  setImmediate(() => {
    try {
      workspaceEvents.emit(event, payload);
    } catch (err) {
      console.error(`[events] Unhandled error in listener for "${event}":`, err);
    }
  });
}

/**
 * Subscribe to a workspace event. Returns an unsubscribe function.
 */
export function onEvent<K extends WorkspaceEventKey>(
  event: K,
  listener: (payload: WorkspaceEventMap[K]) => void,
): () => void {
  workspaceEvents.on(event, listener);
  return () => workspaceEvents.off(event, listener);
}
