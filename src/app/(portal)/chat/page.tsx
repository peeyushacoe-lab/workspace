import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { ChatView } from "@/components/ChatView";

export default async function ChatPage() {
  const user = getSessionUserFromCookieStore(await cookies());
  return <ChatView currentUserId={user!.id} />;
}
