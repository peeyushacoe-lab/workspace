/**
 * WebRTC Signaling via SSE — Phase 24 Voice & Meeting
 * Rooms are isolated by roomId. Clients POST offers/answers/ICE candidates
 * which are broadcast to all other participants via Redis pub/sub → SSE.
 *
 * Signal types: offer | answer | ice-candidate | peer-joined | peer-left
 */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { redis } from "@/lib/redis";

const SIGNAL_CHANNEL = (roomId: string) => `meet:signal:${roomId}`;

// POST — send a WebRTC signal to other participants
export async function POST(request: NextRequest) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    roomId: string;
    type: "offer" | "answer" | "ice-candidate" | "peer-joined" | "peer-left";
    payload: unknown;
    targetPeerId?: string;
  };

  if (!body.roomId || !body.type)
    return NextResponse.json({ error: "roomId and type are required" }, { status: 400 });

  const message = JSON.stringify({
    type: body.type,
    senderId: user.id,
    senderName: user.fullName,
    payload: body.payload,
    targetPeerId: body.targetPeerId ?? null,
    timestamp: Date.now(),
  });

  await (redis as unknown as { publish(channel: string, message: string): Promise<number> })
    .publish(SIGNAL_CHANNEL(body.roomId), message);

  return NextResponse.json({ ok: true });
}

// GET — SSE stream for receiving WebRTC signals
export async function GET(request: NextRequest) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roomId = request.nextUrl.searchParams.get("roomId");
  if (!roomId) return NextResponse.json({ error: "roomId is required" }, { status: 400 });

  const channel = SIGNAL_CHANNEL(roomId);

  const stream = new ReadableStream({
    async start(controller) {
      const { Redis } = await import("ioredis");
      const sub = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });

      const send = (data: string) => {
        try { controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`)); } catch { /* closed */ }
      };

      send(JSON.stringify({ type: "connected", userId: user.id }));

      void sub.subscribe(channel);
      sub.on("message", (ch: string, msg: string) => {
        if (ch !== channel) return;
        try {
          const signal = JSON.parse(msg) as { senderId: string; targetPeerId?: string | null };
          // Broadcast to all, or only to the target peer
          if (!signal.targetPeerId || signal.targetPeerId === user.id) {
            send(msg);
          }
        } catch { /* ignore malformed */ }
      });

      request.signal.addEventListener("abort", () => {
        void sub.unsubscribe(channel).finally(() => sub.quit());
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
