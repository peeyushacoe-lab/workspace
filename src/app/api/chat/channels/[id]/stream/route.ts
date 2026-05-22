import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createDedicatedRedis } from "@/lib/redis";

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

  // Pub/sub requires its own connection — never share with the command client.
  const subscriber = createDedicatedRedis();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch {
          // Controller already closed
        }
      };

      send("connected", { channelId, userId: user.id });

      // Heartbeat every 25s to prevent proxy/LB timeouts
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(":\n\n");
        } catch {
          clearInterval(keepalive);
          subscriber.disconnect();
        }
      }, 25_000);

      subscriber.subscribe(`chat:channel:${channelId}`, (err) => {
        if (err) {
          clearInterval(keepalive);
          controller.close();
          subscriber.disconnect();
        }
      });

      subscriber.on("message", (_channel, message) => {
        try {
          const parsed = JSON.parse(message) as { type: string; data: unknown };
          send(parsed.type, parsed.data);
        } catch {
          // ignore malformed messages
        }
      });

      subscriber.on("error", () => {
        clearInterval(keepalive);
        controller.close();
        subscriber.disconnect();
      });
    },
    cancel() {
      subscriber.unsubscribe();
      subscriber.disconnect();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
