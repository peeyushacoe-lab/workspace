import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission, can } from "@/lib/rbac/can";
import { logAudit } from "@/lib/audit";
import { canCreateClient } from "@/lib/clients";
import type { ClientStatus } from "@/generated/prisma/enums";

// Shared shape so the list and the detail view never disagree about a client.
const clientSelect = {
  id: true, name: true, legalName: true, region: true, industry: true,
  website: true, status: true, currency: true, startedAt: true, notes: true,
  primaryContactName: true, primaryContactEmail: true, primaryContactPhone: true,
  createdAt: true, updatedAt: true,
  owner: { select: { id: true, fullName: true, avatarUrl: true, customRole: true } },
  _count: { select: { deliverables: true, fees: true } },
} as const;

const createSchema = z.object({
  name: z.string().min(1, "Client name is required").max(200),
  legalName: z.string().max(200).optional(),
  region: z.string().max(80).optional(),
  industry: z.string().max(80).optional(),
  website: z.string().max(300).optional(),
  status: z.enum(["PROSPECT", "ACTIVE", "ON_HOLD", "CHURNED"]).optional(),
  ownerId: z.string().optional(),
  currency: z.string().length(3).optional(),
  startedAt: z.string().optional(),
  notes: z.string().max(5000).optional(),
  primaryContactName: z.string().max(200).optional(),
  primaryContactEmail: z.string().email().optional().or(z.literal("")),
  primaryContactPhone: z.string().max(60).optional(),
});

// GET /api/clients?status=&region=&owner=mine|all&search=
//
// Everyone with `clients.read` sees the whole book — a BM needs to know the UK
// exists even though they cannot edit it. Editability is returned per record so
// the UI never has to guess, and never shows an edit affordance that the API
// will then refuse.
export async function GET(req: NextRequest) {
  const auth = await requireApiPermission("clients.read");
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as ClientStatus | null;
  const region = searchParams.get("region");
  const owner = searchParams.get("owner");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = {};
  if (user.organizationId) where.organizationId = user.organizationId;
  if (status) where.status = status;
  if (region) where.region = region;
  if (owner === "mine") where.ownerId = user.id;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { legalName: { contains: search, mode: "insensitive" } },
      { primaryContactName: { contains: search, mode: "insensitive" } },
    ];
  }

  const [clients, canWrite, canAdmin, canSeeMoney, canManageMoney] = await Promise.all([
    prisma.client.findMany({
      where,
      select: clientSelect,
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: 500,
    }),
    can(user.id, "clients.write"),
    can(user.id, "clients.admin"),
    can(user.id, "clients.finance.read"),
    can(user.id, "clients.finance.manage"),
  ]);

  // Money is a separate permission from the client record, so a viewer without
  // `clients.finance.read` gets the book with no totals rather than a 403 on the
  // whole page. Aggregate in one grouped query, not per client.
  let totals: Record<string, { billedMinor: number; paidMinor: number }> = {};
  if (canSeeMoney && clients.length > 0) {
    const rows = await prisma.clientFee.groupBy({
      by: ["clientId"],
      where: {
        clientId: { in: clients.map((c) => c.id) },
        status: { not: "WRITTEN_OFF" },
      },
      _sum: { amountMinor: true, paidMinor: true },
    });
    totals = Object.fromEntries(
      rows.map((r) => [
        r.clientId,
        { billedMinor: r._sum.amountMinor ?? 0, paidMinor: r._sum.paidMinor ?? 0 },
      ]),
    );
  }

  return NextResponse.json({
    clients: clients.map((c) => ({
      ...c,
      canEdit: canAdmin || (canWrite && c.owner?.id === user.id),
      money: canSeeMoney ? (totals[c.id] ?? { billedMinor: 0, paidMinor: 0 }) : null,
    })),
    viewer: {
      id: user.id,
      canCreate: canWrite || canAdmin,
      canAdmin,
      canSeeMoney,
      canManageMoney,
      // Drives the whole "look, don't touch" UI: a viewer who can read but never
      // edit anything gets request buttons where edit buttons would be.
      isOversightOnly: !canWrite && !canAdmin,
    },
  });
}

// POST /api/clients — create a client.
export async function POST(req: NextRequest) {
  const auth = await requireApiPermission("clients.read");
  if ("error" in auth) return auth.error;
  const { user } = auth;

  if (!(await canCreateClient(user.id))) {
    return NextResponse.json(
      { error: "You can view the client book but not change it. Raise a request instead." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid client" },
      { status: 400 },
    );
  }
  const data = parsed.data;

  if (!user.organizationId) {
    return NextResponse.json(
      { error: "Your account is not attached to an organisation." },
      { status: 400 },
    );
  }

  // Only `clients.admin` may hand a new client to someone else; a Business
  // Manager creating a client owns it. Without this a BM could create records
  // in a peer's book and then be unable to edit what they just made.
  const isAdmin = await can(user.id, "clients.admin");
  const ownerId = isAdmin && data.ownerId ? data.ownerId : user.id;

  const client = await prisma.client.create({
    data: {
      organizationId: user.organizationId,
      name: data.name.trim(),
      legalName: data.legalName?.trim() || null,
      region: data.region?.trim() || null,
      industry: data.industry?.trim() || null,
      website: data.website?.trim() || null,
      status: data.status ?? "PROSPECT",
      ownerId,
      currency: data.currency?.toUpperCase() ?? "GBP",
      startedAt: data.startedAt ? new Date(data.startedAt) : null,
      notes: data.notes?.trim() || null,
      primaryContactName: data.primaryContactName?.trim() || null,
      primaryContactEmail: data.primaryContactEmail?.trim() || null,
      primaryContactPhone: data.primaryContactPhone?.trim() || null,
      createdById: user.id,
    },
    select: clientSelect,
  });

  await logAudit({
    actorId: user.id,
    action: "CLIENT_CREATED",
    targetType: "Client",
    targetId: client.id,
    metadata: { name: client.name, region: client.region, ownerId },
  });

  return NextResponse.json({ client: { ...client, canEdit: true } }, { status: 201 });
}
