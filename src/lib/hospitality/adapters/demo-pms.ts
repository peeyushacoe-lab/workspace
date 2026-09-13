// ─── Demo PMS Adapter ─────────────────────────────────────────────────────────
// Simulates a Property Management System (e.g. Opera PMS).
// Generates realistic in-memory data for The Grand Nexus Mumbai (312 rooms).
// No external credentials. No external API calls.

import type { HotelIntegrationAdapter } from "./base";
import type { AdapterSyncResult, HealthCheckResult, IntegrationStatus } from "../types";

export class DemoPMSAdapter implements HotelIntegrationAdapter {
  readonly type             = "pms";
  readonly category         = "PMS" as const;
  readonly label            = "Opera PMS";
  readonly supportedDataTypes = [
    "occupancy", "arrivals", "departures", "room_status", "vip_guests",
  ] as const;

  async connect() {
    return { success: true };
  }

  async disconnect() {
    // no-op for demo
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return { healthy: true, latencyMs: 12, details: "Demo PMS responding normally" };
  }

  async getStatus(): Promise<IntegrationStatus> {
    return "demo";
  }

  async sync(): Promise<AdapterSyncResult> {
    // Consistent with getDemoOperationsData — 286 operational rooms at 82% occ
    const totalRooms      = 286;
    const occupied        = 234;
    const available       = 41;
    const dirty           = 8;
    const outOfOrder      = 3;
    const awaitingInspect = 8;

    return {
      success: true,
      data: {
        occupancyPct:       82.0,
        totalRooms,
        occupiedRooms:      occupied,
        availableRooms:     available,
        dirtyRooms:         dirty,
        outOfOrder,
        awaitingInspection: awaitingInspect,
        arrivals:           47,
        departures:         39,
        vipGuests:          6,
        checkInsToday:      32,
        checkOutsToday:     28,
      },
      dataTypes:   ["occupancy", "arrivals", "departures", "room_status", "vip_guests"],
      recordCount: totalRooms,
    };
  }
}
