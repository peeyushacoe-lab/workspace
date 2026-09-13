// ─── Hospitality Metric Helpers ───────────────────────────────────────────────
// Calculation utilities — pure functions, no DB access, safe for client use.

import type { DailyMetrics } from "./types";

/** Format a currency value for display (e.g. 18400 → "₹18,400"). */
export function formatCurrency(amount: number, currency = "INR"): string {
  const symbols: Record<string, string> = { INR: "₹", GBP: "£", USD: "$", EUR: "€", AED: "د.إ" };
  const sym = symbols[currency] ?? currency + " ";
  return `${sym}${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** Format an occupancy percentage for display. */
export function formatOccupancy(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Derive a simple operational health score (0-100) from daily metrics. */
export function metricsHealthScore(m: DailyMetrics): number {
  const occ   = Math.min(m.occupancy, 100);
  const issue = Math.max(0, 100 - m.openIssues * 5);
  return Math.round((occ + issue) / 2);
}

/** Return a trend arrow label from two consecutive metric values. */
export function metricTrend(current: number, previous: number): "up" | "down" | "stable" {
  const delta = current - previous;
  if (delta > 0.5)  return "up";
  if (delta < -0.5) return "down";
  return "stable";
}

/** KPI card definitions for the overview dashboard. */
export function getKpiCards(m: DailyMetrics, currency: string) {
  return [
    { id: "occupancy",  label: "Occupancy",   value: formatOccupancy(m.occupancy), sub: `${m.arrivals} arrivals today`, icon: "bed" },
    { id: "arrivals",   label: "Arrivals",    value: String(m.arrivals),            sub: `${m.departures} departures`, icon: "log-in" },
    { id: "departures", label: "Departures",  value: String(m.departures),          sub: `Net ${m.arrivals - m.departures >= 0 ? "+" : ""}${m.arrivals - m.departures}`, icon: "log-out" },
    { id: "ooo",        label: "Rooms OOO",   value: String(m.roomsOoo),            sub: "out of order", icon: "x-circle" },
    { id: "adr",        label: "ADR",         value: formatCurrency(m.adr, currency), sub: "average daily rate", icon: "banknote" },
    { id: "revpar",     label: "RevPAR",      value: formatCurrency(m.revpar, currency), sub: "per available room", icon: "trending-up" },
  ] as const;
}
