import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";

export default async function RootPage() {
  const user = getSessionUserFromCookieStore(await cookies());
  // Home, not Inbox: Nexus is a workspace, and landing every session in the mail
  // client framed the whole product as an email app. Home is also the only
  // surface every role can reach, so this redirect can never 403.
  if (user) redirect("/home");
  redirect("/login");
}
