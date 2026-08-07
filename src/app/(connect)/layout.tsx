import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { getUserPermEpoch } from "@/lib/rbac/session-perms";
import { ConnectShell } from "@/components/connect/ConnectShell";
import { ConnectSettingsProvider } from "@/components/connect/ConnectSettingsEffects";
import { hubUrl } from "@/lib/subdomains";
import type { Metadata } from "next";

/**
 * Connect's own identity in the browser chrome.
 *
 * Declared here rather than by dropping a favicon.ico into the route group,
 * because Connect and Nexus are one deployment: replacing the root icon would
 * relabel Nexus too. Scoping the metadata to this layout gives Connect its own
 * tab icon and title while /inbox keeps the Nexus mark.
 */
export const metadata: Metadata = {
  title: { default: "Sage Connect", template: "%s · Sage Connect" },
  description: "Chat, channels and meetings for the Cybersage workspace.",
  icons: {
    icon: [
      { url: "/connect/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/connect/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/connect/favicon.ico" },
    ],
    apple: [{ url: "/connect/apple-touch-icon.png", sizes: "180x180" }],
  },
  // Scoped to /connect, so installing from connect.cybersage.uk gives a
  // Connect app icon rather than Nexus's.
  manifest: "/connect/manifest.json",
};

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
    // The settings provider wraps the shell, not the page, so appearance
    // preferences apply once for the whole session instead of re-resolving
    // (and briefly flashing the wrong theme) on every navigation.
    <ConnectSettingsProvider>
      <ConnectShell currentUser={user} nexusHref={nexusHref}>
        {children}
      </ConnectShell>
    </ConnectSettingsProvider>
  );
}
