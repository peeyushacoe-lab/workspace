import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { redis } from "@/lib/redis";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Booking = {
  id: string;
  resourceId: string;
  bookedBy: string;       // userId
  bookedByName: string;
  title: string;
  startTime: string;      // ISO
  endTime: string;        // ISO
  createdAt: string;
};

// ─── Redis key ────────────────────────────────────────────────────────────────

const bookingsKey = (resourceId: string) => `resource:bookings:${resourceId}`;

// ─── GET /api/admin/resources/bookings?resourceId=xxx&date=YYYY-MM-DD ─────────
// Lists bookings for a resource on a given date. Anyone authenticated.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resourceId = req.nextUrl.searchParams.get("resourceId");
  const date = req.nextUrl.searchParams.get("date"); // YYYY-MM-DD

  if (!resourceId) {
    return NextResponse.json({ error: "resourceId is required" }, { status: 400 });
  }

  const raw = await redis.hgetall(bookingsKey(resourceId));
  let bookings: Booking[] = raw
    ? Object.values(raw).map((v) => JSON.parse(v) as Booking)
    : [];

  // Filter to the requested date (match startTime prefix)
  if (date) {
    bookings = bookings.filter((b) => b.startTime.startsWith(date));
  }

  bookings.sort((a, b) => a.startTime.localeCompare(b.startTime));

  return NextResponse.json(bookings);
}

// ─── POST /api/admin/resources/bookings ───────────────────────────────────────
// Any authenticated user can book. Body: { resourceId, title, startTime, endTime }
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    resourceId?: string;
    title?: string;
    startTime?: string;
    endTime?: string;
  };

  if (!body.resourceId?.trim()) {
    return NextResponse.json({ error: "resourceId is required" }, { status: 400 });
  }
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!body.startTime || !body.endTime) {
    return NextResponse.json({ error: "startTime and endTime are required" }, { status: 400 });
  }

  const start = new Date(body.startTime);
  const end = new Date(body.endTime);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: "startTime and endTime must be valid ISO dates" }, { status: 400 });
  }
  if (end <= start) {
    return NextResponse.json({ error: "endTime must be after startTime" }, { status: 400 });
  }

  // Check for overlapping bookings on this resource
  const raw = await redis.hgetall(bookingsKey(body.resourceId));
  if (raw) {
    const existing = Object.values(raw).map((v) => JSON.parse(v) as Booking);
    const overlap = existing.find((b) => {
      const bStart = new Date(b.startTime);
      const bEnd = new Date(b.endTime);
      return start < bEnd && end > bStart;
    });
    if (overlap) {
      return NextResponse.json(
        { error: "This time slot overlaps with an existing booking", conflictId: overlap.id },
        { status: 409 }
      );
    }
  }

  const booking: Booking = {
    id: crypto.randomUUID(),
    resourceId: body.resourceId.trim(),
    bookedBy: user.id,
    bookedByName: user.fullName ?? user.email,
    title: body.title.trim(),
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    createdAt: new Date().toISOString(),
  };

  await redis.hset(bookingsKey(booking.resourceId), booking.id, JSON.stringify(booking));

  return NextResponse.json(booking, { status: 201 });
}

// ─── DELETE /api/admin/resources/bookings?id=xxx&resourceId=xxx ───────────────
// Owner or ADMIN can cancel.
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  const resourceId = req.nextUrl.searchParams.get("resourceId");

  if (!id || !resourceId) {
    return NextResponse.json({ error: "id and resourceId query params are required" }, { status: 400 });
  }

  const raw = await redis.hget(bookingsKey(resourceId), id);
  if (!raw) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const booking = JSON.parse(raw) as Booking;

  if (booking.bookedBy !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden — you can only cancel your own bookings" }, { status: 403 });
  }

  await redis.hdel(bookingsKey(resourceId), id);

  return NextResponse.json({ ok: true });
}
