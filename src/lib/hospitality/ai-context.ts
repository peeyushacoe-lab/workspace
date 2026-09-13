// ─── Hospitality AI Context Builder ──────────────────────────────────────────
// Constructs a structured, size-bounded prompt context from hospitality data.
// Rules:
//  - Never include guest PII (names, passport numbers, credit cards)
//  - Never claim systems are connected when they are in demo mode
//  - Cap total character count to keep prompts within model limits
//  - Use counts and summaries — never raw DB row dumps

import type {
  BriefingType,
  DailyMetrics,
  DepartmentPerformance,
  AlertSummary,
  HotelPropertySummary,
  DepartmentOperationsStatus,
} from "./types";

export type HospitalityAIContext = {
  property:     { name: string; totalRooms: number; city: string | null; currency: string; isDemo: boolean };
  asOf:         string;
  briefingType: BriefingType;
  metrics:      DailyMetrics;
  alerts:       AlertSummary & { openList: { priority: string; title: string }[] };
  departments:  (DepartmentPerformance | DepartmentOperationsStatus)[];
  integrations: { total: number; connected: number; errors: number; demo: number; disconnected: number };
  isDemo:       boolean;
};

export function buildAIContextPrompt(ctx: HospitalityAIContext): string {
  const intStatus = ctx.integrations.errors > 0
    ? `${ctx.integrations.errors} integration(s) in error state`
    : ctx.integrations.demo === ctx.integrations.total
      ? "All integrations running in demo mode (no live connections)"
      : `${ctx.integrations.connected} connected, ${ctx.integrations.demo} demo`;

  const topAlerts = ctx.alerts.openList.slice(0, 6).map(a => `  - [${a.priority}] ${a.title}`).join("\n");

  const deptLines = ctx.departments.slice(0, 6).map(d => {
    const status = "status" in d ? ` (${d.status})` : ` (score: ${d.score}/100)`;
    const issues = "openAlerts" in d
      ? ` — ${d.openAlerts} open alert${d.openAlerts !== 1 ? "s" : ""}`
      : "";
    return `  ${d.label}${status}${issues}`;
  }).join("\n");

  return `PROPERTY:
  Name: ${ctx.property.name}
  Location: ${ctx.property.city ?? "Unknown"}
  Total rooms: ${ctx.property.totalRooms}
  Currency: ${ctx.property.currency}
  Data mode: ${ctx.isDemo ? "DEMO (simulated data, not live)" : "LIVE"}

AS OF: ${new Date(ctx.asOf).toLocaleString("en-GB", { timeZone: "UTC" })} UTC

ROOM OPERATIONS:
  Occupancy: ${ctx.metrics.occupancy.toFixed(1)}%
  Arrivals today: ${ctx.metrics.arrivals}
  Departures today: ${ctx.metrics.departures}
  Rooms out of order: ${ctx.metrics.roomsOoo}
  ADR: ${ctx.property.currency} ${ctx.metrics.adr.toLocaleString()}
  RevPAR: ${ctx.property.currency} ${ctx.metrics.revpar.toLocaleString()}

F&B:
  Revenue: ${ctx.property.currency} ${ctx.metrics.fbRevenue.toLocaleString()}
  Covers served: ${ctx.metrics.fbCovers}
  Avg cover: ${ctx.property.currency} ${ctx.metrics.fbCovers > 0 ? Math.round(ctx.metrics.fbRevenue / ctx.metrics.fbCovers).toLocaleString() : "N/A"}

ALERTS:
  Total open: ${ctx.alerts.total}
  Critical: ${ctx.alerts.critical}
  High: ${ctx.alerts.high}
  Medium: ${ctx.alerts.medium}
  Low: ${ctx.alerts.low}
  Resolved today: ${ctx.alerts.resolved}
${topAlerts ? `\nTop open alerts:\n${topAlerts}` : ""}

DEPARTMENTS:
${deptLines || "  No department data available"}

INTEGRATION STATUS:
  ${intStatus}`;
}

export function getBriefingTypeInstructions(type: BriefingType): string {
  switch (type) {
    case "morning":
      return "This is a morning briefing. Focus on readiness for the day ahead: today's arrival/departure peaks, rooms ready for inspection, outstanding issues from overnight, and key priorities for the morning team.";
    case "operations":
      return "This is an operations summary. Focus on current operational state: what is running smoothly, what needs immediate attention, outstanding maintenance, and any department under pressure.";
    case "management":
      return "This is a management summary. Focus on high-level performance: occupancy vs expectations, revenue performance, guest experience signals, and any risks to overall hotel performance.";
    case "incident":
      return "This is an incident summary. Focus on open issues, alerts, and operational problems: what is the impact, what is being done, and what decisions management needs to make.";
  }
}
