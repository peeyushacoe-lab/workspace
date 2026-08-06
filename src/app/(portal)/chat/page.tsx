import { redirect } from "next/navigation";

/**
 * Chat now lives in Sage Connect, not the Nexus hub — Connect is the
 * real-time communication product; Nexus is where work is stored and
 * managed. This route stays alive purely as a landing pad: every existing
 * link to "/chat" (sidebar bookmarks, notification emails sent before this
 * change, the command palette, search results, quick links) still resolves,
 * it just forwards straight through to the real destination.
 *
 * Query params are preserved so a deep link like "/chat?channel=abc" from an
 * old notification still opens the right conversation, at "/connect/chat".
 */
export default async function ChatRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value) && value[0]) qs.set(key, value[0]);
  }
  const suffix = qs.toString();
  redirect(`/connect/chat${suffix ? `?${suffix}` : ""}`);
}
