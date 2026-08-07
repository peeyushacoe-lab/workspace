import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { ConnectSettingsView } from "@/components/connect/ConnectSettingsView";

/**
 * Connect settings. No permission gate beyond being signed in — these are a
 * person's own preferences, and the API scopes every read and write to the
 * caller with no id parameter to tamper with.
 */
export default async function ConnectSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <ConnectSettingsView />;
}
