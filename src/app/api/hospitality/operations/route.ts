import { NextRequest, NextResponse } from "next/server";
import { requireHospitalityApi } from "@/lib/hospitality/access";
import { prisma } from "@/lib/prisma";
import { getDemoOperationsData } from "@/lib/hospitality/demo-data";
import { logAudit } from "@/lib/audit";
import type { OperationsData } from "@/lib/hospitality/types";

// GET /api/hospitality/operations?propertyId=<id>
// Returns the full operations snapshot for a property.
// - Demo property or no real properties → demo data.
// - Real property → strict organizationId check before returning DB data.
export async function GET(req: NextRequest) {
  const auth = await requireHospitalityApi();
  if ("error" in auth) return auth.error;

  const { user } = auth;
  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");

  // If a specific propertyId was requested, verify it belongs to the user's org.
  if (propertyId && propertyId !== "demo-property-mumbai") {
    try {
      const property = await prisma.hotelProperty.findUnique({
        where: { id: propertyId },
        select: { id: true, organizationId: true, isDemo: true },
      });

      if (!property) {
        return NextResponse.json({ error: "Property not found" }, { status: 404 });
      }

      // Cross-organization access is explicitly forbidden.
      if (property.organizationId !== user.organizationId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Real property found — fall through to demo data for now (no live PMS).
      // When live integrations exist, build real OperationsData here.
    } catch {
      // DB unavailable — fall through to demo.
    }
  }

  // Return demo data (demo property, or DB unreachable, or real property with no live PMS yet).
  const data: OperationsData = getDemoOperationsData();

  // Audit the view (non-blocking).
  logAudit({
    actorId:    user.id,
    action:     "HOTEL_PROPERTY_UPDATED", // reusing nearest action; dedicated action added in audit.ts
    targetType: "hotel_property",
    targetId:   propertyId ?? "demo-property-mumbai",
    metadata:   { action: "operations_viewed", isDemo: data.isDemo },
  }).catch(() => {/* non-critical */});

  return NextResponse.json(data);
}
