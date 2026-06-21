import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { createDedicatedRedis } from "@/lib/redis";
import { userCallChannel } from "@/lib/call-signaling";

export const dynamic = "force-dynamic";

// Per-user SSE stream that delivers call signals (incoming/accepted/declined/
// cancelled/ended). Mounted globally by CallProvider so a user can be rung from
// anywhere in the app.
export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return new Response("Unauthorized", { status: 401 });

  const abortSignal = request.signal;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(data);
        } catch {
          closed = true;
        }
      };

      send("event: connected\ndata: {}\n\n");

      const keepalive = setInterval(() => send(":\n\n"), 25_000);

      let subscriber: ReturnType<typeof createDedicatedRedis> | undefined;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
        if (subscriber) {
          try {
            subscriber.unsubscribe();
          } catch {
            /* ignore */
          }
          try {
            subscriber.disconnect();
          } catch {
            /* ignore */
          }
        }
      };

      abortSignal.addEventListener("abort", () => cleanup(), { once: true });

      try {
        subscriber = createDedicatedRedis();
        subscriber.on("error", () => cleanup());
        subscriber.on("message", (_ch: string, message: string) => {
          send("data: " + message + "\n\n");
        });
        await new Promise<void>((resolve, reject) => {
          subscriber!.subscribe(userCallChannel(user.id), (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } catch {
        // Redis unavailable — keep the connection alive for keepalives only.
        if (subscriber) {
          try {
            subscriber.disconnect();
          } catch {
            /* ignore */
          }
        }
        subscriber = undefined;
      }

      await new Promise<void>((resolve) => {
        abortSignal.addEventListener("abort", () => resolve(), { once: true });
      });
      cleanup();
    },
    cancel() {
      closed = true;
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
