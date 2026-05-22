import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { AIAssistant } from "@/components/AIAssistant";

export default async function AIPage() {
  const user = getSessionUserFromCookieStore(await cookies());
  return (
    <div className="p-6">
      <AIAssistant currentUserId={user!.id} />
    </div>
  );
}
