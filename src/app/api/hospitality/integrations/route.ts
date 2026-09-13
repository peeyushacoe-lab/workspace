import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission }      from "@/lib/rbac/can";
import { prisma }                    from "@/lib/prisma";
import { logAudit }                  from "@/lib/audit";
import { getAdapter }                from "@/lib/hospitality/adapters/index";
import { getDemoIntegrationsFull }   from "@/lib/hospitality/demo-data";

// Secret-bearing fields that must never be stored or returned in plaintext.
const FORBIDDEN_CONFIG_KEYS = [
  "apiKey", "api_key", "password", "secret", "token", "accessToken",
  "access_token", "clientSecret", "client_secret", "credentials", "privateKey",
];

function hasForbiddenKeys(config: Record<string, unknown>): boolean {
  const keys = Object.keys(config).map(k => k.toLowerCase());
  return FORBIDDEN_CONFIG_KEYS.some(f => keys.includes(f.toLowerCase()));
}

// Build a safe HotelIntegrationFull for the response — never include raw config.
function toFull(
  row: {
    id: string; type: string; label: string; status: string;
    lastSyncAt: Date | null; lastError: string | null;
    createdAt: Date; updatedAt: Date;
    property: { id: string; name: string };
  }
) {
  const adapter   = getAdapter(row.type);
  return {
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
  };
}

// ─── GET /api/hospitality/integrations ───────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireApiPermission("hospitality.view");
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const propertyId = req.nextUrl.searchParams.get("propertyId");

  try {
    // Check if org has any real hotel properties.
    const properties = await prisma.hotelProperty.findMany({
      where: { organizationId: user.organizationId ?? undefined },
      select: { id: true },
    });

    if (!properties.length) {
      return NextResponse.json({ integrations: getDemoIntegrationsFull(), isDemo: true });
    }

    const propertyIds = propertyId
      ? [propertyId]
      : properties.map(p => p.id);

    const rows = await prisma.hotelIntegration.findMany({
      where: { propertyId: { in: propertyIds } },
      include: { property: { select: { id: true, name: true, organizationId: true } } },
      orderBy: { createdAt: "asc" },
    });

    // Filter out any that don't belong to this org (belt-and-suspenders).
    const safe = rows.filter(r => r.property.organizationId === (user.organizationId ?? null));
    return NextResponse.json({ integrations: safe.map(toFull), isDemo: false });
  } catch {
    return NextResponse.json({ integrations: getDemoIntegrationsFull(), isDemo: true });
  }
}

// ─── POST /api/hospitality/integrations ──────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireApiPermission("hospitality.manage");
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const body = await req.json().catch(() => null);
  if (!body?.propertyId || !body?.type || !body?.label) {
    return NextResponse.json({ error: "propertyId, type, and label are required" }, { status: 400 });
  }

  // Reject demo property IDs.
  if (String(body.propertyId).startsWith("demo-")) {
    return NextResponse.json({ error: "Cannot create integrations for demo properties" }, { status: 400 });
  }

  // Reject config with plaintext secrets.
  if (body.config && typeof body.config === "object" && hasForbiddenKeys(body.config)) {
    return NextResponse.json(
      { error: "Config must not contain API keys, passwords, or secrets in plaintext. Use a secure vault instead." },
      { status: 422 },
    );
  }

  try {
    const property = await prisma.hotelProperty.findUnique({ where: { id: body.propertyId } });
    if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });
    if (property.organizationId !== (user.organizationId ?? null)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const adapter = getAdapter(body.type);

    const integration = await prisma.hotelIntegration.create({
      data: {
        propertyId: body.propertyId,
        type:       body.type,
        label:      body.label,
        status:     "demo",
        // config intentionally omitted — never store plaintext credentials in V1
      },
      include: { property: { select: { id: true, name: true, organizationId: true } } },
    });

    await logAudit({
      actorId:    user.id,
      action:     "HOTEL_INTEGRATION_CREATED",
      targetType: "hotel_integration",
      targetId:   integration.id,
      metadata:   { type: body.type, label: body.label, propertyId: body.propertyId },
    });

    return NextResponse.json(
      { integration: { ...toFull(integration), category: adapter?.category ?? "OTHER" } },
      { status: 201 },
    );
  } catch (e: unknown) {
    // Unique constraint: propertyId + type already exists.
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "An integration of this type already exists for the property" }, { status: 409 });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
