import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveMeetingAccess } from "@/lib/meeting-access";

/**
 * Agenda items for one meeting.
 *
 * Every handler resolves access through `resolveMeetingAccess` before touching
 * anything — the meeting id comes from the URL, so without that check any
 * authenticated user could read or rewrite the agenda of a meeting they were
 * never invited to. A 404 (not 403) is returned for both "no such meeting" and
 * "not yours", so ids can't be probed.
 *
 * Any participant may edit. Meetings are collaborative and the agenda is a
 * shared working surface — restricting edits to the organizer would mean nobody
 * else can add the item they came to raise.
 */

const ITEM_SELECT = {
  id: true,
  position: true,
  title: true,
  minutes: true,
  done: true,
  ownerId: true,
  owner: { select: { id: true, fullName: true, avatarUrl: true } },
} as const;

type Params = { params: Promise<{ id: string }> };

/** Resolves the caller and their access in one step. */
async function authorise(id: string) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const access = await resolveMeetingAccess(id, user.id);
  if (!access) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };

  return { user, access };
}

// ─── GET — the agenda, in order ──────────────────────────────────────────────
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await authorise(id);
  if ("error" in auth) return auth.error;

  const items = await prisma.meetingAgendaItem.findMany({
    where: { meetingId: id },
    orderBy: { position: "asc" },
    select: ITEM_SELECT,
  });

  return NextResponse.json({ items });
}

// ─── POST — add an item ──────────────────────────────────────────────────────
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await authorise(id);
  if ("error" in auth) return auth.error;

  let body: { title?: string; ownerId?: string | null; minutes?: number | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  // Append. Computed from the current max rather than a count, so deleting an
  // item mid-list can't produce a duplicate position on the next insert.
  const last = await prisma.meetingAgendaItem.findFirst({
    where: { meetingId: id },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const item = await prisma.meetingAgendaItem.create({
    data: {
      meetingId: id,
      title: title.slice(0, 300),
      position: (last?.position ?? -1) + 1,
      ownerId: body.ownerId || null,
      // Guard against a negative or absurd time-box arriving from a client.
      minutes:
        typeof body.minutes === "number" && body.minutes > 0
          ? Math.min(Math.round(body.minutes), 600)
          : null,
    },
    select: ITEM_SELECT,
  });

  return NextResponse.json({ item }, { status: 201 });
}

// ─── PATCH — edit one item, or reorder the whole list ────────────────────────
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await authorise(id);
  if ("error" in auth) return auth.error;

  let body: {
    itemId?: string;
    title?: string;
    done?: boolean;
    ownerId?: string | null;
    minutes?: number | null;
    /** Full ordered list of item ids — used by drag-to-reorder. */
    order?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // ── Reorder ──
  if (Array.isArray(body.order)) {
    // Scoped by meetingId as well as id: without it, a crafted payload listing
    // another meeting's item ids would renumber that meeting's agenda.
    const owned = await prisma.meetingAgendaItem.findMany({
      where: { meetingId: id, id: { in: body.order } },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((i) => i.id));

    await prisma.$transaction(
      body.order
        .filter((itemId) => ownedIds.has(itemId))
        .map((itemId, index) =>
          prisma.meetingAgendaItem.update({
            where: { id: itemId },
            data: { position: index },
          }),
        ),
    );

    const items = await prisma.meetingAgendaItem.findMany({
      where: { meetingId: id },
      orderBy: { position: "asc" },
      select: ITEM_SELECT,
    });
    return NextResponse.json({ items });
  }

  // ── Edit a single item ──
  if (!body.itemId) {
    return NextResponse.json({ error: "itemId or order is required" }, { status: 400 });
  }

  // `updateMany` with the meetingId in the filter, so an item id belonging to a
  // different meeting simply matches nothing rather than being updated.
  const result = await prisma.meetingAgendaItem.updateMany({
    where: { id: body.itemId, meetingId: id },
    data: {
      ...(body.title !== undefined ? { title: body.title.trim().slice(0, 300) } : {}),
      ...(body.done !== undefined ? { done: body.done } : {}),
      ...(body.ownerId !== undefined ? { ownerId: body.ownerId || null } : {}),
      ...(body.minutes !== undefined
        ? {
            minutes:
              typeof body.minutes === "number" && body.minutes > 0
                ? Math.min(Math.round(body.minutes), 600)
                : null,
          }
        : {}),
    },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const item = await prisma.meetingAgendaItem.findUnique({
    where: { id: body.itemId },
    select: ITEM_SELECT,
  });
  return NextResponse.json({ item });
}

// ─── DELETE — remove an item ─────────────────────────────────────────────────
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await authorise(id);
  if ("error" in auth) return auth.error;

  const itemId = new URL(request.url).searchParams.get("itemId");
  if (!itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 });

  const result = await prisma.meetingAgendaItem.deleteMany({
    where: { id: itemId, meetingId: id },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
