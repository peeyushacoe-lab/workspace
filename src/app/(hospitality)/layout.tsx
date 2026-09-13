import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { getUserPermEpoch } from "@/lib/rbac/session-perms";
import { getPortalHome } from "@/lib/auth";
import { isHospitalityOrgType } from "@/lib/hospitality/scope";
import { HospitalityShell } from "@/components/hospitality/shell/HospitalityShell";

export const metadata: Metadata = {
  title: { default: "Nexus Hospitality", template: "%s · Nexus Hospitality" },
  description: "Rooms, housekeeping, stock and team for your property.",
};

/**
 * Nexus Hospitality route group — its own product, not a section of the core
 * portal. Same identity contract as the portal layout (auth, forced reset, RBAC
 * cookie-epoch refresh), but it mounts HospitalityShell and only admits users
 * whose organisation is a hotel.
 */
export default async function HospitalityLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/hospitality");
  if (user.mustResetPassword) redirect("/reset-password");

  const dbEpoch = await getUserPermEpoch(user.id);
  const needsRefresh =
    user.permEpoch === undefined ||
    user.permEpoch !== dbEpoch ||
    (!!user.organizationId && user.orgType === undefined);
  if (needsRefresh) {
    const pathname = (await headers()).get("x-pathname") ?? "/hospitality";
    redirect(`/api/session/refresh?next=${encodeURIComponent(pathname)}`);
  }

  if (!isHospitalityOrgType(user.orgType)) redirect(getPortalHome(user.role, user.orgType));

  return <HospitalityShell currentUser={user}>{children}</HospitalityShell>;
}
