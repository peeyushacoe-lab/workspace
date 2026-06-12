import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const CURSOR_COLORS = ["#1a56db","#ea4335","#0f9d58","#f4b400","#9c27b0","#ff6d00","#00bcd4"];

export async function GET(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id: documentId } = await params;

  const colorIndex = Math.abs(user.id.charCodeAt(0) % CURSOR_COLORS.length);
  await prisma.docSession.upsert({
    where: { id: `pres:${documentId}:${user.id}` },
    create: {
      id: `pres:${documentId}:${user.id}`,
      documentId: `pres:${documentId}`,
      userId: user.id,
      cursorColor: CURSOR_COLORS[colorIndex],
      cursorName: user.fullName,
      isActive: true,
    },
    update: { isActive: true, lastSeenAt: new Date() },
  }).catch(() => null);

  await redis.publish(`pres:${documentId}`, JSON.stringify({
    type: "PRESENCE", userId: user.id, name: user.fullName,
    color: CURSOR_COLORS[colorIndex], action: "JOIN",
  })).catch(() => {});

  const abortSignal = request.signal;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        if (closed) return;
        try { controller.enqueue(data); } catch { closed = true; }
      };
      const keepalive = setInterval(() => send(":\n\n"), 20_000);

      const activeSessions = await prisma.docSession.findMany({
        where: { documentId: `pres:${documentId}`, isActive: true, userId: { not: user.id } },
      });
      send(`data: ${JSON.stringify({ type: "INIT", sessions: activeSessions })}\n\n`);

      let sub: ReturnType<typeof import("@/lib/redis").createDedicatedRedis> | null = null;
      try {
        const { createDedicatedRedis } = await import("@/lib/redis");
        sub = createDedicatedRedis();
        sub.on("error", () => {});
        sub.on("message", (_ch: string, msg: string) => send(`data: ${msg}\n\n`));
        await new Promise<void>((resolve, reject) => {
          sub!.subscribe(`pres:${documentId}`, (err) => err ? reject(err) : resolve());
        });
      } catch { /* Redis unavailable */ }

      await new Promise<void>((resolve) => {
        abortSignal.addEventListener("abort", () => resolve(), { once: true });
      });

      closed = true;
      clearInterval(keepalive);
      try { controller.close(); } catch { /* already closed */ }
      if (sub) { try { sub.unsubscribe(); sub.disconnect(); } catch { /* ignore */ } }

      await prisma.docSession.updateMany({
        where: { documentId: `pres:${documentId}`, userId: user.id },
        data: { isActive: false },
      }).catch(() => {});
      await redis.publish(`pres:${documentId}`, JSON.stringify({
        type: "PRESENCE", userId: user.id, action: "LEAVE",
      })).catch(() => {});
    },
    cancel() { closed = true; },
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

export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id: documentId } = await params;

  const body = await request.json() as { type: string; [key: string]: unknown };
  await redis.publish(`pres:${documentId}`, JSON.stringify({
    ...body, userId: user.id, name: user.fullName, ts: Date.now(),
  })).catch(() => {});

  await prisma.docSession.updateMany({
    where: { documentId: `pres:${documentId}`, userId: user.id },
    data: { lastSeenAt: new Date() },
  }).catch(() => {});

  return new Response(null, { status: 204 });
}
