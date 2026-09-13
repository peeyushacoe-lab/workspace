/**
 * Shared hotel vocabulary — room statuses, departments, stock categories.
 * Pure data, imported by both the API routes and the client views so the two
 * can never disagree about what a status or category is called.
 */

export const ROOM_STATUSES = [
  "VACANT_CLEAN",
  "INSPECTED",
  "OCCUPIED",
  "VACANT_DIRTY",
  "OUT_OF_ORDER",
] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const ROOM_STATUS_META: Record<
  RoomStatus,
  { label: string; code: string; hint: string; chip: string; dot: string; tile: string }
> = {
  VACANT_CLEAN: {
    label: "Vacant clean", code: "VC", hint: "Ready to sell",
    chip: "bg-ok-soft text-ok border-ok/25", dot: "bg-ok",
    tile: "border-ok/30 bg-ok-soft",
  },
  INSPECTED: {
    label: "Inspected", code: "INSP", hint: "Signed off by supervisor",
    chip: "bg-accent-soft text-accent-strong border-accent/25", dot: "bg-accent",
    tile: "border-accent/30 bg-accent-soft",
  },
  OCCUPIED: {
    label: "Occupied", code: "OCC", hint: "Guest in house",
    chip: "bg-violet-soft text-violet border-violet/25", dot: "bg-violet",
    tile: "border-violet/30 bg-violet-soft",
  },
  VACANT_DIRTY: {
    label: "Vacant dirty", code: "VD", hint: "Needs cleaning",
    chip: "bg-warn-soft text-warn border-warn/25", dot: "bg-warn",
    tile: "border-warn/35 bg-warn-soft",
  },
  OUT_OF_ORDER: {
    label: "Out of order", code: "OOO", hint: "Not sellable",
    chip: "bg-crit-soft text-crit border-crit/25", dot: "bg-crit",
    tile: "border-crit/30 bg-crit-soft",
  },
};

export function isRoomStatus(v: unknown): v is RoomStatus {
  return typeof v === "string" && (ROOM_STATUSES as readonly string[]).includes(v);
}

export const ROOM_TYPES = ["Standard", "Superior", "Deluxe", "Executive", "Suite", "Family"];

export const HOTEL_DEPARTMENTS = [
  { key: "management",   label: "Management" },
  { key: "front_office", label: "Front office" },
  { key: "housekeeping", label: "Housekeeping" },
  { key: "f_and_b",      label: "Food & beverage" },
  { key: "kitchen",      label: "Kitchen" },
  { key: "engineering",  label: "Engineering" },
  { key: "stores",       label: "Stores" },
  { key: "security",     label: "Security" },
] as const;

export const INVENTORY_CATEGORIES = [
  { key: "linen",       label: "Linen" },
  { key: "amenities",   label: "Guest amenities" },
  { key: "minibar",     label: "Minibar" },
  { key: "f_and_b",     label: "Food & beverage" },
  { key: "cleaning",    label: "Cleaning supplies" },
  { key: "engineering", label: "Engineering stores" },
  { key: "stationery",  label: "Stationery" },
  { key: "other",       label: "Other" },
] as const;

export const STOCK_UNITS = ["pcs", "sets", "pairs", "rolls", "packs", "boxes", "bottles", "kg", "g", "L", "ml"];

export const MOVEMENT_TYPES = ["IN", "OUT", "WASTE", "ADJUST"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_META: Record<MovementType, { label: string; verb: string; chip: string }> = {
  IN:     { label: "Received",   verb: "Receive stock", chip: "bg-ok-soft text-ok border-ok/25" },
  OUT:    { label: "Issued",     verb: "Issue stock",   chip: "bg-accent-soft text-accent-strong border-accent/25" },
  WASTE:  { label: "Wastage",    verb: "Record wastage", chip: "bg-crit-soft text-crit border-crit/25" },
  ADJUST: { label: "Stock count", verb: "Adjust count",  chip: "bg-hover text-muted border-border" },
};

export function isMovementType(v: unknown): v is MovementType {
  return typeof v === "string" && (MOVEMENT_TYPES as readonly string[]).includes(v);
}

export type StockState = "ok" | "low" | "out";

export function stockState(quantity: number, reorderPoint: number): StockState {
  if (quantity <= 0) return "out";
  if (quantity <= reorderPoint) return "low";
  return "ok";
}

export function labelOf(list: ReadonlyArray<{ key: string; label: string }>, key: string | null | undefined): string {
  if (!key) return "—";
  return list.find((i) => i.key === key)?.label ?? key;
}

/** Room numbers sort as numbers where they are numbers ("9" before "10"). */
export function compareRoomNumbers(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** Trim a free-text field; empty → null. Caps length so a paste can't bloat rows. */
export function cleanText(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t ? t : null;
}
