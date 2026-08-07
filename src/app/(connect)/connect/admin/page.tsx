import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/rbac/can";
import { ConnectAdminConsole } from "@/components/connect/ConnectAdminConsole";

/**
 * Connect Admin.
 *
 * The console that turns Connect from a messaging application into something
 * an organisation can actually run: who is in the workspace, what
 * conversations exist, and a record of every administrative action taken.
 *
 * Gated twice on purpose. Middleware gates the route from `routePermission`
 * (derived from CONNECT_NAV), and this checks again server-side before
 * rendering, because the middleware decision comes from the *cookie's*
 * permission list — which is correct until the moment someone's permissions
 * are revoked and their cookie hasn't caught up. The layout's epoch check
 * closes that window, but a console that can deactivate accounts should not
 * depend on another component's freshness guarantee for its own authorisation.
 */
export default async function ConnectAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!(await can(user.id, "org.manage"))) {
    // Not a 403 page: someone without admin has no business learning that this
    // console exists at this path.
    redirect("/connect");
  }

  return <ConnectAdminConsole currentUserId={user.id} />;
}
