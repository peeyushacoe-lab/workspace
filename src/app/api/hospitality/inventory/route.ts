import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHotelContext } from "@/lib/hospitality/access";
import { INVENTORY_CATEGORIES, STOCK_UNITS, cleanText, stockState } from "@/lib/hospitality/catalog";

const CATEGORY_KEYS = new Set<string>(INVENTORY_CATEGORIES.map((c) => c.key));

function num(v: unknown, fallback = 0): number | null {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : null;
}

// GET /api/hospitality/inventory — active items with their stock state.
export async function GET() {
  const ctx = await requireHotelContext();
  if ("error" in ctx) return ctx.error;

  const items = await prisma.hotelInventoryItem.findMany({
    where: { propertyId: ctx.property.id, isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({
    currency: ctx.property.currency,
    items: items.map((i) => ({ ...i, state: stockState(i.quantity, i.reorderPoint) })),
  });
}

// POST /api/hospitality/inventory — managers add an item. An opening quantity
// is written to the ledger as a receipt so the movement history starts complete.
export async function POST(req: NextRequest) {
  const ctx = await requireHotelContext("manage");
  if ("error" in ctx) return ctx.error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const name = cleanText(body.name, 120);
  if (!name) return NextResponse.json({ error: "Item name is required." }, { status: 400 });

  const category = typeof body.category === "string" && CATEGORY_KEYS.has(body.category) ? body.category : "other";
  const unit = typeof body.unit === "string" && STOCK_UNITS.includes(body.unit) ? body.unit : "pcs";
  const quantity = num(body.quantity);
  const parLevel = num(body.parLevel);
  const reorderPoint = num(body.reorderPoint);
  const unitCost = body.unitCost === "" || body.unitCost == null ? null : num(body.unitCost);

  if (quantity === null || parLevel === null || reorderPoint === null || (body.unitCost && unitCost === null)) {
    return NextResponse.json({ error: "Quantities and cost must be zero or more." }, { status: 400 });
  }

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.hotelInventoryItem.create({
      data: {
        propertyId: ctx.property.id,
        name, category, unit, quantity, parLevel, reorderPoint, unitCost,
        sku: cleanText(body.sku, 60),
        supplier: cleanText(body.supplier, 120),
        location: cleanText(body.location, 120),
      },
    });
    if (quantity > 0) {
      await tx.hotelStockMovement.create({
        data: {
          itemId: created.id, propertyId: ctx.property.id, type: "IN",
          quantity, balance: quantity, reason: "Opening stock", createdById: ctx.user.id,
        },
      });
    }
    return created;
  });

  return NextResponse.json({ item: { ...item, state: stockState(item.quantity, item.reorderPoint) } }, { status: 201 });
}
