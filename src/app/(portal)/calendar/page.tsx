import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { CalendarView } from "@/components/CalendarView";

export default async function CalendarPage() {
  const user = getSessionUserFromCookieStore(await cookies());
  return (
    <div className="p-6">
      <CalendarView currentUserId={user!.id} />
    </div>
  );
}
