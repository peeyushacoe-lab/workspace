import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveDocAccess, canEdit } from "@/lib/doc-access";
import { notifyUsers } from "@/lib/doc-comment-notify";

type Params = { params: Promise<{ id: string }> };

/**
 * Threaded comments for any Note-backed document — Docs, Sheets and Slides.
 *
 * Supersedes /api/docs/[id]/comments, which (a) had no access control at all —
 * any authenticated user could read or post on any document — and (b) was
 * Docs-only. `DocComment.documentId` holds the Note id, so one table and one
 * route serve the whole office suite.
 *
 * `anchor` is the editor-specific location the comment is pinned to:
 *   Docs   — { from, to }        character range in the Tiptap doc
 *   Sheets — { cell, sheet }     e.g. { cell: "B7", sheet: "s1" }
 *   Slides — { slide }           slide id
 * It is stored in the existing `range` Json column, which was previously
 * documented as Tiptap-only.
 */

/** Mentions are plain `@Name` tokens; resolved against workspace users on write. */
const MENTION_RE = /@([\p{L}][\p{L}\p{N}._'-]*(?:\s+[\p{L}][\p{L}\p{N}._'-]*)?)/gu;

type Anchor =
  | { from: number; to: number }
  | { cell: string; sheet?: string }
  | { slide: string }
  | null;

/** GET — all comment threads on a document, newest thread last. */
export async function GET(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const doc = await resolveDocAccess(id, user.id, user.role);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const includeResolved = searchParams.get("resolved") === "true";

  const threads = await prisma.docComment.findMany({
    where: {
      documentId: id,
      parentId: null,
      ...(includeResolved ? {} : { resolved: false }),
    },
    include: { replies: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  // Hydrate authors in one query. userId is deliberately not a FK, so a deleted
  // user leaves their comments readable rather than cascading them away.
  const userIds = [
    ...new Set([
      ...threads.map(t => t.userId),
      ...threads.flatMap(t => t.replies.map(r => r.userId)),
      ...threads.map(t => t.resolvedBy).filter((v): v is string => !!v),
    ]),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, fullName: true, avatarUrl: true },
      })
    : [];
  const byId = new Map(users.map(u => [u.id, u]));
  const unknown = { id: "", fullName: "Unknown", avatarUrl: null };

  return NextResponse.json(
    threads.map(t => ({
      ...t,
      user: byId.get(t.userId) ?? unknown,
      resolvedByUser: t.resolvedBy ? byId.get(t.resolvedBy) ?? unknown : null,
      replies: t.replies.map(r => ({ ...r, user: byId.get(r.userId) ?? unknown })),
    })),
  );
}

/** POST — start a thread, or reply to one with `parentId`. */
export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const doc = await resolveDocAccess(id, user.id, user.role);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Viewers may comment — that mirrors Google, where commenter access is a
  // distinct, lesser grant than edit. Only anonymous users are excluded.

  const body = (await request.json()) as {
    content?: string;
    anchor?: Anchor;
    parentId?: string;
  };

  const content = body.content?.trim();
  if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });
  if (content.length > 5_000) {
    return NextResponse.json({ error: "Comment is too long" }, { status: 400 });
  }

  // A reply must point at a real top-level thread on THIS document, otherwise a
  // crafted parentId could graft a reply onto someone else's document.
  if (body.parentId) {
    const parent = await prisma.docComment.findFirst({
      where: { id: body.parentId, documentId: id },
      select: { id: true, parentId: true },
    });
    if (!parent) return NextResponse.json({ error: "Parent comment not found" }, { status: 400 });
    if (parent.parentId) {
      return NextResponse.json({ error: "Replies cannot be nested further" }, { status: 400 });
    }
  }

  const comment = await prisma.docComment.create({
    data: {
      documentId: id,
      userId: user.id,
      content,
      range: (body.anchor ?? undefined) as never,
      parentId: body.parentId ?? null,
    },
  });

  // @mentions → in-app notifications. Best-effort; never blocks the write.
  const mentioned = [...content.matchAll(MENTION_RE)].map(m => m[1].trim());
  if (mentioned.length) {
    void notifyUsers({
      names: mentioned,
      actorId: user.id,
      actorName: user.fullName,
      docId: id,
      docTitle: doc.title,
      docKind: doc.kind,
      excerpt: content.slice(0, 140),
    });
  }

  return NextResponse.json(
    {
      ...comment,
      user: { id: user.id, fullName: user.fullName, avatarUrl: null },
      replies: [],
    },
    { status: 201 },
  );
}

/** PATCH — resolve / unresolve a thread, or edit your own comment. */
export async function PATCH(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const doc = await resolveDocAccess(id, user.id, user.role);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json()) as {
    commentId?: string;
    resolved?: boolean;
    content?: string;
  };
  if (!body.commentId) {
    return NextResponse.json({ error: "commentId required" }, { status: 400 });
  }

  const existing = await prisma.docComment.findFirst({
    where: { id: body.commentId, documentId: id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Editing text is author-only; resolving is open to anyone who can edit the
  // document, since resolving is a workflow action rather than authorship.
  if (body.content !== undefined && existing.userId !== user.id) {
    return NextResponse.json({ error: "You can only edit your own comments" }, { status: 403 });
  }
  if (body.resolved !== undefined && !canEdit(doc.access) && existing.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.docComment.update({
    where: { id: body.commentId },
    data: {
      ...(body.content !== undefined ? { content: body.content.trim() } : {}),
      ...(body.resolved !== undefined
        ? {
            resolved: body.resolved,
            resolvedBy: body.resolved ? user.id : null,
            resolvedAt: body.resolved ? new Date() : null,
          }
        : {}),
    },
  });

  return NextResponse.json(updated);
}

/** DELETE — remove a comment (and its replies, if it's a thread root). */
export async function DELETE(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const doc = await resolveDocAccess(id, user.id, user.role);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const commentId = searchParams.get("commentId");
  if (!commentId) return NextResponse.json({ error: "commentId required" }, { status: 400 });

  const existing = await prisma.docComment.findFirst({
    where: { id: commentId, documentId: id },
    select: { id: true, userId: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Author, or the document owner acting as moderator.
  if (existing.userId !== user.id && doc.access !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Replies use onDelete: NoAction (see schema), so the cascade has to be
  // explicit — otherwise deleting a thread root leaves orphaned replies.
  await prisma.docComment.deleteMany({ where: { parentId: commentId } });
  await prisma.docComment.delete({ where: { id: commentId } });

  return NextResponse.json({ ok: true });
}
