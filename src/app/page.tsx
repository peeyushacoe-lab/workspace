import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";

export default async function RootPage() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (user) redirect("/inbox");
  redirect("/login");
}
