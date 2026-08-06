import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { getUserPermEpoch } from "@/lib/rbac/session-perms";
import { ConnectShell } from "@/components/connect/ConnectShell";
import { hubUrl } from "@/lib/subdomains";

/**
 * Sage Connect route group.
 *
 * Same auth contract as the portal layout — one identity across both products,
 * including the RBAC cookie-epoch refresh, so a permission change revokes
 * Connect as fast as it revokes Nexus. Duplicated rather than shared because
 * the two layouts differ only in which shell they mount, and factoring that out
 * would couple the products' chrome for four lines of savings.
 */
export default async function ConnectLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustResetPassword) redirect("/reset-password");

  const dbEpoch = await getUserPermEpoch(user.id);
  const needsRefresh = user.permEpoch === undefined || user.permEpoch !== dbEpoch;
  if (needsRefresh) {
    const pathname = (await headers()).get("x-pathname") ?? "/connect";
    redirect(`/api/session/refresh?next=${encodeURIComponent(pathname)}`);
  }

  // Null on localhost, where there are no subdomains — the shell then omits the
  // "Open Nexus" link rather than rendering one that goes nowhere.
  const nexusHref = hubUrl("/inbox");

  return (
    <ConnectShell currentUser={user} nexusHref={nexusHref}>
      {children}
    </ConnectShell>
  );
}
