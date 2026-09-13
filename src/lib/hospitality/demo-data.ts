// ─── Hospitality Demo Data ────────────────────────────────────────────────────
// Realistic data for "The Grand Nexus Mumbai" demo property.
// IMPORTANT: these functions return in-memory objects only — nothing is written
// to the database. Demo data is clearly labelled (isDemo: true on property rows).
// Real integration data will replace these functions once credentials are wired.

import type {
  HotelPropertySummary,
  DailyMetrics,
  HotelAlertSummary,
  HotelIntegrationFull,
  DepartmentPerformance,
  OperationsSnapshot,
  IntegrationSummary,
  HospitalityOverview,
  OperationsData,
  ExtendedRoomStatusCounts,
  ExtendedHousekeepingStatus,
  ExtendedFandBStatus,
  ExtendedEngineeringStatus,
  DepartmentOperationsStatus,
  PriorityOperationItem,
} from "./types";

// ── Property ──────────────────────────────────────────────────────────────────

export const DEMO_PROPERTY: HotelPropertySummary = {
  id: "demo-property-mumbai",
  name: "The Grand Nexus Mumbai",
  slug: "grand-nexus-mumbai",
  city: "Mumbai",
  country: "India",
  starRating: 5,
  totalRooms: 312,
  timezone: "Asia/Kolkata",
  currency: "INR",
  isDemo: true,
};

// ── KPIs ──────────────────────────────────────────────────────────────────────

