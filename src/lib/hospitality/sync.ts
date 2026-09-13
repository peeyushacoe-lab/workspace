// ─── Integration Sync Service ─────────────────────────────────────────────────
// Server-side only — imports Prisma.
// Runs a sync against the adapter for a given integration, updates the DB record,
// and writes audit log entries.
//
// Demo syncs are in-process (fast, no queue needed). Real syncs in production
// should be enqueued via BullMQ (hospitality queue) to avoid blocking the HTTP
// handler — wire that when real credentials are supported.

import { prisma }    from "@/lib/prisma";
import { logAudit }  from "@/lib/audit";
import { getAdapter } from "./adapters/index";
import { normalizeByType } from "./normalize";
import type { IntegrationSyncResult } from "./types";

export async function runIntegrationSync(
  integrationId: string,
  actorId: string,
): Promise<IntegrationSyncResult> {
  // Demo integrations never touch the database.
  if (integrationId.startsWith("demo-integration-") || integrationId.startsWith("demo-int-")) {
    return runDemoSync(integrationId, actorId);
  }

  const integration = await prisma.hotelIntegration.findUnique({
    where: { id: integrationId },
    include: { property: { select: { id: true, organizationId: true } } },
  });
  if (!integration) {
    return { integrationId, success: false, syncedAt: new Date().toISOString(), dataTypes: [], recordCount: 0, isDemo: false, error: "Integration not found" };
  }

  const adapter = getAdapter(integration.type);
  if (!adapter) {
    return { integrationId, success: false, syncedAt: new Date().toISOString(), dataTypes: [], recordCount: 0, isDemo: false, error: `No adapter for type: ${integration.type}` };
  }

  await logAudit({
    actorId,
    action:     "HOTEL_INTEGRATION_SYNC_STARTED",
    targetType: "hotel_integration",
    targetId:   integrationId,
    metadata:   { type: integration.type, label: integration.label },
  });

  // Mark as syncing.
  await prisma.hotelIntegration.update({
    where: { id: integrationId },
    data:  { status: "syncing" },
  }).catch(() => null);

  let result: IntegrationSyncResult;
  try {
    const raw = await adapter.sync();
    normalizeByType(integration.type, raw); // validate shape; result discarded in V1

    await prisma.hotelIntegration.update({
      where: { id: integrationId },
      data: {
        status:     integration.status === "syncing" ? "connected" : integration.status,
        lastSyncAt: new Date(),
        lastError:  null,
      },
    });

    result = {
      integrationId,
      success:     true,
      syncedAt:    new Date().toISOString(),
      dataTypes:   raw.dataTypes,
      recordCount: raw.recordCount,
      isDemo:      false,
    };

    await logAudit({
      actorId,
      action:     "HOTEL_INTEGRATION_SYNC_COMPLETED",
      targetType: "hotel_integration",
      targetId:   integrationId,
      metadata:   { dataTypes: raw.dataTypes, recordCount: raw.recordCount },
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown sync error";
    await prisma.hotelIntegration.update({
      where: { id: integrationId },
      data:  { status: "error", lastError: error },
    }).catch(() => null);

    result = { integrationId, success: false, syncedAt: new Date().toISOString(), dataTypes: [], recordCount: 0, isDemo: false, error };

    await logAudit({
      actorId,
      action:     "HOTEL_INTEGRATION_SYNC_FAILED",
      targetType: "hotel_integration",
      targetId:   integrationId,
      metadata:   { error },
    }).catch(() => null);
  }

  return result;
}

// ─── Demo sync (no DB writes) ─────────────────────────────────────────────────

async function runDemoSync(id: string, _actorId: string): Promise<IntegrationSyncResult> {
  // Derive type from demo ID e.g. "demo-integration-pms" → "pms"
  const typeKey = id.replace(/^demo-integration-/, "").replace(/^demo-int-\d+$/, "");
  const adapter = getAdapter(typeKey) ?? getAdapter("pms")!;
  const raw     = await adapter.sync();

  return {
    integrationId: id,
    success:       true,
    syncedAt:      new Date().toISOString(),
    dataTypes:     raw.dataTypes,
    recordCount:   raw.recordCount,
    isDemo:        true,
  };
}

// ─── Health check ─────────────────────────────────────────────────────────────

export async function runHealthCheck(integrationId: string) {
  if (integrationId.startsWith("demo-integration-") || integrationId.startsWith("demo-int-")) {
    const typeKey = integrationId.replace(/^demo-integration-/, "");
    const adapter = getAdapter(typeKey) ?? getAdapter("pms")!;
    return { ...(await adapter.healthCheck()), isDemo: true };
  }

  const integration = await prisma.hotelIntegration.findUnique({ where: { id: integrationId } });
  if (!integration) return { healthy: false, latencyMs: 0, details: "Integration not found", isDemo: false };

  const adapter = getAdapter(integration.type);
  if (!adapter) return { healthy: false, latencyMs: 0, details: `No adapter for type: ${integration.type}`, isDemo: false };

  const result = await adapter.healthCheck();
  return { ...result, isDemo: false };
}
