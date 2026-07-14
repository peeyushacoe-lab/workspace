import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getDocAccessRole } from "../share/route";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const CURSOR_COLORS = ["#00d2ff", "#ff6b6b", "#ffd166", "#06d6a0", "#845ec2", "#ff9a00", "#4fc4cf"];

/**
 * GET /api/docs/[id]/collab  — SSE stream for live cursors & presence in a document.
 * Clients subscribe and receive presence updates when others join/leave/move cursors.
 *
 * POST /api/docs/[id]/collab — Broadcast a cursor/selection update to other collaborators.
 */
export async function GET(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id: documentId } = await params;

  const doc = await prisma.note.findUnique({ where: { id: documentId }, select: { userId: true, color: true } });
  if (!doc || doc.color !== "document") return new Response("Not found", { status: 404 });
  const role = await getDocAccessRole(documentId, doc, user);
  if (!role) return new Response("Forbidden", { status: 403 });

  // Register session
  const colorIndex = Math.abs(user.id.charCodeAt(0) % CURSOR_COLORS.length);
  const session = await prisma.docSession.upsert({
    where: { id: `${documentId}:${user.id}` },
    create: {
      id: `${documentId}:${user.id}`,
      documentId,
      userId: user.id,
      cursorColor: CURSOR_COLORS[colorIndex],
      cursorName: user.fullName,
      isActive: true,
    },
    update: { isActive: true, lastSeenAt: new Date() },
  }).catch(() => null);

  if (session) {
    // Broadcast join event to other collaborators
    await redis.publish(`doc:${documentId}`, JSON.stringify({
      type: "PRESENCE",
      userId: user.id,
      name: user.fullName,
      color: CURSOR_COLORS[colorIndex],
      action: "JOIN",
    })).catch(() => {});
  }

  const abortSignal = request.signal;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        if (closed) return;
        try { controller.enqueue(data); } catch { closed = true; }
      };

      const keepalive = setInterval(() => send(":\n\n"), 20_000);

      // Send current collaborators immediately
      const activeSessions = await prisma.docSession.findMany({
        where: { documentId, isActive: true, userId: { not: user.id } },
      });
      send(`data: ${JSON.stringify({ type: "INIT", sessions: activeSessions })}\n\n`);

      let sub: ReturnType<typeof import("@/lib/redis").createDedicatedRedis> | null = null;
      try {
        const { createDedicatedRedis } = await import("@/lib/redis");
        sub = createDedicatedRedis();
        sub.on("error", () => {});
        sub.on("message", (_ch: string, msg: string) => send(`data: ${msg}\n\n`));
        await new Promise<void>((resolve, reject) => {
          sub!.subscribe(`doc:${documentId}`, (err) => err ? reject(err) : resolve());
        });
      } catch { /* Redis unavailable */ }

      await new Promise<void>((resolve) => {
        abortSignal.addEventListener("abort", () => resolve(), { once: true });
      });

      closed = true;
      clearInterval(keepalive);
      try { controller.close(); } catch { /* already closed */ }
      if (sub) { try { sub.unsubscribe(); sub.disconnect(); } catch { /* ignore */ } }

      // Mark session inactive + broadcast leave
      await prisma.docSession.updateMany({ where: { documentId, userId: user.id }, data: { isActive: false } }).catch(() => {});
      await redis.publish(`doc:${documentId}`, JSON.stringify({ type: "PRESENCE", userId: user.id, action: "LEAVE" })).catch(() => {});
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

  const doc = await prisma.note.findUnique({ where: { id: documentId }, select: { userId: true, color: true } });
  if (!doc || doc.color !== "document") return new Response("Not found", { status: 404 });
  const role = await getDocAccessRole(documentId, doc, user);
  if (!role) return new Response("Forbidden", { status: 403 });

  const body = await request.json() as { type: string; cursor?: unknown; selection?: unknown };

  await redis.publish(`doc:${documentId}`, JSON.stringify({
    ...body,
    userId: user.id,
    name: user.fullName,
    ts: Date.now(),
  })).catch(() => {});

  await prisma.docSession.updateMany({
    where: { documentId, userId: user.id },
    data: { lastSeenAt: new Date() },
  }).catch(() => {});

  return new Response(null, { status: 204 });
}
