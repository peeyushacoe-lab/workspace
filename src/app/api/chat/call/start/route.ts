import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { type CallMedia } from "@/lib/call-signaling";
import { startCallForUser } from "@/lib/call-service";
import { checkChatLimit } from "@/lib/chat/limits";

export const dynamic = "force-dynamic";

// Caller initiates a DM/group call. Peer resolution + ringing live in the
// shared call-service so web and mobile behave identically.
export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Starting a call makes someone else's device ring. Unbounded, that isn't a
  // load problem, it's a harassment tool.
  const limited = await checkChatLimit("call.start", user.id);
  if (limited) {
    return Response.json(
      { error: "Too many call attempts. Try again a little later.", retryAfter: limited.retryAfter },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  let body: { channelId?: string; media?: CallMedia };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.channelId) {
    return Response.json({ error: "channelId required" }, { status: 400 });
  }

  const result = await startCallForUser({
    channelId: body.channelId,
    callerId: user.id,
    callerName: user.fullName,
    media: body.media === "video" ? "video" : "audio",
  });

  if (result.error) {
    return Response.json({ error: result.error }, { status: result.status ?? 400 });
  }
  return Response.json({ call: result.call });
}
