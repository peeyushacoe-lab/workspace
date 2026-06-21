import { NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { type CallMedia } from "@/lib/call-signaling";
import { startCallForUser } from "@/lib/call-service";

export const dynamic = "force-dynamic";

// Mobile (JWT-authed) call initiation. Rings web users over Redis and mobile
// users via Expo push — same shared orchestration as the web route.
export async function POST(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { channelId?: string; media?: CallMedia };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.channelId) {
    return NextResponse.json({ error: "channelId required" }, { status: 400 });
  }

  const result = await startCallForUser({
    channelId: body.channelId,
    callerId: user.userId,
    media: body.media === "video" ? "video" : "audio",
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ call: result.call });
}
