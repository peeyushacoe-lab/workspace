import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { MeetView } from "@/components/MeetView";

/**
 * Meetings inside Connect — the existing Jitsi-backed engine, same reasoning as
 * Connect chat. Meeting rooms themselves still live at /meet/[roomId] so a link
 * shared into an email or a channel resolves the same way for everyone.
 */
export default async function ConnectMeetingsPage() {
  const user = getSessionUserFromCookieStore(await cookies());
  return <MeetView currentUserId={user!.id} currentUserName={user!.fullName} />;
}
