import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { AdminConsoleView } from "@/components/AdminConsoleView";

export default async function AdminPage() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (user?.role !== "ADMIN") redirect("/inbox");
  return (
    <div className="p-6">
      <AdminConsoleView currentUserId={user!.id} />
    </div>
  );
}
