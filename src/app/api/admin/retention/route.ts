import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["ADMIN", "CEO", "CISO"] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

// Retention policies are stored as AuditLog rows with action = "RETENTION_POLICY"
// metadata shape: { op: "SET" | "DELETE", policy: RetentionPolicy }
// The latest authoritative SET (or DELETE) per policyId wins.

export type RetentionPolicy = {
  id: string;          // stable client-generated id
  module: "Mail" | "Chat" | "Drive" | "Calendar";
  days: number;
  action: "Delete" | "Archive";
  active: boolean;
  updatedAt: string;
};

type PolicyLogMetadata = {
  op: "SET" | "DELETE";
  policy: RetentionPolicy;
};

function isAdminRole(role: string): role is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

// Derive current policy state from AuditLog history
async function loadPolicies(): Promise<Map<string, RetentionPolicy>> {
  const logs = await prisma.auditLog.findMany({
    where: { action: "RETENTION_POLICY" },
    orderBy: { createdAt: "asc" },
    select: { metadata: true, createdAt: true },
  });

  const policies = new Map<string, RetentionPolicy>();

  for (const log of logs) {
    const meta = log.metadata as PolicyLogMetadata | null;
    if (!meta?.op || !meta?.policy?.id) continue;

    if (meta.op === "SET") {
      policies.set(meta.policy.id, meta.policy);
    } else if (meta.op === "DELETE") {
      policies.delete(meta.policy.id);
    }
  }

  return policies;
}

// GET /api/admin/retention
export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const policies = await loadPolicies();
  return NextResponse.json(Array.from(policies.values()));
}

// POST /api/admin/retention — create or update a policy
export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as Partial<RetentionPolicy>;

  const { id, module, days, action, active } = body;

  if (!module || !["Mail", "Chat", "Drive", "Calendar"].includes(module)) {
    return NextResponse.json({ error: "Invalid module" }, { status: 400 });
  }
  if (typeof days !== "number" || days < 1 || days > 36500) {
    return NextResponse.json({ error: "Days must be between 1 and 36500" }, { status: 400 });
  }
  if (!action || !["Delete", "Archive"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const policyId = id ?? `rp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const policy: RetentionPolicy = {
    id: policyId,
    module,
    days,
    action,
    active: active ?? true,
    updatedAt: new Date().toISOString(),
  };

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "RETENTION_POLICY",
      targetType: "RETENTION_POLICY",
      targetId: policyId,
      metadata: { op: "SET", policy } as object,
    },
  });

  return NextResponse.json(policy, { status: 201 });
}

// DELETE /api/admin/retention?id=<policyId>
export async function DELETE(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const policyId = searchParams.get("id");
  if (!policyId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const policies = await loadPolicies();
  const existing = policies.get(policyId);
  if (!existing) return NextResponse.json({ error: "Policy not found" }, { status: 404 });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "RETENTION_POLICY",
      targetType: "RETENTION_POLICY",
      targetId: policyId,
      metadata: { op: "DELETE", policy: existing } as object,
    },
  });

  return NextResponse.json({ ok: true });
}
