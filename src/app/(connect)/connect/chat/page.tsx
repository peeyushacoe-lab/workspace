import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { ChatView } from "@/components/ChatView";

/**
 * Chat inside Connect — one-to-one direct messages only.
 *
 * Groups live at /connect/groups and channels at /connect/channels. All three
 * mount the same engine with a different scope rather than forking it: Connect
 * and Nexus are one deployment over one database, so a second messaging
 * implementation would mean two sets of unread counts, two socket handlers and
 * two bugs for every fix.
 */
export default async function ConnectChatPage() {
  const user = getSessionUserFromCookieStore(await cookies());
  // The layout redirects unauthenticated requests, so `user` is set by here.
  return <ChatView currentUserId={user!.id} userRole={user!.role} scope="direct" />;
}
