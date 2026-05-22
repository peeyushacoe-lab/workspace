import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

const conditionSchema = z.object({
  field: z.enum(["from", "to", "subject", "body"]),
  op: z.enum(["contains", "equals", "startsWith", "endsWith", "notContains"]),
  value: z.string().min(1),
});

const ruleSchema = z.object({
  name: z.string().min(1).max(100),
  isActive: z.boolean().optional().default(true),
  priority: z.number().int().min(0).max(100).optional().default(0),
  conditions: z.array(conditionSchema).min(1).max(10),
  action: z.enum(["LABEL", "MOVE_FOLDER", "MARK_READ", "STAR", "ARCHIVE", "TRASH", "FORWARD", "PRIORITY"]),
  actionData: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rules = await prisma.mailRule.findMany({
    where: { userId: user.id },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(rules);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = ruleSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation error" }, { status: 400 });
  }

  const rule = await prisma.mailRule.create({
    data: {
      userId: user.id,
      name: parsed.data.name,
      isActive: parsed.data.isActive,
      priority: parsed.data.priority,
      conditions: parsed.data.conditions,
      action: parsed.data.action,
      actionData: parsed.data.actionData ? (parsed.data.actionData as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });

  return NextResponse.json(rule, { status: 201 });
}
