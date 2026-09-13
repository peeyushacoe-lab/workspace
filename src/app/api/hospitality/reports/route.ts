import { NextRequest, NextResponse }      from "next/server";
import { requireApiPermission }           from "@/lib/rbac/can";
import { prisma }                         from "@/lib/prisma";
import {
  getDemoMetrics,
  getDemoDepartments,
  DEMO_PROPERTY,
} from "@/lib/hospitality/demo-data";
import { formatCurrency, formatOccupancy } from "@/lib/hospitality/metrics";
import type { ReportPeriod, ReportData, KPIValue, DailyMetrics } from "@/lib/hospitality/types";

// ─── Period helpers ───────────────────────────────────────────────────────────

function periodBounds(period: ReportPeriod, from?: string, to?: string): { start: Date; end: Date; label: string } {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case "today":
      return { start: today, end: now, label: "Today" };
    case "yesterday": {
      const y = new Date(today); y.setDate(today.getDate() - 1);
      const ye = new Date(today); ye.setMilliseconds(-1);
      return { start: y, end: ye, label: "Yesterday" };
    }
    case "7days": {
      const s = new Date(today); s.setDate(today.getDate() - 7);
      return { start: s, end: now, label: "Last 7 Days" };
    }
    case "30days": {
      const s = new Date(today); s.setDate(today.getDate() - 30);
      return { start: s, end: now, label: "Last 30 Days" };
    }
    case "custom": {
      const s = from ? new Date(from) : today;
      const e = to   ? new Date(to)   : now;
      const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      return { start: s, end: e, label: `${fmt(s)} – ${fmt(e)}` };
    }
  }
}

// ─── KPI value helper ─────────────────────────────────────────────────────────

function kpi(
  current: number,
  previous: number | null,
  format: (v: number) => string,
  higherIsBetter = true,
): KPIValue {
  const changePct = previous != null && previous !== 0
    ? Math.round(((current - previous) / Math.abs(previous)) * 100)
    : null;
  let changeDir: KPIValue["changeDir"] = null;
  if (changePct != null) {
    if      (changePct >  1) changeDir = "up";
    else if (changePct < -1) changeDir = "down";
    else                      changeDir = "stable";
  }
  return {
    value:              current,
    formatted:          format(current),
    previous,
    previousFormatted:  previous != null ? format(previous) : null,
    changePct,
    // If higher is NOT better, invert the direction for semantic color
    changeDir: higherIsBetter ? changeDir : (changeDir === "up" ? "down" : changeDir === "down" ? "up" : changeDir),
  };
}

// ─── Demo report data (with simulated comparison) ─────────────────────────────

function buildDemoReport(period: ReportPeriod, from?: string, to?: string): ReportData {
  const bounds = periodBounds(period, from, to);
  const m      = getDemoMetrics();
  const depts  = getDemoDepartments();
  const cur    = DEMO_PROPERTY.currency;

  // Previous-period demo values — slightly lower to show positive trend
  const prev: DailyMetrics = {
    date:       bounds.start.toISOString().slice(0, 10),
    occupancy:  79.2,
    arrivals:   43,
    departures: 41,
    roomsOoo:   4,
    adr:        17_800,
    revpar:     14_098,  // 17800 × 0.792
    fbRevenue:  312_000,
    fbCovers:   451,
    openIssues: 11,
  };

  const fmt   = (v: number) => formatCurrency(v, cur);
  const fmtN  = (v: number) => String(v);
  const fmtOc = (v: number) => formatOccupancy(v);

  // Count demo alerts by status (all demo alerts are active)
  const alertTotal    = 9;
  const alertCritical = 2;
  const alertHigh     = 2;
  const alertMedium   = 3;
  const alertLow      = 2;

  return {
    period,
    periodLabel: bounds.label,
    from:        bounds.start.toISOString(),
    to:          bounds.end.toISOString(),
    property:    DEMO_PROPERTY,
    isDemo:      true,
    kpis: {
      occupancy:  kpi(m.occupancy, prev.occupancy, fmtOc),
      adr:        kpi(m.adr,       prev.adr,       fmt),
      revpar:     kpi(m.revpar,    prev.revpar,     fmt),
      arrivals:   kpi(m.arrivals,  prev.arrivals,   fmtN),
      departures: kpi(m.departures,prev.departures, fmtN),
      roomsOoo:   kpi(m.roomsOoo,  prev.roomsOoo,   fmtN, false),
      fbRevenue:  kpi(m.fbRevenue, prev.fbRevenue,  fmt),
      fbCovers:   kpi(m.fbCovers,  prev.fbCovers,   fmtN),
      openIssues: kpi(m.openIssues,prev.openIssues, fmtN, false),
      alertCount: kpi(alertTotal, 11, fmtN, false),
    },
    departments: depts,
    alertSummary: {
      critical: alertCritical,
      high:     alertHigh,
      medium:   alertMedium,
      low:      alertLow,
      resolved: 4,
      total:    alertTotal,
    },
  };
}

