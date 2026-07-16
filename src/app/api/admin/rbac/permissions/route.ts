import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/rbac/can";
import { catalogByCategory } from "@/lib/rbac/catalog";

// GET /api/admin/rbac/permissions — the permission catalog, grouped by category.
export async function GET() {
  const auth = await requireApiPermission("rbac.manage");
  if ("error" in auth) return auth.error;

  return NextResponse.json({ categories: catalogByCategory() });
}
