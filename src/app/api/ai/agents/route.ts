import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";

const MGMT_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;

const createSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type:        z.enum(["INBOX_TRIAGE", "SCHEDULING", "KNOWLEDGE", "COMPLIANCE"]),
  isActive:    z.boolean().optional().default(true),
  config:      z.record(z.string(), z.unknown()).optional(),
});

/**
 * GET /api/ai/agents
 * List AI agents. All users can view; management can manage.
 */
export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const agents = await prisma.aIAgent.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { runs: true } },
    },
  });

  return NextResponse.json(agents);
}

/**
 * POST /api/ai/agents
 * Create a new AI agent. Management only.
 */
export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!MGMT_ROLES.includes(user.role as (typeof MGMT_ROLES)[number])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation error" }, { status: 400 });
  }

  const agent = await prisma.aIAgent.create({
    data: {
      name:        parsed.data.name,
      description: parsed.data.description ?? null,
      type:        parsed.data.type,
      isActive:    parsed.data.isActive,
      config:      parsed.data.config ? (parsed.data.config as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });

  return NextResponse.json(agent, { status: 201 });
}
