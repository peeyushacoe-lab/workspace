import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { ChatView } from "@/components/ChatView";

/**
 * Chat inside Connect.
 *
 * Mounts the existing Nexus chat engine rather than forking it. Connect and
 * Nexus are one deployment over one database, so a second messaging
 * implementation would mean two sets of unread counts, two socket handlers and
 * two bugs for every fix. Phase 2 reworks this view's presentation in place;
 * the engine underneath stays exactly the one /chat uses.
 */
export default async function ConnectChatPage() {
  const user = getSessionUserFromCookieStore(await cookies());
  // The layout redirects unauthenticated requests, so `user` is set by here.
  return <ChatView currentUserId={user!.id} userRole={user!.role} />;
}
