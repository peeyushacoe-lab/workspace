import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SHEET_MARKER, SLIDE_MARKER } from "@/lib/doc-markers";
import { DOC_MARKER, resolveDocAccess } from "@/lib/doc-access";

/**
 * Per-user "recently opened" list, powering the Recent views across Drive,
 * Docs, Sheets and Slides.
 *
 * Drive's Recent section used to sort by `updatedAt` — when the file was last
 * modified by *anyone* — so a colleague's edit pushed a document you'd never
 * opened to the top of your list. This tracks your own opens instead.
 */

const RESOURCE_TYPES = new Set(["file", "doc", "sheet", "slide", "note"]);

const MARKER_BY_TYPE: Record<string, string> = {
  doc: DOC_MARKER,
  sheet: SHEET_MARKER,
  slide: SLIDE_MARKER,
};

const HREF_BY_TYPE: Record<string, (id: string) => string> = {
  doc: id => `/docs?open=${id}`,
  sheet: id => `/apps/sheets/${id}`,
  slide: id => `/apps/slides/${id}`,
  note: () => `/notes`,
  file: id => `/drive?file=${id}`,
};

/** GET — the caller's recently opened items, most recent first. */
export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 20) || 20, 50);
  // ?type=sheet or ?type=doc,sheet — scopes the list to one app's home screen.
  const types = (searchParams.get("type") ?? "")
    .split(",")
    .map(t => t.trim())
    .filter(t => RESOURCE_TYPES.has(t));

  // Over-fetch, because rows whose resource has since been deleted are dropped
  // below and would otherwise short the list.
  const rows = await prisma.recentItem.findMany({
    where: { userId: user.id, ...(types.length ? { resourceType: { in: types } } : {}) },
    orderBy: { lastOpenedAt: "desc" },
    take: limit * 2,
  });
  if (!rows.length) return NextResponse.json([]);

  const noteIds = rows.filter(r => r.resourceType !== "file").map(r => r.resourceId);
  const fileIds = rows.filter(r => r.resourceType === "file").map(r => r.resourceId);

  const [noteRows, files] = await Promise.all([
    noteIds.length
      ? prisma.note.findMany({
          where: { id: { in: noteIds } },
          select: { id: true, title: true, color: true, updatedAt: true, userId: true },
        })
      : Promise.resolve([]),
    fileIds.length
      ? prisma.driveFile.findMany({
          // Ownership filtered in SQL — a Recent row must never surface a file
          // belonging to someone else.
          where: { id: { in: fileIds }, isTrashed: false, ownerId: user.id },
          select: { id: true, name: true, mimeType: true, updatedAt: true },
        })
      : Promise.resolve([]),
  ]);

  // Re-check access rather than trusting the RecentItem row. A document the
  // caller opened last week may since have been unshared — without this, its
  // title would keep appearing in their Recent list even though opening it
  // 404s. Ownership is settled from the row we already have; only genuinely
  // shared documents cost a Redis lookup, so the common case adds no latency.
  const elevated = ["ADMIN", "CEO", "CISO"].includes(user.role);
  const ownNotes = noteRows.filter(n => n.userId === user.id || elevated);
  const sharedCandidates = noteRows.filter(n => n.userId !== user.id && !elevated);

  const stillShared = await Promise.all(
    sharedCandidates.map(async n => {
      const access = await resolveDocAccess(n.id, user.id, user.role);
      return access ? n : null;
    }),
  );

  const notes = [...ownNotes, ...stillShared.filter((n): n is typeof noteRows[number] => n !== null)];

  const noteById = new Map(notes.map(n => [n.id, n]));
  const fileById = new Map(files.map(f => [f.id, f]));

  const items = rows
    .map(row => {
      if (row.resourceType === "file") {
        const file = fileById.get(row.resourceId);
        if (!file) return null;
        return {
          id: file.id,
          type: "file" as const,
          name: file.name,
          mimeType: file.mimeType,
          href: HREF_BY_TYPE.file(file.id),
          lastOpenedAt: row.lastOpenedAt,
          updatedAt: file.updatedAt,
        };
      }

      const note = noteById.get(row.resourceId);
      if (!note) return null;
      // Guard against a note that changed kind (e.g. was converted) since the
      // row was written — otherwise Recent would deep-link to the wrong editor.
      const expected = MARKER_BY_TYPE[row.resourceType];
      if (expected && note.color !== expected) return null;

      return {
        id: note.id,
        type: row.resourceType as "doc" | "sheet" | "slide" | "note",
        name: note.title || "Untitled",
        mimeType: null,
        href: (HREF_BY_TYPE[row.resourceType] ?? HREF_BY_TYPE.note)(note.id),
        lastOpenedAt: row.lastOpenedAt,
        updatedAt: note.updatedAt,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .slice(0, limit);

  return NextResponse.json(items);
}

/** POST — record that the caller just opened something. */
export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    resourceType?: string;
    resourceId?: string;
  };

  const { resourceType, resourceId } = body;
  if (!resourceType || !resourceId || !RESOURCE_TYPES.has(resourceType)) {
    return NextResponse.json({ error: "resourceType and resourceId required" }, { status: 400 });
  }

  // Upsert on the composite unique key so repeat opens move the timestamp
  // rather than growing the table.
  await prisma.recentItem.upsert({
    where: {
      userId_resourceType_resourceId: { userId: user.id, resourceType, resourceId },
    },
    create: { userId: user.id, resourceType, resourceId },
    update: { lastOpenedAt: new Date() },
  });

  // Keep the per-user list bounded — 100 entries is far more than any Recent
  // view shows, and prevents unbounded growth for heavy users.
  const count = await prisma.recentItem.count({ where: { userId: user.id } });
  if (count > 100) {
    const stale = await prisma.recentItem.findMany({
      where: { userId: user.id },
      orderBy: { lastOpenedAt: "desc" },
      skip: 100,
      select: { id: true },
    });
    if (stale.length) {
      await prisma.recentItem.deleteMany({ where: { id: { in: stale.map(s => s.id) } } });
    }
  }

  return NextResponse.json({ ok: true });
}
