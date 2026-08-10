import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getHomeData } from "@/lib/home";
import { HomeView } from "@/components/home/HomeView";

/**
 * /home — Nexus Home, the first screen after login.
 *
 * A Server Component rather than a client page that fetches on mount: this is the
 * landing page for every session, and a spinner-then-content flip is the worst
 * possible first impression of the product. The queries run during SSR and the
 * page arrives populated.
 *
 * `force-dynamic` because every card is per-user and time-sensitive. Without it
 * Next would try to statically optimise the route and serve one user's inbox
 * counts to the next.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Home · Nexus" };

export default async function HomePage() {
  const user = await getCurrentUser();
  // The portal layout already redirects unauthenticated users; this is a
  // type-narrowing guard, not a second gate.
  if (!user) redirect("/login");

  const data = await getHomeData(user);

  return <HomeView initial={data} />;
}
