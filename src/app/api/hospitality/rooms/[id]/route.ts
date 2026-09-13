import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHotelContext, isHotelManager } from "@/lib/hospitality/access";
import { cleanText, isRoomStatus, type RoomStatus } from "@/lib/hospitality/catalog";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/hospitality/rooms/:id
// Any hotel user can move a room through housekeeping (status, housekeeper,
// guest, notes) — that is the floor staff's job. Changing what the room *is*
// (type, floor) is manager-only.
export async function PATCH(req: NextRequest, { params }: Params) {
  const ctx = await requireHotelContext();
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const room = await prisma.hotelRoom.findFirst({ where: { id, propertyId: ctx.property.id } });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const data: {
    status?: RoomStatus; statusAt?: Date; assignedToId?: string | null;
    guestName?: string | null; notes?: string | null; type?: string; floor?: string | null;
  } = {};

  if (body.status !== undefined) {
    if (!isRoomStatus(body.status)) {
      return NextResponse.json({ error: "Unknown room status." }, { status: 400 });
    }
    if (body.status !== room.status) {
      data.status = body.status;
      data.statusAt = new Date();
      // A guest leaving ends the stay on the room record.
      if (room.status === "OCCUPIED") data.guestName = null;
    }
  }

  if ("assignedToId" in body) {
    if (body.assignedToId === null || body.assignedToId === "") {
      data.assignedToId = null;
    } else if (typeof body.assignedToId === "string") {
      const member = await prisma.user.findFirst({
        where: { id: body.assignedToId, organizationId: ctx.user.organizationId, isActive: true },
        select: { id: true },
      });
      if (!member) return NextResponse.json({ error: "That person is not on your team." }, { status: 400 });
      data.assignedToId = member.id;
    }
  }

  if ("guestName" in body) data.guestName = cleanText(body.guestName, 120);
  if ("notes" in body) data.notes = cleanText(body.notes, 500);

  if ("type" in body || "floor" in body) {
    if (!isHotelManager(ctx.user)) {
      return NextResponse.json({ error: "Only managers can change room type or floor." }, { status: 403 });
    }
    if ("type" in body) data.type = cleanText(body.type, 60) ?? room.type;
    if ("floor" in body) data.floor = cleanText(body.floor, 20);
  }

  const updated = await prisma.hotelRoom.update({ where: { id: room.id }, data });
  return NextResponse.json({ room: updated });
}

// DELETE /api/hospitality/rooms/:id — managers only.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const ctx = await requireHotelContext("manage");
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const room = await prisma.hotelRoom.findFirst({ where: { id, propertyId: ctx.property.id }, select: { id: true } });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  await prisma.hotelRoom.delete({ where: { id: room.id } });
  const total = await prisma.hotelRoom.count({ where: { propertyId: ctx.property.id } });
  await prisma.hotelProperty.update({ where: { id: ctx.property.id }, data: { totalRooms: total } });

  return NextResponse.json({ ok: true, total });
}
