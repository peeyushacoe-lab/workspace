import { NextRequest, NextResponse } from "next/server";
import { requireHospitalityApi } from "@/lib/hospitality/access";
import { prisma } from "@/lib/prisma";
import {
  resolveHotelAlert,
  dismissHotelAlert,
  assignHotelAlert,
  changeAlertPriority,
  changeAlertStatus,
} from "@/lib/hospitality/alerts";
import { getDemoAlerts } from "@/lib/hospitality/demo-data";
import type { HotelAlertPriority, HotelAlertStatus } from "@/lib/hospitality/types";

// Fetch an alert and verify org ownership — returns null on not found / wrong org.
async function getAlertSecure(id: string, orgId: string | null) {
  const alert = await prisma.hotelAlert.findUnique({
    where:  { id },
    include: {
      property:   { select: { id: true, name: true, organizationId: true, city: true, currency: true } },
      assignedTo: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
    },
  });
  if (!alert) return null;
  if (alert.property.organizationId !== orgId) return null;
  return alert;
}

// GET /api/hospitality/alerts/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireHospitalityApi();
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id } = await params;

  // Demo fallback.
  if (id.startsWith("demo-alert-")) {
    const demo = getDemoAlerts().find(a => a.id === id);
    if (!demo) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ alert: demo, auditHistory: [], linkedTask: null, isDemo: true });
  }

  try {
    const alert = await getAlertSecure(id, user.organizationId ?? null);
    if (!alert) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Linked task (soft reference via taskId).
    const linkedTask = alert.taskId
      ? await prisma.task.findUnique({
          where:  { id: alert.taskId },
          select: { id: true, title: true, status: true, priority: true },
        }).catch(() => null)
      : null;

    // Audit trail for this alert.
    const auditLogs = await prisma.auditLog.findMany({
      where:   { targetType: "hotel_alert", targetId: id },
      orderBy: { createdAt: "desc" },
      take:    20,
      select:  { id: true, action: true, metadata: true, createdAt: true, actorId: true },
    });

    // Batch-fetch actor names for the audit entries.
    const actorIds = [...new Set(auditLogs.map(e => e.actorId).filter(Boolean))] as string[];
    const actors   = actorIds.length
      ? await prisma.user.findMany({
          where:  { id: { in: actorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const actorMap = Object.fromEntries(actors.map(u => [u.id, u]));

    const auditHistory = auditLogs.map(e => ({
      ...e,
      actor: e.actorId ? (actorMap[e.actorId] ?? { id: e.actorId, fullName: "Unknown" }) : null,
    }));

    return NextResponse.json({ alert, auditHistory, linkedTask, isDemo: false });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// PATCH /api/hospitality/alerts/[id]
// Body: { action: "assign"|"priority"|"status"|"resolve"|"dismiss", ... }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // resolve/dismiss only needs alerts.resolve; everything else needs manage.
  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  const needsManage = !["resolve", "dismiss"].includes(body.action);
  const auth = needsManage
    ? await requireHospitalityApi("manage")
    : await requireHospitalityApi();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  // Demo alerts are read-only via API.
  if (id.startsWith("demo-alert-")) {
    return NextResponse.json({ error: "Demo alerts cannot be modified" }, { status: 400 });
  }

  try {
    const alert = await getAlertSecure(id, user.organizationId ?? null);
    if (!alert) return NextResponse.json({ error: "Not found" }, { status: 404 });

    switch (body.action) {
      case "assign": {
        if (!body.assignedToId) return NextResponse.json({ error: "assignedToId required" }, { status: 400 });
        const updated = await assignHotelAlert(id, body.assignedToId, user.id);
        return NextResponse.json({ alert: updated });
      }
      case "priority": {
        const p = body.priority as HotelAlertPriority;
        if (!["LOW","MEDIUM","HIGH","CRITICAL"].includes(p)) {
          return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
        }
        const updated = await changeAlertPriority(id, p, user.id);
        return NextResponse.json({ alert: updated });
      }
      case "status": {
        const s = body.status as HotelAlertStatus;
        if (!["OPEN","IN_PROGRESS","RESOLVED","DISMISSED"].includes(s)) {
          return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }
        const updated = await changeAlertStatus(id, s, user.id);
        return NextResponse.json({ alert: updated });
      }
      case "resolve": {
        const updated = await resolveHotelAlert(id, user.id);
        return NextResponse.json({ alert: updated });
      }
      case "dismiss": {
        const updated = await dismissHotelAlert(id, user.id);
        return NextResponse.json({ alert: updated });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Database error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
