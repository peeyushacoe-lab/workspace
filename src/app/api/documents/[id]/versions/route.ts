import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveDocAccess, canEdit } from "@/lib/doc-access";

type Params = { params: Promise<{ id: string }> };

/** Keep the newest N versions per document; older ones are pruned on write. */
const MAX_VERSIONS = 50;

/**
 * Two auto-saves inside this window collapse into one — otherwise a debounced
 * editor autosave would create a version every few seconds and bury the
 * meaningful manual ones.
 */
const AUTOSAVE_COALESCE_MS = 5 * 60 * 1000;

/** GET — list versions (metadata only; content is fetched per-version). */
export async function GET(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const doc = await resolveDocAccess(id, user.id, user.role);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const versionId = searchParams.get("versionId");

  // Single version, including its content — used by preview / restore.
  if (versionId) {
    const version = await prisma.documentVersion.findFirst({
      where: { id: versionId, noteId: id },
    });
    if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(version);
  }

  const versions = await prisma.documentVersion.findMany({
    where: { noteId: id },
    orderBy: { createdAt: "desc" },
    take: MAX_VERSIONS,
    select: { id: true, label: true, title: true, size: true, createdAt: true, authorId: true },
  });

  // Resolve author names in one query rather than a relation join, so a deleted
  // user leaves the version row intact (authorId is deliberately not a FK).
  const authorIds = [...new Set(versions.map(v => v.authorId).filter((a): a is string => !!a))];
  const authors = authorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, fullName: true },
      })
    : [];
  const nameById = new Map(authors.map(a => [a.id, a.fullName]));

  return NextResponse.json(
    versions.map(v => ({
      ...v,
      authorName: v.authorId ? nameById.get(v.authorId) ?? "Unknown" : "Unknown",
    })),
  );
}

/** POST — create a version snapshot. */
export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const doc = await resolveDocAccess(id, user.id, user.role);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEdit(doc.access)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    label?: string;
    content?: string;
    title?: string;
    auto?: boolean;
  };

  // Fall back to whatever is currently persisted, so a caller can snapshot
  // without re-sending the document body.
  const content = body.content ?? doc.content;
  if (!content) return NextResponse.json({ error: "Nothing to snapshot" }, { status: 400 });

  const label = body.label?.trim() || (body.auto ? "Auto-save" : "Manual save");
  const title = body.title ?? doc.title;

  if (body.auto) {
    const latest = await prisma.documentVersion.findFirst({
      where: { noteId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, content: true, label: true, createdAt: true },
    });
    // Identical content — nothing changed, don't record noise.
    if (latest && latest.content === content) {
      return NextResponse.json(
        { id: latest.id, skipped: "unchanged" },
        { status: 200 },
      );
    }
    // Recent auto-save — roll it forward instead of appending a new row.
    if (
      latest &&
      latest.label === "Auto-save" &&
      Date.now() - latest.createdAt.getTime() < AUTOSAVE_COALESCE_MS
    ) {
      const rolled = await prisma.documentVersion.update({
        where: { id: latest.id },
        data: { content, title, size: content.length, authorId: user.id },
        select: { id: true, label: true, title: true, size: true, createdAt: true, authorId: true },
      });
      return NextResponse.json({ ...rolled, coalesced: true });
    }
  }

  const version = await prisma.documentVersion.create({
    data: {
      noteId: id,
      authorId: user.id,
      label,
      content,
      title,
      size: content.length,
    },
    select: { id: true, label: true, title: true, size: true, createdAt: true, authorId: true },
  });

  // Prune beyond the cap, oldest first.
  const count = await prisma.documentVersion.count({ where: { noteId: id } });
  if (count > MAX_VERSIONS) {
    const stale = await prisma.documentVersion.findMany({
      where: { noteId: id },
      orderBy: { createdAt: "desc" },
      skip: MAX_VERSIONS,
      select: { id: true },
    });
    if (stale.length) {
      await prisma.documentVersion.deleteMany({
        where: { id: { in: stale.map(s => s.id) } },
      });
    }
  }

  return NextResponse.json(
    { ...version, authorName: user.fullName ?? "You" },
    { status: 201 },
  );
}

/** DELETE — remove one version (?versionId=) or all of them. */
export async function DELETE(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const doc = await resolveDocAccess(id, user.id, user.role);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEdit(doc.access)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const versionId = searchParams.get("versionId");

  if (versionId) {
    await prisma.documentVersion.deleteMany({ where: { id: versionId, noteId: id } });
  } else {
    await prisma.documentVersion.deleteMany({ where: { noteId: id } });
  }

  return NextResponse.json({ ok: true });
}
