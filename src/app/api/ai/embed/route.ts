import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { upsertEmbedding } from "@/lib/embeddings";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Verify the calling user owns/can access the given resource before we embed
 * arbitrary content under their identity. Covers the most common resource
 * types used by embed callers (knowledge, note, thread/email); other types
 * are rejected until ownership checks are added for them.
 * TODO: add ownership checks for additional resourceTypes as embed callers
 * for them are introduced (e.g. "doc", "drive-file").
 */
async function canAccessResource(userId: string, resourceType: string, resourceId: string): Promise<boolean> {
  switch (resourceType) {
    case "knowledge": {
      const item = await prisma.workspaceKnowledge.findUnique({
        where: { id: resourceId },
        select: { userId: true, isPublic: true },
      });
      if (!item) return false;
      return item.isPublic || item.userId === userId;
    }
    case "note": {
      const note = await prisma.note.findUnique({ where: { id: resourceId }, select: { userId: true } });
      return !!note && note.userId === userId;
    }
    case "thread":
    case "email": {
      const thread = await prisma.inboxThread.findUnique({
        where: { id: resourceId },
        select: { mailbox: { select: { email: true, id: true } } },
      });
      if (!thread) return false;
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (user && thread.mailbox.email === user.email) return true;
      const access = await prisma.mailboxAccess.findUnique({
        where: { mailboxId_userId: { mailboxId: thread.mailbox.id, userId } },
      });
      return !!access;
    }
    default:
      return false;
  }
}

/**
 * POST /api/ai/embed
 * Embed a resource and store in DocumentEmbedding.
 * Body: { resourceType, resourceId, content, metadata? }
 */
export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed: rateLimitOk, retryAfter } = await checkRateLimit(`ai:embed:${user.id}`, 30, 10 * 60);
  if (!rateLimitOk) {
    return NextResponse.json(
      { error: "AI rate limit reached. Please try again later.", retryAfter },
      { status: 429 }
    );
  }

  const body = await request.json() as {
    resourceType: string;
    resourceId: string;
    content: string;
    metadata?: Record<string, unknown>;
  };

  if (!body.resourceType || !body.resourceId || !body.content) {
    return NextResponse.json({ error: "resourceType, resourceId, content required" }, { status: 400 });
  }

  const allowed = await canAccessResource(user.id, body.resourceType, body.resourceId);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await upsertEmbedding({
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      content: body.content,
      userId: user.id,
      metadata: body.metadata,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Embedding failed — check OPENAI_API_KEY" }, { status: 500 });
  }
}
