// ─── Adapter Registry ─────────────────────────────────────────────────────────
// Maps integration type keys to their adapter implementations.
// Add new adapters here as they are built.

import type { HotelIntegrationAdapter } from "./base";
import { DemoPMSAdapter         } from "./demo-pms";
import { DemoPOSAdapter         } from "./demo-pos";
import { DemoStockAdapter       } from "./demo-stock";
import { DemoReputationAdapter  } from "./demo-reputation";
import { DemoMaintenanceAdapter } from "./demo-maintenance";

// All demo adapters use lowercase type keys — same as HotelIntegration.type in DB.
const REGISTRY: Record<string, () => HotelIntegrationAdapter> = {
  pms:         () => new DemoPMSAdapter(),
  pos:         () => new DemoPOSAdapter(),
  stock:       () => new DemoStockAdapter(),
  reputation:  () => new DemoReputationAdapter(),
  maintenance: () => new DemoMaintenanceAdapter(),
  // legacy keys from early demo data kept for backward compatibility
  pms_opera:   () => new DemoPMSAdapter(),
  inventory:   () => new DemoStockAdapter(),
};

export function getAdapter(type: string): HotelIntegrationAdapter | null {
  const factory = REGISTRY[type];
  return factory ? factory() : null;
}

export function listSupportedTypes(): string[] {
  return Object.keys(REGISTRY).filter(k => !["pms_opera", "inventory"].includes(k));
}

export type { HotelIntegrationAdapter };
