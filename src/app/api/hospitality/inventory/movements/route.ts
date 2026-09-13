import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHotelContext, isHotelManager } from "@/lib/hospitality/access";
import { HOTEL_DEPARTMENTS, cleanText, isMovementType } from "@/lib/hospitality/catalog";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const DEPT_KEYS = new Set<string>(HOTEL_DEPARTMENTS.map((d) => d.key));

// GET /api/hospitality/inventory/movements?itemId=… — the stock ledger.
export async function GET(req: NextRequest) {
  const ctx = await requireHotelContext();
  if ("error" in ctx) return ctx.error;

  const itemId = req.nextUrl.searchParams.get("itemId");
  const movements = await prisma.hotelStockMovement.findMany({
    where: { propertyId: ctx.property.id, ...(itemId ? { itemId } : {}) },
    orderBy: { createdAt: "desc" },
    take: itemId ? 100 : 250,
    include: { item: { select: { name: true, unit: true, category: true } } },
  });

  const userIds = [...new Set(movements.map((m) => m.createdById).filter((v): v is string => !!v))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
    : [];
  const names = new Map(users.map((u) => [u.id, u.fullName]));

  return NextResponse.json({
    movements: movements.map((m) => ({
      ...m,
      createdByName: m.createdById ? names.get(m.createdById) ?? null : null,
    })),
  });
}

// POST /api/hospitality/inventory/movements
// { itemId, type: IN|OUT|WASTE|ADJUST, quantity, reason?, reference?, department? }
// IN/OUT/WASTE take a positive quantity; ADJUST takes the physically counted
// on-hand figure (managers only). Crossing the reorder point raises an alert.
export async function POST(req: NextRequest) {
  const ctx = await requireHotelContext();
  if ("error" in ctx) return ctx.error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.itemId !== "string") {
    return NextResponse.json({ error: "Choose an item." }, { status: 400 });
  }
  if (!isMovementType(body.type)) {
    return NextResponse.json({ error: "Unknown movement type." }, { status: 400 });
  }
  const type = body.type;
  const qty = Math.round(Number(body.quantity) * 1000) / 1000;
  if (!Number.isFinite(qty) || qty < 0 || (type !== "ADJUST" && qty === 0)) {
    return NextResponse.json({ error: "Enter a quantity greater than zero." }, { status: 400 });
  }
  if (type === "ADJUST" && !isHotelManager(ctx.user)) {
    return NextResponse.json({ error: "Only managers can adjust a stock count." }, { status: 403 });
  }

  const department = typeof body.department === "string" && DEPT_KEYS.has(body.department) ? body.department : null;
  const itemId = body.itemId;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.hotelInventoryItem.findFirst({
        where: { id: itemId, propertyId: ctx.property.id, isActive: true },
      });
      if (!item) throw new HttpError(404, "Item not found.");

      // Increment atomically and check afterwards: the UPDATE takes the row
      // lock, so two storekeepers issuing the last units at once can't both win.
      const delta = type === "IN" ? qty : type === "ADJUST" ? qty - item.quantity : -qty;
      const updated = await tx.hotelInventoryItem.update({
        where: { id: item.id },
        data: type === "ADJUST" ? { quantity: qty } : { quantity: { increment: delta } },
      });
      if (updated.quantity < 0) {
        throw new HttpError(409, `Only ${item.quantity} ${item.unit} on hand.`);
      }

      const movement = await tx.hotelStockMovement.create({
        data: {
          itemId: item.id,
          propertyId: ctx.property.id,
          type,
          quantity: delta,
          balance: updated.quantity,
          reason: cleanText(body.reason, 200),
          reference: cleanText(body.reference, 80),
          department,
          createdById: ctx.user.id,
        },
      });
      return { before: updated.quantity - delta, item: updated, movement };
    });

    const { before, item } = result;
    if (item.reorderPoint > 0 && before > item.reorderPoint && item.quantity <= item.reorderPoint) {
      await prisma.hotelAlert
        .create({
          data: {
            propertyId: ctx.property.id,
            source: "inventory",
            type: item.quantity <= 0 ? "STOCK_OUT" : "LOW_STOCK",
            department: "stores",
            priority: item.quantity <= 0 ? "HIGH" : "MEDIUM",
            title: item.quantity <= 0 ? `${item.name} is out of stock` : `${item.name} is below reorder point`,
            description: `${item.quantity} ${item.unit} on hand · reorder at ${item.reorderPoint} · par ${item.parLevel}`,
            metadata: { itemId: item.id },
          },
        })
        .catch(() => {/* alerting must never fail the stock movement */});
    }

    return NextResponse.json({ movement: result.movement, balance: item.quantity }, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
