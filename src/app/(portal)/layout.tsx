import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { getUserPermEpoch } from "@/lib/rbac/session-perms";
import { Shell } from "@/components/Shell";
import { HospitalityShell } from "@/components/hospitality/shell/HospitalityShell";
import { isHospitalityOrgType } from "@/lib/hospitality/scope";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustResetPassword) redirect("/reset-password");

  // RBAC (RFC-001, PR6): if the cookie's permEpoch is behind the DB, the user's
  // roles/permissions changed since login. Bounce through the refresh route (which
  // can set cookies — a Server Component can't) to re-issue the cookie, then return
  // here. Missing perms/epoch (cookies issued before rollout) also triggers a refresh.
  //
  // A cookie with no `orgType` key at all predates product types — refresh it too,
  // otherwise a hotel user signed in before that change keeps the core shell.
  const dbEpoch = await getUserPermEpoch(user.id);
  const cookieEpoch = user.permEpoch;
  const needsRefresh =
    cookieEpoch === undefined ||
    cookieEpoch !== dbEpoch ||
    (!!user.organizationId && user.orgType === undefined);

  if (needsRefresh) {
    const pathname = (await headers()).get("x-pathname") ?? "/home";
    redirect(`/api/session/refresh?next=${encodeURIComponent(pathname)}`);
  }

  // Hotel orgs never see the core shell. Mail, Meet, Calendar etc. render inside
  // the hospitality shell so the hotel workspace stays one product end to end.
  if (isHospitalityOrgType(user.orgType)) {
    return <HospitalityShell currentUser={user}>{children}</HospitalityShell>;
  }

  // Host drives the subdomain-aware shell. Read here (a Server Component) so
  // the correct sidebar is in the very first HTML — resolving it client-side
  // would flash the full workspace nav on docs./drive./meet. first.
  const host = (await headers()).get("host");

  return <Shell currentUser={user} host={host}>{children}</Shell>;
}
