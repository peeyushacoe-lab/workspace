import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHotelContext } from "@/lib/hospitality/access";
import { cleanText, compareRoomNumbers } from "@/lib/hospitality/catalog";

const MAX_BULK = 300;

// GET /api/hospitality/rooms — every room on the property, with housekeeper names.
export async function GET() {
  const ctx = await requireHotelContext();
  if ("error" in ctx) return ctx.error;

  const [rooms, members] = await Promise.all([
    prisma.hotelRoom.findMany({ where: { propertyId: ctx.property.id } }),
    prisma.user.findMany({
      where: { organizationId: ctx.user.organizationId },
      select: { id: true, fullName: true },
    }),
  ]);
  const names = new Map(members.map((m) => [m.id, m.fullName]));

  rooms.sort((a, b) => compareRoomNumbers(a.number, b.number));

  return NextResponse.json({
    rooms: rooms.map((r) => ({
      ...r,
      assignedToName: r.assignedToId ? names.get(r.assignedToId) ?? null : null,
    })),
  });
}

// POST /api/hospitality/rooms — managers add one room ({ number }) or a range
// ({ from, to }). Floors default from the number (412 → floor 4).
export async function POST(req: NextRequest) {
  const ctx = await requireHotelContext("manage");
  if ("error" in ctx) return ctx.error;
  const propertyId = ctx.property.id;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const type = cleanText(body.type, 60) ?? "Standard";
  const floor = cleanText(body.floor, 20);

  let numbers: string[];
  if (body.from !== undefined && body.to !== undefined && body.from !== "" && body.to !== "") {
    const from = Number(body.from);
    const to = Number(body.to);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from) {
      return NextResponse.json({ error: "Enter a valid room range, e.g. 101 to 120." }, { status: 400 });
    }
    if (to - from + 1 > MAX_BULK) {
      return NextResponse.json({ error: `Add at most ${MAX_BULK} rooms at a time.` }, { status: 400 });
    }
    numbers = Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
  } else {
    const single = cleanText(body.number, 20);
    if (!single) return NextResponse.json({ error: "Room number is required." }, { status: 400 });
    numbers = [single];
  }

  const floorFor = (n: string) => {
    if (floor) return floor;
    const asNum = Number(n);
    return Number.isInteger(asNum) && asNum >= 100 ? String(Math.floor(asNum / 100)) : null;
  };

  const created = await prisma.hotelRoom.createMany({
    data: numbers.map((number) => ({ propertyId, number, type, floor: floorFor(number) })),
    skipDuplicates: true,
  });

  // Keep the property's headline room count honest.
  const total = await prisma.hotelRoom.count({ where: { propertyId } });
  await prisma.hotelProperty.update({ where: { id: propertyId }, data: { totalRooms: total } });

  return NextResponse.json(
    { created: created.count, skipped: numbers.length - created.count, total },
    { status: 201 },
  );
}
