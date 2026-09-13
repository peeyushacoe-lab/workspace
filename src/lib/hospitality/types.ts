// ─── Hospitality Module — Shared Types ────────────────────────────────────────
// Pure TypeScript; no Prisma imports so these can be used in both server and
// client code. Prisma-generated types are used directly in server-side code.

export type HotelAlertPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type HotelAlertStatus   = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED";
export type IntegrationStatus  = "demo" | "connected" | "error" | "disabled";

export type DepartmentKey =
  | "front_office"
  | "housekeeping"
  | "engineering"
  | "f_and_b"
  | "security"
  | "spa"
  | "other";

// ── Property ──────────────────────────────────────────────────────────────────

export type HotelPropertySummary = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
  starRating: number | null;
  totalRooms: number;
  timezone: string;
  currency: string;
  isDemo: boolean;
};

// ── KPI Metrics ───────────────────────────────────────────────────────────────

export type DailyMetrics = {
  date: string;          // ISO date YYYY-MM-DD
  occupancy: number;     // 0-100 %
  arrivals: number;
  departures: number;
  roomsOoo: number;      // rooms out of order
  adr: number;           // average daily rate
  revpar: number;        // revenue per available room
  fbRevenue: number;     // F&B revenue (in property currency, minor units)
  fbCovers: number;      // F&B covers served
  openIssues: number;    // open operational alerts at end of day
};

// ── Alerts ────────────────────────────────────────────────────────────────────

export type HotelAlertSummary = {
  id: string;
  source: string;
  type: string;
  department: DepartmentKey | null;
  priority: HotelAlertPriority;
  title: string;
  description: string | null;
  roomNumber: string | null;
  status: HotelAlertStatus;
  assignedToId: string | null;
  assignedToName: string | null;
  taskId: string | null;
  createdAt: string;   // ISO datetime
  resolvedAt: string | null;
};

// ── Department Performance ────────────────────────────────────────────────────

export type DepartmentPerformance = {
  key: DepartmentKey;
  label: string;
  score: number;         // 0-100 operational score
  openAlerts: number;
  trend: "up" | "down" | "stable";
  highlights: string[];  // 1-3 bullet points of the day's status
};

// ── Operations ────────────────────────────────────────────────────────────────

export type RoomStatusCounts = {
  occupied: number;
  available: number;
  dirty: number;
  clean: number;
  outOfOrder: number;
  vip: number;
  checkInToday: number;
  checkOutToday: number;
};

export type HousekeepingStatus = {
  pending: number;
  completed: number;
  delayed: number;
  avgTurnaround: number;  // minutes
};

export type FrontOfficeStatus = {
  arrivals: number;
  departures: number;
  vipArrivals: number;
  earlyCheckIns: number;
  lateCheckOuts: number;
  unresolvedGuest: number;
};

export type FandBStatus = {
  revenue: number;
  covers: number;
  avgCheck: number;
  stockVariance: boolean;
};

export type EngineeringStatus = {
  open: number;
  critical: number;
  avgResolutionMinutes: number;
  overdue: number;
};

export type OperationsSnapshot = {
  rooms: RoomStatusCounts;
  housekeeping: HousekeepingStatus;
  frontOffice: FrontOfficeStatus;
  fAndB: FandBStatus;
  engineering: EngineeringStatus;
};

// ── Operations (Phase 3 — extended types) ─────────────────────────────────────

export type OperationsStatus = "NORMAL" | "ATTENTION" | "WARNING" | "CRITICAL";

export type ExtendedRoomStatusCounts = RoomStatusCounts & {
  inspected: number;
  maintenance: number;
};

export type ExtendedHousekeepingStatus = {
  toclean: number;
  cleaned: number;
  inspected: number;
  awaitingInspection: number;
  priorityRooms: number;
  vipRooms: number;
  issueRooms: number;
  outOfOrder: number;
  delayed: number;
  avgTurnaround: number; // minutes
};

export type FandBOutlet = {
  name: string;
  covers: number;
  revenue: number;
  isOpen: boolean;
};

export type ExtendedFandBStatus = {
  revenue: number;
  covers: number;
  avgCheck: number;
  openIssues: number;
  stockVariance: boolean;
  varianceAmount: number | null;
  variancePct: number | null;
  outlets: FandBOutlet[];
};

export type ExtendedEngineeringStatus = {
  open: number;
  critical: number;
  roomsOutOfOrder: number;
  overdue: number;
  avgIssueAgeHours: number;
  priorityWork: string[];
};

export type DepartmentOperationsStatus = {
  key: DepartmentKey;
  label: string;
  status: OperationsStatus;
  statusReason: string;
  openIssues: number;
  criticalCount: number;
};

export type PriorityOperationItem = {
  id: string;
  priority: HotelAlertPriority;
  department: DepartmentKey | null;
  title: string;
  detail: string | null;
  roomNumber: string | null;
  alertId: string | null;
};

