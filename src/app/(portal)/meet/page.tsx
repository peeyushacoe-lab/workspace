import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { MeetView } from "@/components/MeetView";

export default async function MeetPage() {
  const user = getSessionUserFromCookieStore(await cookies());
  return (
    <div className="h-full">
      <MeetView currentUserId={user!.id} currentUserName={user!.fullName} />
    </div>
  );
}
