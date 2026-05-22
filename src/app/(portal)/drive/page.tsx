import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { DriveView } from "@/components/DriveView";

export default async function DrivePage() {
  const user = getSessionUserFromCookieStore(await cookies());
  return (
    <div className="p-6">
      <DriveView currentUserId={user!.id} />
    </div>
  );
}
