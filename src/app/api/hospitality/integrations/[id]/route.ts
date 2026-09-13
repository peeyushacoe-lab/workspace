import { NextRequest, NextResponse } from "next/server";
import { requireHospitalityApi } from "@/lib/hospitality/access";
import { prisma }                    from "@/lib/prisma";
import { logAudit }                  from "@/lib/audit";
import { getAdapter }                from "@/lib/hospitality/adapters/index";
import { getDemoIntegrationsFull }   from "@/lib/hospitality/demo-data";

const FORBIDDEN_CONFIG_KEYS = [
  "apiKey", "api_key", "password", "secret", "token", "accessToken",
  "access_token", "clientSecret", "client_secret", "credentials", "privateKey",
];

function hasForbiddenKeys(config: Record<string, unknown>): boolean {
  const keys = Object.keys(config).map(k => k.toLowerCase());
  return FORBIDDEN_CONFIG_KEYS.some(f => keys.includes(f.toLowerCase()));
}

async function getIntegrationSecure(id: string, orgId: string | null) {
  const row = await prisma.hotelIntegration.findUnique({
    where:   { id },
    include: { property: { select: { id: true, name: true, organizationId: true } } },
  });
  if (!row) return null;
  if (row.property.organizationId !== orgId) return null;
  return row;
}

// ─── GET /api/hospitality/integrations/[id] ───────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireHospitalityApi();
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id }   = await params;

  if (id.startsWith("demo-integration-") || id.startsWith("demo-int-")) {
    const demo = getDemoIntegrationsFull().find(i => i.id === id);
    if (!demo) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ integration: demo, isDemo: true });
  }

  try {
    const row = await getIntegrationSecure(id, user.organizationId ?? null);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const adapter = getAdapter(row.type);

    const integration = {
      id:           row.id,
      propertyId:   row.property.id,
      propertyName: row.property.name,
      type:         row.type,
      category:     adapter?.category ?? "OTHER",
      label:        row.label,
      status:       row.status,
      dataTypes:    adapter?.supportedDataTypes ?? [],
      lastSyncAt:   row.lastSyncAt?.toISOString() ?? null,
      lastError:    row.lastError,
      isDemo:       false,
      createdAt:    row.createdAt.toISOString(),
      updatedAt:    row.updatedAt.toISOString(),
      // config is intentionally omitted — never return to client
    };

    return NextResponse.json({ integration, isDemo: false });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// ─── PATCH /api/hospitality/integrations/[id] ─────────────────────────────────
// Body: { action: "enable"|"disable"|"disconnect"|"updateLabel", label?, config? }

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireHospitalityApi("manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;
  const { id }   = await params;

  if (id.startsWith("demo-integration-") || id.startsWith("demo-int-")) {
    return NextResponse.json({ error: "Demo integrations cannot be modified" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: "action required" }, { status: 400 });

  // Reject any config containing plaintext secrets.
  if (body.config && typeof body.config === "object" && hasForbiddenKeys(body.config)) {
    return NextResponse.json(
      { error: "Config must not contain API keys, passwords, or secrets in plaintext." },
      { status: 422 },
    );
  }

  try {
    const row = await getIntegrationSecure(id, user.organizationId ?? null);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let updates: Record<string, unknown> = {};
    switch (body.action) {
      case "enable":
        updates = { status: "demo" };
        break;
      case "disable":
        updates = { status: "disabled" };
        break;
      case "disconnect":
        updates = { status: "disconnected", config: null };
        break;
      case "updateLabel":
        if (!body.label) return NextResponse.json({ error: "label required" }, { status: 400 });
        updates = { label: body.label };
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    await prisma.hotelIntegration.update({ where: { id }, data: updates });

    await logAudit({
      actorId:    user.id,
      action:     "HOTEL_INTEGRATION_UPDATED",
      targetType: "hotel_integration",
      targetId:   id,
      metadata:   { action: body.action },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
