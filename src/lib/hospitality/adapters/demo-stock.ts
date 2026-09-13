// ─── Demo Stock Adapter ───────────────────────────────────────────────────────
// Simulates a stock/inventory management system.
// No external calls.

import type { HotelIntegrationAdapter } from "./base";
import type { AdapterSyncResult, HealthCheckResult, IntegrationStatus } from "../types";

export class DemoStockAdapter implements HotelIntegrationAdapter {
  readonly type             = "stock";
  readonly category         = "STOCK" as const;
  readonly label            = "Stock Management";
  readonly supportedDataTypes = ["stock_levels", "stock_variance"] as const;

  async connect() {
    return { success: true };
  }

  async disconnect() {}

  async healthCheck(): Promise<HealthCheckResult> {
    return { healthy: true, latencyMs: 15, details: "Demo stock system responding normally" };
  }

  async getStatus(): Promise<IntegrationStatus> {
    return "demo";
  }

  async sync(): Promise<AdapterSyncResult> {
    return {
      success: true,
      data: {
        variance:       true,
        variancePct:    3.2,
        varianceAmount: 12_400,  // INR
        lowStockItems:  4,
        criticalItems:  ["Premium Scotch Whisky", "Fresh Atlantic Salmon", "Jasmine Tea (Bulk)"],
        totalSkus:      247,
      },
      dataTypes:   ["stock_levels", "stock_variance"],
      recordCount: 247,
    };
  }
}
