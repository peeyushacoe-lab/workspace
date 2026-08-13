import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { fetchLinkPreview } from "@/lib/chat/link-preview";

/**
 * GET /api/chat/link-preview?url=…
 *
 * Unfurls a link for the composer and the message list.
 *
 * Authenticated *and* rate limited, even though the response is only OG
 * metadata: this endpoint makes the server fetch a URL of the caller's
 * choosing, so an anonymous version would be an open proxy and a free
 * port-scanner. `lib/chat/link-preview.ts` holds the SSRF guards; this holds
 * the "who is allowed to ask" half.
 */
export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed } = await checkRateLimit(`linkpreview:${user.id}`, 60, 60 * 5);
  if (!allowed) return NextResponse.json({ error: "Slow down" }, { status: 429 });

  const url = new URL(request.url).searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });
  if (url.length > 2048) return NextResponse.json({ error: "url too long" }, { status: 400 });

  const preview = await fetchLinkPreview(url).catch(() => null);
  if (!preview) return NextResponse.json({ preview: null });

  const response = NextResponse.json({ preview });
  // The upstream result is already cached in Redis for a day; let the browser
  // hold it briefly too so re-rendering a busy channel doesn't re-request.
  response.headers.set("Cache-Control", "private, max-age=600");
  return response;
}
