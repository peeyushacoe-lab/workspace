// ─── Integration Adapter Contract ─────────────────────────────────────────────
// V1: keep it minimal and extensible. Real vendor adapters implement this
// interface; demo adapters use it too so the sync service can treat them
// identically.

import type {
  IntegrationCategory,
  IntegrationDataType,
  IntegrationStatus,
  AdapterSyncResult,
  HealthCheckResult,
} from "../types";

export interface HotelIntegrationAdapter {
  readonly type: string;
  readonly category: IntegrationCategory;
  readonly label: string;
  readonly supportedDataTypes: readonly IntegrationDataType[];

  /** Returns whether this adapter can be used with the supplied config. */
  connect(config: Record<string, unknown>): Promise<{ success: boolean; error?: string }>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<HealthCheckResult>;
  sync(): Promise<AdapterSyncResult>;
  getStatus(): Promise<IntegrationStatus>;
}
