import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHotelContext, isHotelManager } from "@/lib/hospitality/access";

// GET /api/hospitality/property
// Lightweight header data for the hospitality shell: property identity plus
// the three counts the sidebar badges (dirty rooms, open alerts, low stock).
export async function GET() {
  const ctx = await requireHotelContext();
  if ("error" in ctx) return ctx.error;
  const { user, property } = ctx;

  const [org, details, dirtyRooms, openAlerts, items] = await Promise.all([
    prisma.organization.findUnique({ where: { id: user.organizationId }, select: { name: true } }),
    prisma.hotelProperty.findUnique({
      where: { id: property.id },
      select: { city: true, country: true, starRating: true },
    }),
    prisma.hotelRoom.count({ where: { propertyId: property.id, status: "VACANT_DIRTY" } }),
    prisma.hotelAlert.count({ where: { propertyId: property.id, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.hotelInventoryItem.findMany({
      where: { propertyId: property.id, isActive: true },
      select: { quantity: true, reorderPoint: true },
    }),
  ]);

  const lowStock = items.filter((i) => i.quantity <= i.reorderPoint).length;

  return NextResponse.json({
    property: { ...property, ...details },
    orgName: org?.name ?? null,
    counts: { dirtyRooms, openAlerts, lowStock },
    isManager: isHotelManager(user),
  });
}
