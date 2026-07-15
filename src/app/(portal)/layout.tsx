import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { getUserPermEpoch } from "@/lib/rbac/session-perms";
import { Shell } from "@/components/Shell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustResetPassword) redirect("/reset-password");

  // RBAC (RFC-001, PR6): if the cookie's permEpoch is behind the DB, the user's
  // roles/permissions changed since login. Bounce through the refresh route (which
  // can set cookies — a Server Component can't) to re-issue the cookie, then return
  // here. Missing perms/epoch (cookies issued before rollout) also triggers a refresh.
  const dbEpoch = await getUserPermEpoch(user.id);
  const cookieEpoch = user.permEpoch;
  const needsRefresh = cookieEpoch === undefined || cookieEpoch !== dbEpoch;

  if (needsRefresh) {
    const pathname = (await headers()).get("x-pathname") ?? "/inbox";
    redirect(`/api/session/refresh?next=${encodeURIComponent(pathname)}`);
  }

  return <Shell currentUser={user}>{children}</Shell>;
}
