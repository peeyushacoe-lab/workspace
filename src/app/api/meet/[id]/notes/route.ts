import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveMeetingAccess } from "@/lib/meeting-access";

/**
 * Shared notes for one meeting.
 *
 * Separate from `PUT /api/meet/[id]` because that route is organizer-only and
 * handles meeting lifecycle (status, recording, AI summary). Notes are written
 * by whoever is taking them, which is usually not the organizer — routing them
 * through the organizer-only endpoint would mean only the host can type.
 *
 * Access is organizer-or-participant via `resolveMeetingAccess`; a non-attendee
 * gets 404, same as the agenda, so meeting ids can't be probed.
 *
 * Last-write-wins. There is no operational-transform layer here: this is a
 * plain textarea with autosave, not a collaborative editor. Two people typing
 * simultaneously will clobber each other — if that becomes a real complaint the
 * answer is Yjs (already used by Docs), not a merge heuristic bolted on here.
 */

/** Generous, but bounded — this column is read on every meeting page load. */
const MAX_NOTES = 100_000;

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await resolveMeetingAccess(id, user.id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { notes: true, updatedAt: true },
  });

  return NextResponse.json({ notes: meeting?.notes ?? "", updatedAt: meeting?.updatedAt ?? null });
}

export async function PUT(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await resolveMeetingAccess(id, user.id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { notes?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof body.notes !== "string") {
    return NextResponse.json({ error: "notes must be a string" }, { status: 400 });
  }
  if (body.notes.length > MAX_NOTES) {
    return NextResponse.json({ error: "Notes are too long" }, { status: 413 });
  }

  const updated = await prisma.meeting.update({
    where: { id },
    data: { notes: body.notes },
    select: { updatedAt: true },
  });

  return NextResponse.json({ ok: true, updatedAt: updated.updatedAt });
}
