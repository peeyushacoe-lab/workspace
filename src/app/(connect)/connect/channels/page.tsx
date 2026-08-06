import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { ChatView } from "@/components/ChatView";

/**
 * Channels — open, topic-based rooms, scoped to CHANNEL conversations.
 *
 * Previously a "coming soon" placeholder while channels were actually reachable
 * as one section inside Chat: the sidebar advertised a destination that existed
 * somewhere else. This is now the real page, and Chat no longer lists channels.
 *
 * Threaded posts (the original phase-4 plan) remain a presentation change on
 * top of this — ChatMessage.parentId already backs threads, and the thread
 * panel already works here.
 */
export default async function ConnectChannelsPage() {
  const user = getSessionUserFromCookieStore(await cookies());
  return <ChatView currentUserId={user!.id} userRole={user!.role} scope="channel" />;
}
