import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { type CallMedia } from "@/lib/call-signaling";
import { startCallForUser } from "@/lib/call-service";

export const dynamic = "force-dynamic";

// Caller initiates a DM/group call. Peer resolution + ringing live in the
// shared call-service so web and mobile behave identically.
export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

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
