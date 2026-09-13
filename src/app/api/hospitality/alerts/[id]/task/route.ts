import { NextRequest, NextResponse } from "next/server";
import { requireHospitalityApi } from "@/lib/hospitality/access";
import { prisma } from "@/lib/prisma";
import { createTaskFromHotelAlert } from "@/lib/hospitality/alerts";

// POST /api/hospitality/alerts/[id]/task
// Creates a Nexus Task from a HotelAlert (sourceType="hotel_alert", sourceId=alertId).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireHospitalityApi("manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  if (id.startsWith("demo-alert-")) {
    return NextResponse.json({ error: "Cannot create tasks from demo alerts" }, { status: 400 });
  }

  // Verify alert ownership.
  try {
    const alert = await prisma.hotelAlert.findUnique({
      where:   { id },
      include: { property: { select: { organizationId: true } } },
    });
    if (!alert) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    if (alert.property.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const assigneeId = body.assigneeId ? String(body.assigneeId) : undefined;

    const result = await createTaskFromHotelAlert(id, user.id, assigneeId);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create task";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
