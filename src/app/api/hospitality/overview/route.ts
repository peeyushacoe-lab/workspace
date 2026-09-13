import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHotelContext, isHotelManager } from "@/lib/hospitality/access";
import { ROOM_STATUSES, type RoomStatus, compareRoomNumbers } from "@/lib/hospitality/catalog";

// GET /api/hospitality/overview
// Everything the hotel dashboard shows, from live data only — no demo figures.
// A brand-new pilot property returns zeros plus a setup checklist.
export async function GET() {
  const ctx = await requireHotelContext();
  if ("error" in ctx) return ctx.error;
  const { user, property } = ctx;
  const propertyId = property.id;

  const [rooms, items, alerts, members, movements, alertIds] = await Promise.all([
    prisma.hotelRoom.findMany({
      where: { propertyId },
      select: { id: true, number: true, floor: true, status: true, assignedToId: true, statusAt: true, guestName: true },
    }),
    prisma.hotelInventoryItem.findMany({
      where: { propertyId, isActive: true },
      select: { id: true, name: true, unit: true, quantity: true, parLevel: true, reorderPoint: true, category: true, unitCost: true },
    }),
    prisma.hotelAlert.findMany({
      where: { propertyId, status: { in: ["OPEN", "IN_PROGRESS"] } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, title: true, priority: true, status: true, department: true, roomNumber: true, createdAt: true },
    }),
    prisma.user.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, fullName: true, department: true, jobTitle: true, isActive: true },
    }),
    prisma.hotelStockMovement.findMany({
      where: { propertyId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, type: true, quantity: true, createdAt: true, item: { select: { name: true, unit: true } } },
    }),
    prisma.hotelAlert.findMany({ where: { propertyId }, select: { id: true } }),
  ]);

  const tasks = await prisma.task.findMany({
    where: {
      status: { not: "DONE" },
      OR: [
        { sourceType: "hotel", sourceId: propertyId },
        { sourceType: "hotel_alert", sourceId: { in: alertIds.map((a) => a.id) } },
      ],
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 6,
    select: {
      id: true, title: true, status: true, priority: true, dueDate: true,
      assignees: { select: { user: { select: { fullName: true } } } },
    },
  });

  const names = new Map(members.map((m) => [m.id, m.fullName]));

  const roomCounts = Object.fromEntries(ROOM_STATUSES.map((s) => [s, 0])) as Record<RoomStatus, number>;
  for (const r of rooms) roomCounts[r.status as RoomStatus] += 1;

  const housekeeping = rooms
    .filter((r) => r.status === "VACANT_DIRTY")
    .sort((a, b) => a.statusAt.getTime() - b.statusAt.getTime() || compareRoomNumbers(a.number, b.number))
    .slice(0, 8)
    .map((r) => ({
      id: r.id, number: r.number, floor: r.floor, statusAt: r.statusAt,
      assignedToName: r.assignedToId ? names.get(r.assignedToId) ?? null : null,
    }));

  const lowStock = items
    .filter((i) => i.quantity <= i.reorderPoint)
    .sort((a, b) => a.quantity / Math.max(a.parLevel, 1) - b.quantity / Math.max(b.parLevel, 1))
    .slice(0, 8);

  const stockValue = items.reduce((sum, i) => sum + (i.unitCost ?? 0) * Math.max(i.quantity, 0), 0);

  const sellable = roomCounts.VACANT_CLEAN + roomCounts.INSPECTED;
  const inService = rooms.length - roomCounts.OUT_OF_ORDER;
  const occupancy = inService > 0 ? Math.round((roomCounts.OCCUPIED / inService) * 100) : 0;

  const activeMembers = members.filter((m) => m.isActive);
  const byDept = new Map<string, number>();
  for (const m of activeMembers) byDept.set(m.department ?? "unassigned", (byDept.get(m.department ?? "unassigned") ?? 0) + 1);

  return NextResponse.json({
    property,
    isManager: isHotelManager(user),
    rooms: { total: rooms.length, counts: roomCounts, sellable, occupancy },
    housekeeping,
    stock: {
      skus: items.length,
      low: items.filter((i) => i.quantity > 0 && i.quantity <= i.reorderPoint).length,
      out: items.filter((i) => i.quantity <= 0).length,
      value: Math.round(stockValue * 100) / 100,
      items: lowStock,
    },
    alerts,
    tasks: tasks.map((t) => ({
      id: t.id, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate,
      assignees: t.assignees.map((a) => a.user.fullName),
    })),
    team: {
      total: activeMembers.length,
      departments: Array.from(byDept.entries()).map(([key, count]) => ({ key, count })),
    },
    movements,
    setup: {
      rooms: rooms.length > 0,
      inventory: items.length > 0,
      team: activeMembers.length > 1,
    },
  });
}
