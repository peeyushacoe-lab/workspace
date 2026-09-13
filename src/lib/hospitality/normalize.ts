// ─── Normalization Layer ───────────────────────────────────────────────────────
// Translates raw adapter data into typed Nexus structures.
// Vendors can change their payload shape without touching the UI — only the
// relevant normalize* function needs updating.

import type {
  NormalizedPMSData,
  NormalizedPOSData,
  NormalizedStockData,
  NormalizedReputationData,
  NormalizedMaintenanceData,
  AdapterSyncResult,
} from "./types";

function n(v: unknown, fallback: number): number {
  return typeof v === "number" && isFinite(v) ? v : fallback;
}

export function normalizePMSData(raw: Record<string, unknown>): NormalizedPMSData {
  return {
    occupancyPct:       n(raw.occupancyPct,       0),
    totalRooms:         n(raw.totalRooms,          0),
    occupiedRooms:      n(raw.occupiedRooms,       0),
    availableRooms:     n(raw.availableRooms,      0),
    dirtyRooms:         n(raw.dirtyRooms,          0),
    outOfOrder:         n(raw.outOfOrder,          0),
    awaitingInspection: n(raw.awaitingInspection,  0),
    arrivals:           n(raw.arrivals,            0),
    departures:         n(raw.departures,          0),
    vipGuests:          n(raw.vipGuests,           0),
  };
}

export function normalizePOSData(raw: Record<string, unknown>): NormalizedPOSData {
  const outlets = Array.isArray(raw.outlets) ? raw.outlets : [];
  return {
    totalRevenue: n(raw.totalRevenue, 0),
    totalCovers:  n(raw.totalCovers,  0),
    avgCheck:     n(raw.avgCheck,     0),
    outlets: outlets.map((o: Record<string, unknown>) => ({
      name:     String(o.name    ?? "Outlet"),
      revenue:  n(o.revenue,  0),
      covers:   n(o.covers,   0),
      isOpen:   Boolean(o.isOpen),
    })),
  };
}

export function normalizeStockData(raw: Record<string, unknown>): NormalizedStockData {
  return {
    variance:       Boolean(raw.variance),
    variancePct:    raw.variancePct    != null ? n(raw.variancePct,    0) : null,
    varianceAmount: raw.varianceAmount != null ? n(raw.varianceAmount, 0) : null,
    lowStockItems:  n(raw.lowStockItems, 0),
    criticalItems:  Array.isArray(raw.criticalItems) ? (raw.criticalItems as string[]) : [],
    totalSkus:      n(raw.totalSkus, 0),
  };
}

export function normalizeReputationData(raw: Record<string, unknown>): NormalizedReputationData {
  const reviews = Array.isArray(raw.recentReviews) ? raw.recentReviews : [];
  const sent = (raw.sentimentBreakdown ?? {}) as Record<string, unknown>;
  return {
    overallScore: n(raw.overallScore, 0),
    reviewCount:  n(raw.reviewCount,  0),
    recentReviews: reviews.map((r: Record<string, unknown>) => ({
      platform: String(r.platform ?? ""),
      score:    n(r.score, 0),
      summary:  String(r.summary ?? ""),
    })),
    sentimentBreakdown: {
      positive: n(sent.positive, 0),
      neutral:  n(sent.neutral,  0),
      negative: n(sent.negative, 0),
    },
  };
}

export function normalizeMaintenanceData(raw: Record<string, unknown>): NormalizedMaintenanceData {
  return {
    openWorkOrders:     n(raw.openWorkOrders,     0),
    criticalOrders:     n(raw.criticalOrders,     0),
    overdueOrders:      n(raw.overdueOrders,      0),
    avgResolutionHours: n(raw.avgResolutionHours, 0),
    scheduledPM:        n(raw.scheduledPM,        0),
  };
}

// Convenience: dispatch to the right normalizer by adapter type.
export function normalizeByType(
  type: string,
  result: AdapterSyncResult,
): NormalizedPMSData | NormalizedPOSData | NormalizedStockData | NormalizedReputationData | NormalizedMaintenanceData | Record<string, unknown> {
  switch (type) {
    case "pms":
    case "pms_opera":
      return normalizePMSData(result.data);
    case "pos":
      return normalizePOSData(result.data);
    case "stock":
    case "inventory":
      return normalizeStockData(result.data);
    case "reputation":
      return normalizeReputationData(result.data);
    case "maintenance":
      return normalizeMaintenanceData(result.data);
    default:
      return result.data;
  }
}
