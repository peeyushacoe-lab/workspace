// ─── Demo Maintenance Adapter ─────────────────────────────────────────────────
// Simulates a CMMS / maintenance management system.
// No external calls.

import type { HotelIntegrationAdapter } from "./base";
import type { AdapterSyncResult, HealthCheckResult, IntegrationStatus } from "../types";

export class DemoMaintenanceAdapter implements HotelIntegrationAdapter {
  readonly type             = "maintenance";
  readonly category         = "MAINTENANCE" as const;
  readonly label            = "Maintenance System";
  readonly supportedDataTypes = ["work_orders", "preventive_maintenance"] as const;

  async connect() {
    return { success: true };
  }

  async disconnect() {}

  async healthCheck(): Promise<HealthCheckResult> {
    return { healthy: true, latencyMs: 10, details: "Demo maintenance system responding normally" };
  }

  async getStatus(): Promise<IntegrationStatus> {
    return "demo";
  }

  async sync(): Promise<AdapterSyncResult> {
    return {
      success: true,
      data: {
        openWorkOrders:      11,
        criticalOrders:       2,
        overdueOrders:        3,
        avgResolutionHours:   4.2,
        scheduledPM:          5,
        completedToday:       8,
      },
      dataTypes:   ["work_orders", "preventive_maintenance"],
      recordCount: 11,
    };
  }
}