export type OperationsData = {
  property: HotelPropertySummary;
  asOf: string;
  isDemo: boolean;
  overallStatus: OperationsStatus;
  rooms: ExtendedRoomStatusCounts;
  departments: {
    frontOffice: FrontOfficeStatus;
    housekeeping: ExtendedHousekeepingStatus;
    fAndB: ExtendedFandBStatus;
    engineering: ExtendedEngineeringStatus;
  };
  departmentStatuses: DepartmentOperationsStatus[];
  priorityItems: PriorityOperationItem[];
};

// ── Integrations ──────────────────────────────────────────────────────────────

export type IntegrationCategory =
  | "PMS" | "ERP" | "POS" | "STOCK" | "REPUTATION" | "HR" | "MAINTENANCE" | "OTHER";

export type IntegrationDataType =
  | "occupancy" | "arrivals" | "departures" | "room_status" | "vip_guests"
  | "revenue" | "covers" | "avg_check" | "outlets"
  | "stock_levels" | "stock_variance"
  | "reviews" | "scores" | "sentiment"
  | "work_orders" | "preventive_maintenance"
  | "payroll" | "schedules"
  | "other";

export type IntegrationSummary = {
  id: string;
  type: string;
  label: string;
  status: IntegrationStatus;
  lastSyncAt: string | null;
  lastError: string | null;
};

export type HotelIntegrationFull = IntegrationSummary & {
  propertyId: string;
  propertyName: string;
  category: IntegrationCategory;
  dataTypes: IntegrationDataType[];
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
};

// ── Normalized data from adapters ─────────────────────────────────────────────

export type NormalizedPMSData = {
  occupancyPct: number;
  totalRooms: number;
  occupiedRooms: number;
  availableRooms: number;
  dirtyRooms: number;
  outOfOrder: number;
  awaitingInspection: number;
  arrivals: number;
  departures: number;
  vipGuests: number;
};

export type NormalizedPOSData = {
  totalRevenue: number;
  totalCovers: number;
  avgCheck: number;
  outlets: { name: string; revenue: number; covers: number; isOpen: boolean }[];
};

export type NormalizedStockData = {
  variance: boolean;
  variancePct: number | null;
  varianceAmount: number | null;
  lowStockItems: number;
  criticalItems: string[];
  totalSkus: number;
};

export type NormalizedReputationData = {
  overallScore: number;
  reviewCount: number;
  recentReviews: { platform: string; score: number; summary: string }[];
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
};

export type NormalizedMaintenanceData = {
  openWorkOrders: number;
  criticalOrders: number;
  overdueOrders: number;
  avgResolutionHours: number;
  scheduledPM: number;
};

export type AdapterSyncResult = {
  success: boolean;
  data: Record<string, unknown>;
  dataTypes: IntegrationDataType[];
  recordCount: number;
  error?: string;
};

export type HealthCheckResult = {
  healthy: boolean;
  latencyMs: number;
  details: string;
};

export type IntegrationSyncResult = {
  integrationId: string;
  success: boolean;
  syncedAt: string;
  dataTypes: IntegrationDataType[];
  recordCount: number;
  isDemo: boolean;
  error?: string;
};

// ── Reporting ─────────────────────────────────────────────────────────────────

export type ReportPeriod = "today" | "yesterday" | "7days" | "30days" | "custom";

export type KPIValue = {
  value: number;
  formatted: string;
  previous: number | null;
  previousFormatted: string | null;
  changePct: number | null;          // null when no comparison available
  changeDir: "up" | "down" | "stable" | null;
};

export type AlertSummary = {
  critical: number;
  high:     number;
  medium:   number;
  low:      number;
  resolved: number;
  total:    number;
};

export type ReportData = {
  period:      ReportPeriod;
  periodLabel: string;
  from:        string;
  to:          string;
  property:    HotelPropertySummary;
  isDemo:      boolean;
  kpis: {
    occupancy:  KPIValue;
    adr:        KPIValue;
    revpar:     KPIValue;
    arrivals:   KPIValue;
    departures: KPIValue;
    roomsOoo:   KPIValue;
    fbRevenue:  KPIValue;
    fbCovers:   KPIValue;
    openIssues: KPIValue;
    alertCount: KPIValue;
  };
  departments:  DepartmentPerformance[];
  alertSummary: AlertSummary;
};

// ── AI Briefing ───────────────────────────────────────────────────────────────

export type BriefingType = "morning" | "operations" | "management" | "incident";

export type InsightSection = {
  type:     "GOOD" | "ATTENTION" | "RISK" | "FINANCIAL" | "RECOMMENDED";
  title:    string;
  body:     string;
  priority: "normal" | "high" | "urgent";
};

export type AIBriefing = {
  summary:      string;
  sections:     InsightSection[];
  briefingType: BriefingType;
  generatedAt:  string;
  isDemo:       boolean;
  modelUsed:    string;
};

// ── Overview (aggregated for the command centre) ──────────────────────────────

export type HospitalityOverview = {
  property: HotelPropertySummary;
  metrics: DailyMetrics;
  topAlerts: HotelAlertSummary[];
  departments: DepartmentPerformance[];
  integrations: IntegrationSummary[];
  aiBriefing: string | null;
};