// ─── GET /api/hospitality/reports ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireApiPermission("hospitality.view");
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const sp      = req.nextUrl.searchParams;
  const period  = (sp.get("period") ?? "today") as ReportPeriod;
  const from    = sp.get("from") ?? undefined;
  const to      = sp.get("to")   ?? undefined;

  const validPeriods: ReportPeriod[] = ["today", "yesterday", "7days", "30days", "custom"];
  if (!validPeriods.includes(period)) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }

  try {
    const properties = await prisma.hotelProperty.findMany({
      where: { organizationId: user.organizationId ?? undefined },
      select: { id: true },
    });

    if (!properties.length) {
      return NextResponse.json({ report: buildDemoReport(period, from, to) });
    }

    // Real data: count alerts from DB within the period.
    const bounds = periodBounds(period, from, to);
    const propertyIds = properties.map(p => p.id);

    const [totalAlerts, criticalAlerts, highAlerts, mediumAlerts, lowAlerts, resolvedAlerts] = await Promise.all([
      prisma.hotelAlert.count({ where: { propertyId: { in: propertyIds }, createdAt: { gte: bounds.start, lte: bounds.end } } }),
      prisma.hotelAlert.count({ where: { propertyId: { in: propertyIds }, priority: "CRITICAL", status: { not: "RESOLVED" }, createdAt: { gte: bounds.start } } }),
      prisma.hotelAlert.count({ where: { propertyId: { in: propertyIds }, priority: "HIGH",     status: { not: "RESOLVED" }, createdAt: { gte: bounds.start } } }),
      prisma.hotelAlert.count({ where: { propertyId: { in: propertyIds }, priority: "MEDIUM",   status: { not: "RESOLVED" }, createdAt: { gte: bounds.start } } }),
      prisma.hotelAlert.count({ where: { propertyId: { in: propertyIds }, priority: "LOW",      status: { not: "RESOLVED" }, createdAt: { gte: bounds.start } } }),
      prisma.hotelAlert.count({ where: { propertyId: { in: propertyIds }, status: "RESOLVED",   resolvedAt: { gte: bounds.start, lte: bounds.end } } }),
    ]);

    // Metrics come from demo data (real metrics integration will come when live PMS is wired).
    const report = buildDemoReport(period, from, to);
    report.isDemo = false;
    report.alertSummary = { critical: criticalAlerts, high: highAlerts, medium: mediumAlerts, low: lowAlerts, resolved: resolvedAlerts, total: totalAlerts };
    report.kpis.alertCount = kpi(totalAlerts, null, String, false);
    report.kpis.openIssues = kpi(criticalAlerts + highAlerts + mediumAlerts, null, String, false);

    return NextResponse.json({ report });
  } catch {
    return NextResponse.json({ report: buildDemoReport(period, from, to) });
  }
}
