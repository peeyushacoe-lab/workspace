import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { ChatView } from "@/components/ChatView";

/**
 * Group conversations — the same engine as Chat, scoped to GROUP channels.
 *
 * Kept a separate destination rather than a third section stacked inside Chat:
 * a group is a different social object from a DM, and stacking them meant the
 * list you use most sat below whatever else happened to be above it.
 */
export default async function ConnectGroupsPage() {
  const user = getSessionUserFromCookieStore(await cookies());
  return <ChatView currentUserId={user!.id} userRole={user!.role} scope="group" />;
}
