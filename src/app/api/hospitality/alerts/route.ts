import { NextRequest, NextResponse } from "next/server";
import { requireHospitalityApi } from "@/lib/hospitality/access";
import { prisma } from "@/lib/prisma";
import { createHotelAlert } from "@/lib/hospitality/alerts";
import { getDemoAlerts } from "@/lib/hospitality/demo-data";

const ALERT_SELECT = {
  id: true, propertyId: true, source: true, type: true, department: true,
  priority: true, title: true, description: true, roomNumber: true,
  status: true, assignedToId: true, taskId: true, createdAt: true,
  resolvedAt: true, updatedAt: true,
  assignedTo: { select: { id: true, fullName: true, avatarUrl: true } },
  property:   { select: { id: true, name: true, organizationId: true } },
} as const;

// GET /api/hospitality/alerts
// Params: status, priority, department, propertyId, source, sortBy, page, limit
export async function GET(req: NextRequest) {
  const auth = await requireHospitalityApi();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const sp       = new URL(req.url).searchParams;
  const status   = sp.get("status");
  const priority = sp.get("priority");
  const dept     = sp.get("department");
  const propId   = sp.get("propertyId");
  const source   = sp.get("source");
  const sortBy   = sp.get("sortBy") ?? "priority";
  const page     = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
  const limit    = Math.min(50, parseInt(sp.get("limit") ?? "25", 10));

  try {
    // Check for real properties in this org first.
    const realProps = await prisma.hotelProperty.findMany({
      where: { organizationId: user.organizationId ?? "__none__", isDemo: false },
      select: { id: true },
    });

    // No real properties → return demo data.
    if (realProps.length === 0) {
      let alerts = getDemoAlerts();
      if (status && status !== "ACTIVE") alerts = alerts.filter(a => a.status === status);
      if (status === "ACTIVE") alerts = alerts.filter(a => a.status === "OPEN" || a.status === "IN_PROGRESS");
      if (priority) alerts = alerts.filter(a => a.priority === priority);
      if (dept)     alerts = alerts.filter(a => a.department === dept);
      if (source)   alerts = alerts.filter(a => a.source === source);
      return NextResponse.json({ alerts, total: alerts.length, page: 1, hasMore: false, isDemo: true });
    }

    const allowedPropIds = realProps.map(p => p.id);

    const where: Record<string, unknown> = {
      propertyId: propId && allowedPropIds.includes(propId)
        ? propId
        : { in: allowedPropIds },
    };
    if (status && status !== "ACTIVE") where.status = status;
    if (status === "ACTIVE") where.status = { in: ["OPEN", "IN_PROGRESS"] };
    if (priority) where.priority = priority;
    if (dept)     where.department = dept;
    if (source)   where.source = source;

    const orderBy: Record<string, string>[] =
      sortBy === "newest"   ? [{ createdAt: "desc" }] :
      sortBy === "oldest"   ? [{ createdAt: "asc"  }] :
      sortBy === "age"      ? [{ createdAt: "asc"  }] :
      [{ priority: "asc" }, { createdAt: "desc" }]; // priority sort (CRITICAL first via enum order)

    const [total, alerts] = await Promise.all([
      prisma.hotelAlert.count({ where }),
      prisma.hotelAlert.findMany({
        where,
        select:  ALERT_SELECT,
        orderBy,
        skip:    (page - 1) * limit,
        take:    limit,
      }),
    ]);

    return NextResponse.json({
      alerts,
      total,
      page,
      hasMore: page * limit < total,
      isDemo:  false,
    });
  } catch {
    // DB unavailable → demo fallback.
    const alerts = getDemoAlerts();
    return NextResponse.json({ alerts, total: alerts.length, page: 1, hasMore: false, isDemo: true });
  }
}

// POST /api/hospitality/alerts
export async function POST(req: NextRequest) {
  const auth = await requireHospitalityApi("manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await req.json().catch(() => null);
  if (!body?.propertyId || !body?.source || !body?.type || !body?.title) {
    return NextResponse.json({ error: "propertyId, source, type, title required" }, { status: 400 });
  }

  // Verify the property belongs to this org — never trust client-supplied org.
  try {
    const property = await prisma.hotelProperty.findUnique({
      where:  { id: body.propertyId },
      select: { organizationId: true },
    });
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }
    if (property.organizationId !== user.organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { alert, isDuplicate } = await createHotelAlert({
    propertyId:  body.propertyId,
    source:      String(body.source),
    type:        String(body.type),
    department:  body.department  ? String(body.department)  : undefined,
    priority:    body.priority    ? String(body.priority) as "LOW"|"MEDIUM"|"HIGH"|"CRITICAL" : undefined,
    title:       String(body.title),
    description: body.description ? String(body.description) : undefined,
    roomNumber:  body.roomNumber  ? String(body.roomNumber)  : undefined,
    metadata:    body.metadata    ? body.metadata            : undefined,
    actorId:     user.id,
  });

  return NextResponse.json({ alert, isDuplicate }, { status: isDuplicate ? 200 : 201 });
}