export function getDemoMetrics(date?: string): DailyMetrics {
  const d = date ?? new Date().toISOString().slice(0, 10);
  return {
    date: d,
    occupancy: 84.0,
    arrivals: 47,
    departures: 39,
    roomsOoo: 3,
    adr: 18_400,        // INR
    revpar: 15_456,     // INR  (18400 × 0.84)
    fbRevenue: 342_000, // INR
    fbCovers: 487,
    openIssues: 9,
  };
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export function getDemoAlerts(): HotelAlertSummary[] {
  return [
    {
      id: "demo-alert-001",
      source: "maintenance",
      type: "EQUIPMENT_FAILURE",
      department: "engineering",
      priority: "CRITICAL",
      title: "Room 412 — AC unit failure",
      description: "Guest reported no cooling since 07:30. Maintenance ticket raised. Room currently occupied by Mr. Sharma (checkout tomorrow).",
      roomNumber: "412",
      status: "IN_PROGRESS",
      assignedToId: null,
      assignedToName: "Engineering Team",
      taskId: null,
      createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      resolvedAt: null,
    },
    {
      id: "demo-alert-002",
      source: "front_office",
      type: "GUEST_COMPLAINT",
      department: "front_office",
      priority: "HIGH",
      title: "Guest complaint — Room 827 noise",
      description: "Guest in 827 has complained about noise from adjacent room on two occasions. Duty manager has been notified.",
      roomNumber: "827",
      status: "OPEN",
      assignedToId: null,
      assignedToName: null,
      taskId: null,
      createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      resolvedAt: null,
    },
    {
      id: "demo-alert-003",
      source: "inventory",
      type: "STOCK_VARIANCE",
      department: "f_and_b",
      priority: "HIGH",
      title: "Beverage inventory variance — 12%",
      description: "System shows a 12% variance between theoretical and actual beverage stock. Possible point-of-sale reconciliation issue or unrecorded spoilage.",
      roomNumber: null,
      status: "OPEN",
      assignedToId: null,
      assignedToName: null,
      taskId: null,
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      resolvedAt: null,
    },
    {
      id: "demo-alert-004",
      source: "pms",
      type: "VIP_ARRIVAL",
      department: "front_office",
      priority: "HIGH",
      title: "7 VIP arrivals expected — 3 rooms not yet ready",
      description: "VIP arrivals expected between 14:00 and 18:00. Rooms 1102, 1104, and 1106 (Presidential Suite) still flagged dirty in housekeeping.",
      roomNumber: null,
      status: "IN_PROGRESS",
      assignedToId: null,
      assignedToName: "Housekeeping Supervisor",
      taskId: null,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      resolvedAt: null,
    },
    {
      id: "demo-alert-005",
      source: "housekeeping",
      type: "DELAYED_TURNAROUND",
      department: "housekeeping",
      priority: "MEDIUM",
      title: "Housekeeping running 22 min behind schedule",
      description: "18 rooms in the east wing remain dirty past the 11:00 target. Supervisor has reassigned 3 attendants from the west wing.",
      roomNumber: null,
      status: "IN_PROGRESS",
      assignedToId: null,
      assignedToName: "Housekeeping Supervisor",
      taskId: null,
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      resolvedAt: null,
    },
    {
      id: "demo-alert-006",
      source: "maintenance",
      type: "PREVENTIVE_DUE",
      department: "engineering",
      priority: "LOW",
      title: "Lift 3 — quarterly service overdue by 3 days",
      description: "Scheduled quarterly maintenance for Lift 3 (east wing) has not been logged. Service contractor to be contacted.",
      roomNumber: null,
      status: "OPEN",
      assignedToId: null,
      assignedToName: null,
      taskId: null,
      createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      resolvedAt: null,
    },
    {
      id: "demo-alert-007",
      source: "maintenance",
      type: "EQUIPMENT_FAILURE",
      department: "engineering",
      priority: "CRITICAL",
      title: "Room 603 — water leak from bathroom ceiling",
      description: "Housekeeping reported water ingress from Room 703 above. Room 603 taken out of order. Plumber on-site. Structural inspection pending.",
      roomNumber: "603",
      status: "IN_PROGRESS",
      assignedToId: null,
      assignedToName: "Engineering Team",
      taskId: null,
      createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      resolvedAt: null,
    },
    {
      id: "demo-alert-008",
      source: "front_office",
      type: "BILLING_ISSUE",
      department: "front_office",
      priority: "MEDIUM",
      title: "Room 215 — unsettled folio at checkout",
      description: "Guest checked out at 11:20 without settling the incidentals folio (₹14,200). Credit card on file declined. Accounts to follow up.",
      roomNumber: "215",
      status: "OPEN",
      assignedToId: null,
      assignedToName: null,
      taskId: null,
      createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      resolvedAt: null,
    },
    {
      id: "demo-alert-009",
      source: "maintenance",
      type: "PREVENTIVE_DUE",
      department: "engineering",
      priority: "LOW",
      title: "Gym equipment — annual service not logged",
      description: "Treadmill 2 and elliptical trainer annual safety inspection certificates expired. Service engineer booking required before end of week.",
      roomNumber: null,
      status: "OPEN",
      assignedToId: null,
      assignedToName: null,
      taskId: null,
      createdAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      resolvedAt: null,
    },
  ];
}

// ── Department Performance ────────────────────────────────────────────────────

export function getDemoDepartments(): DepartmentPerformance[] {
  return [
    {
      key: "front_office",
      label: "Front Office",
      score: 96,
      openAlerts: 2,
      trend: "stable",
      highlights: [
        "47 arrivals expected, 39 departures",
        "Average check-in time 7 min",
        "6 VIP arrivals this afternoon",
      ],
    },
    {
      key: "housekeeping",
      label: "Housekeeping",
      score: 82,
      openAlerts: 2,
      trend: "down",
      highlights: [
        "Running 22 min behind schedule",
        "18 rooms pending in east wing",
        "3 VIP rooms prioritised",
      ],
    },
    {
      key: "engineering",
      label: "Engineering",
      score: 91,
      openAlerts: 2,
      trend: "stable",
      highlights: [
        "Room 412 AC — in progress",
        "6 routine work orders open",
        "Lift 3 service overdue",
      ],
    },
    {
      key: "f_and_b",
      label: "Food & Beverage",
      score: 87,
      openAlerts: 1,
      trend: "up",
      highlights: [
        "₹3.42L revenue so far today",
        "487 covers served",
        "Beverage variance under review",
      ],
    },
  ];
}

// ── Operations Snapshot ───────────────────────────────────────────────────────

export function getDemoOperations(): OperationsSnapshot {
  return {
    rooms: {
      occupied: 240,
      available: 43,
      dirty: 22,
      clean: 218,
      outOfOrder: 3,
      vip: 12,
      checkInToday: 47,
      checkOutToday: 39,
    },
    housekeeping: {
      pending: 18,
      completed: 201,
      delayed: 8,
      avgTurnaround: 44,
    },
    frontOffice: {
      arrivals: 47,
      departures: 39,
      vipArrivals: 6,
      earlyCheckIns: 3,
      lateCheckOuts: 7,
      unresolvedGuest: 2,
    },
    fAndB: {
      revenue: 342_000,
      covers: 487,
      avgCheck: 702,
      stockVariance: true,
    },
    engineering: {
      open: 6,
      critical: 2,
      avgResolutionMinutes: 68,
      overdue: 1,
    },
  };
}

// ── Integrations ──────────────────────────────────────────────────────────────

export function getDemoIntegrations(): IntegrationSummary[] {
  return [
    { id: "demo-integration-pms",         type: "pms",         label: "Opera PMS",           status: "demo", lastSyncAt: null, lastError: null },
    { id: "demo-integration-pos",         type: "pos",         label: "POS System",           status: "demo", lastSyncAt: null, lastError: null },
    { id: "demo-integration-stock",       type: "stock",       label: "Stock Management",     status: "demo", lastSyncAt: null, lastError: null },
    { id: "demo-integration-reputation",  type: "reputation",  label: "Reputation Platform",  status: "demo", lastSyncAt: null, lastError: null },
    { id: "demo-integration-maintenance", type: "maintenance", label: "Maintenance System",   status: "demo", lastSyncAt: null, lastError: null },
  ];
}

// Full integration records used by the Phase 5 integrations API and UI.
export function getDemoIntegrationsFull(): HotelIntegrationFull[] {
  const now = new Date().toISOString();
  return [
    {
      id:           "demo-integration-pms",
      propertyId:   "demo-property-mumbai",
      propertyName: "The Grand Nexus Mumbai",
      type:         "pms",
      category:     "PMS",
      label:        "Opera PMS",
      status:       "demo",
      dataTypes:    ["occupancy", "arrivals", "departures", "room_status", "vip_guests"],
      lastSyncAt:   null,
      lastError:    null,
      isDemo:       true,
      createdAt:    now,
      updatedAt:    now,
    },
    {
      id:           "demo-integration-pos",
      propertyId:   "demo-property-mumbai",
      propertyName: "The Grand Nexus Mumbai",
      type:         "pos",
      category:     "POS",
      label:        "POS System",
      status:       "demo",
      dataTypes:    ["revenue", "covers", "avg_check", "outlets"],
      lastSyncAt:   null,
      lastError:    null,
      isDemo:       true,
      createdAt:    now,
      updatedAt:    now,
    },
    {
      id:           "demo-integration-stock",
      propertyId:   "demo-property-mumbai",
      propertyName: "The Grand Nexus Mumbai",
      type:         "stock",
      category:     "STOCK",
      label:        "Stock Management",
      status:       "demo",
      dataTypes:    ["stock_levels", "stock_variance"],
      lastSyncAt:   null,
      lastError:    null,
      isDemo:       true,
      createdAt:    now,
      updatedAt:    now,
    },
    {
      id:           "demo-integration-reputation",
      propertyId:   "demo-property-mumbai",
      propertyName: "The Grand Nexus Mumbai",
      type:         "reputation",
      category:     "REPUTATION",
      label:        "Reputation Platform",
      status:       "demo",
      dataTypes:    ["reviews", "scores", "sentiment"],
      lastSyncAt:   null,
      lastError:    null,
      isDemo:       true,
      createdAt:    now,
      updatedAt:    now,
    },
    {
      id:           "demo-integration-maintenance",
      propertyId:   "demo-property-mumbai",
      propertyName: "The Grand Nexus Mumbai",
      type:         "maintenance",
      category:     "MAINTENANCE",
      label:        "Maintenance System",
      status:       "demo",
      dataTypes:    ["work_orders", "preventive_maintenance"],
      lastSyncAt:   null,
      lastError:    null,
      isDemo:       true,
      createdAt:    now,
      updatedAt:    now,
    },
  ];
}

// ── Overview (aggregated) ─────────────────────────────────────────────────────

export function getDemoOverview(): HospitalityOverview {
  const alerts = getDemoAlerts();
  return {
    property: DEMO_PROPERTY,
    metrics: getDemoMetrics(),
    topAlerts: alerts.filter(a => a.priority === "CRITICAL" || a.priority === "HIGH"),
    departments: getDemoDepartments(),
    integrations: getDemoIntegrations(),
    aiBriefing: null, // populated by /api/hospitality/ai/briefing on demand
  };
}

// ── Activity Feed (for command centre timeline) ───────────────────────────────

export type ActivityEntry = {
  id: string;
  time: string; // ISO datetime
  type: string;
  description: string;
  department: string | null;
};

export function getDemoActivity(): ActivityEntry[] {
  const base = Date.now();
  return [
    { id: "a1", time: new Date(base - 5 * 60 * 1000).toISOString(),   type: "metric",      description: "Daily KPI snapshot generated",              department: null },
    { id: "a2", time: new Date(base - 22 * 60 * 1000).toISOString(),  type: "alert",       description: "Housekeeping delay alert raised",           department: "housekeeping" },
    { id: "a3", time: new Date(base - 45 * 60 * 1000).toISOString(),  type: "alert",       description: "Guest complaint logged — Room 827",         department: "front_office" },
    { id: "a4", time: new Date(base - 90 * 60 * 1000).toISOString(),  type: "alert",       description: "AC failure alert — Room 412",               department: "engineering" },
    { id: "a5", time: new Date(base - 105 * 60 * 1000).toISOString(), type: "task",        description: "Engineering team assigned to Room 412",     department: "engineering" },
    { id: "a6", time: new Date(base - 180 * 60 * 1000).toISOString(), type: "alert",       description: "VIP arrival flag — 6 guests expected",      department: "front_office" },
    { id: "a7", time: new Date(base - 195 * 60 * 1000).toISOString(), type: "integration", description: "Stock variance detected by inventory system", department: "f_and_b" },
    { id: "a8", time: new Date(base - 360 * 60 * 1000).toISOString(), type: "metric",      description: "Previous day's report finalised",           department: null },
  ];
}

// ── Phase 3: Full Operations Data ─────────────────────────────────────────────
// Numbers are internally consistent for 286 rooms, 82% occupancy, spec values.

export function getDemoOperationsData(): OperationsData {
  const rooms: ExtendedRoomStatusCounts = {
    occupied:      240,
    available:      43,
    dirty:          22,
    clean:         218,
    inspected:     210,
    outOfOrder:      3,
    maintenance:     0,
    vip:            12,
    checkInToday:   47,
    checkOutToday:  39,
  };

  const housekeeping: ExtendedHousekeepingStatus = {
    toclean:          22,
    cleaned:         201,
    inspected:       196,
    awaitingInspection: 8,
    priorityRooms:     5,
    vipRooms:         12,
    issueRooms:        4,
    outOfOrder:        3,
    delayed:           8,
    avgTurnaround:    44,
  };

  const fAndB: ExtendedFandBStatus = {
    revenue:         428_000,
    covers:            612,
    avgCheck:          699,
    openIssues:          2,
    stockVariance:    true,
    varianceAmount:  52_000,
    variancePct:       12.1,
    outlets: [
      { name: "The Grand Restaurant", covers: 312, revenue: 218_000, isOpen: true },
      { name: "The Lobby Bar",        covers: 187, revenue: 124_000, isOpen: true },
      { name: "Rooftop Lounge",       covers: 113, revenue:  86_000, isOpen: false },
    ],
  };

  const engineering: ExtendedEngineeringStatus = {
    open:              6,
    critical:          2,
    roomsOutOfOrder:   3,
    overdue:           1,
    avgIssueAgeHours:  3.8,
    priorityWork: [
      "Room 412 — AC unit failure (CRITICAL)",
      "Lift 3 — quarterly service overdue",
      "Room 806 — shower thermostat fault",
      "Basement pump — routine inspection",
    ],
  };

  const departmentStatuses: DepartmentOperationsStatus[] = [
    {
      key:          "front_office",
      label:        "Front Office",
      status:       "ATTENTION",
      statusReason: "2 unresolved guest issues · 6 VIP arrivals from 14:00",
      openIssues:   2,
      criticalCount: 0,
    },
    {
      key:          "housekeeping",
      label:        "Housekeeping",
      status:       "WARNING",
      statusReason: "8 rooms awaiting inspection · running 22 min behind",
      openIssues:   4,
      criticalCount: 0,
    },
    {
      key:          "f_and_b",
      label:        "Food & Beverage",
      status:       "ATTENTION",
      statusReason: "Beverage variance 12.1% — ₹52,000 unexplained",
      openIssues:   2,
      criticalCount: 0,
    },
    {
      key:          "engineering",
      label:        "Engineering",
      status:       "CRITICAL",
      statusReason: "Room 412 AC failure + Room 603 water leak — both in progress",
      openIssues:   6,
      criticalCount: 2,
    },
  ];

  const priorityItems: PriorityOperationItem[] = [
    {
      id:         "po-001",
      priority:   "CRITICAL",
      department: "engineering",
      title:      "Room 412 — AC unit failure",
      detail:     "Guest currently in room. Maintenance in progress since 07:30.",
      roomNumber: "412",
      alertId:    "demo-alert-001",
    },
    {
      id:         "po-002",
      priority:   "HIGH",
      department: "front_office",
      title:      "6 VIP arrivals — rooms 1102, 1104, 1106 not yet inspected",
      detail:     "VIPs expected 14:00–18:00. Presidential Suite and 2 deluxe rooms still dirty.",
      roomNumber: null,
      alertId:    "demo-alert-004",
    },
    {
      id:         "po-003",
      priority:   "HIGH",
      department: "f_and_b",
      title:      "Beverage stock variance — ₹52,000 (12.1%)",
      detail:     "Theoretical vs actual gap detected by inventory system.",
      roomNumber: null,
      alertId:    "demo-alert-003",
    },
    {
      id:         "po-004",
      priority:   "HIGH",
      department: "front_office",
      title:      "Guest complaint — Room 827 noise",
      detail:     "Second complaint from this guest. Duty manager notified.",
      roomNumber: "827",
      alertId:    "demo-alert-002",
    },
    {
      id:         "po-005",
      priority:   "MEDIUM",
      department: "housekeeping",
      title:      "8 rooms awaiting inspection",
      detail:     "Housekeeping running 22 min behind schedule — east wing.",
      roomNumber: null,
      alertId:    "demo-alert-005",
    },
    {
      id:         "po-006",
      priority:   "LOW",
      department: "engineering",
      title:      "Lift 3 quarterly service overdue",
      detail:     "3 days past scheduled date. Contractor to be contacted.",
      roomNumber: null,
      alertId:    "demo-alert-006",
    },
  ];

  return {
    property:      { ...DEMO_PROPERTY, totalRooms: 286 },
    asOf:          new Date().toISOString(),
    isDemo:        true,
    overallStatus: "WARNING",
    rooms,
    departments: {
      frontOffice: {
        arrivals:         47,
        departures:       39,
        vipArrivals:       6,
        earlyCheckIns:     3,
        lateCheckOuts:     7,
        unresolvedGuest:   2,
      },
      housekeeping,
      fAndB,
      engineering,
    },
    departmentStatuses,
    priorityItems,
  };
}
