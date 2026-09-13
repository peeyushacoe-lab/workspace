import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHotelContext } from "@/lib/hospitality/access";
import { INVENTORY_CATEGORIES, STOCK_UNITS, cleanText, stockState } from "@/lib/hospitality/catalog";

type Params = { params: Promise<{ id: string }> };

const CATEGORY_KEYS = new Set<string>(INVENTORY_CATEGORIES.map((c) => c.key));

function num(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : NaN;
}

// PATCH /api/hospitality/inventory/:id — managers edit item details.
// On-hand quantity is deliberately NOT editable here: every change to it goes
// through a stock movement so the ledger always explains the balance.
export async function PATCH(req: NextRequest, { params }: Params) {
  const ctx = await requireHotelContext("manage");
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const item = await prisma.hotelInventoryItem.findFirst({ where: { id, propertyId: ctx.property.id, isActive: true } });
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const data: Record<string, string | number | null> = {};
  if ("name" in body) {
    const name = cleanText(body.name, 120);
    if (!name) return NextResponse.json({ error: "Item name is required." }, { status: 400 });
    data.name = name;
  }
  if (typeof body.category === "string" && CATEGORY_KEYS.has(body.category)) data.category = body.category;
  if (typeof body.unit === "string" && STOCK_UNITS.includes(body.unit)) data.unit = body.unit;
  for (const key of ["sku", "supplier", "location"] as const) {
    if (key in body) data[key] = cleanText(body[key], 120);
  }
  for (const key of ["parLevel", "reorderPoint", "unitCost"] as const) {
    const v = num(body[key]);
    if (v === undefined) continue;
    if (Number.isNaN(v)) return NextResponse.json({ error: "Levels and cost must be zero or more." }, { status: 400 });
    if (v === null && key !== "unitCost") continue;
    data[key] = v;
  }

  const updated = await prisma.hotelInventoryItem.update({ where: { id: item.id }, data });
  return NextResponse.json({ item: { ...updated, state: stockState(updated.quantity, updated.reorderPoint) } });
}

// DELETE /api/hospitality/inventory/:id — archive, never hard-delete: the
// movement ledger must keep resolving the item's name.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const ctx = await requireHotelContext("manage");
  if ("error" in ctx) return ctx.error;
  const { id } = await params;

  const item = await prisma.hotelInventoryItem.findFirst({ where: { id, propertyId: ctx.property.id }, select: { id: true } });
  if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });

  await prisma.hotelInventoryItem.update({ where: { id: item.id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
