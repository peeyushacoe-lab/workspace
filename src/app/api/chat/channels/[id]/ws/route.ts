import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createDedicatedRedis } from "@/lib/redis";
import { experimental_upgradeWebSocket } from "@vercel/functions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id: channelId } = await params;

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.id } },
  });
  if (!membership) return new Response("Forbidden", { status: 403 });

  return experimental_upgradeWebSocket(async (ws) => {
    const subscriber = createDedicatedRedis();
    let pingInterval: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (pingInterval) clearInterval(pingInterval);
      subscriber.unsubscribe().catch(() => {});
      subscriber.disconnect();
    };

    // Forward every Redis pub/sub event to the client as-is — the payload is
    // already { type, data } JSON, the same shape the SSE stream used.
    subscriber.on("message", (_channel, message) => {
      if (ws.readyState === ws.OPEN) ws.send(message);
    });

    subscriber.on("error", () => {
      cleanup();
      if (ws.readyState === ws.OPEN) ws.close(1011, "redis error");
    });

    subscriber.subscribe(`chat:channel:${channelId}`, (err) => {
      if (err) {
        cleanup();
        ws.close(1011, "subscription failed");
        return;
      }
      // Signal that the channel is live — mirrors the SSE "connected" event so
      // the client-side handler can set liveConnected without a separate check.
      ws.send(JSON.stringify({ type: "connected", data: { channelId, userId: user.id } }));

      // Ping every 25s to keep the Vercel function alive and detect dead peers.
      pingInterval = setInterval(() => {
        if (ws.readyState === ws.OPEN) ws.ping();
        else cleanup();
      }, 25_000);
    });

    ws.on("close", cleanup);
    ws.on("error", cleanup);
  });
}
