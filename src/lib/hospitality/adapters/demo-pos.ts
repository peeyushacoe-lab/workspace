// ─── Demo POS Adapter ─────────────────────────────────────────────────────────
// Simulates a Point of Sale system for hotel F&B outlets.
// Generates realistic in-memory F&B data. No external calls.

import type { HotelIntegrationAdapter } from "./base";
import type { AdapterSyncResult, HealthCheckResult, IntegrationStatus } from "../types";

export class DemoPOSAdapter implements HotelIntegrationAdapter {
  readonly type             = "pos";
  readonly category         = "POS" as const;
  readonly label            = "POS System";
  readonly supportedDataTypes = ["revenue", "covers", "avg_check", "outlets"] as const;

  async connect() {
    return { success: true };
  }

  async disconnect() {}

  async healthCheck(): Promise<HealthCheckResult> {
    return { healthy: true, latencyMs: 8, details: "Demo POS responding normally" };
  }

  async getStatus(): Promise<IntegrationStatus> {
    return "demo";
  }

  async sync(): Promise<AdapterSyncResult> {
    const outlets = [
      { name: "The Grand Restaurant", revenue: 198_000, covers: 312, isOpen: true  },
      { name: "Pool Bar",             revenue:  89_000, covers: 127, isOpen: true  },
      { name: "Room Service",         revenue:  55_000, covers:  48, isOpen: true  },
      { name: "The Cellar Lounge",    revenue:       0, covers:   0, isOpen: false },
    ];
    const totalRevenue = outlets.reduce((s, o) => s + o.revenue, 0); // 342 000 INR
    const totalCovers  = outlets.reduce((s, o) => s + o.covers, 0);  // 487

    return {
      success:     true,
      data:        { totalRevenue, totalCovers, avgCheck: Math.round(totalRevenue / totalCovers), outlets },
      dataTypes:   ["revenue", "covers", "avg_check", "outlets"],
      recordCount: outlets.length,
    };
  }
}
