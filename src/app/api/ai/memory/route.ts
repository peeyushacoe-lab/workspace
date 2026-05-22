import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const storeSchema = z.object({
  type:    z.enum(["PREFERENCE", "PROJECT", "WORKFLOW", "CONTACT", "FACT"]).default("FACT"),
  content: z.string().min(1).max(4000),
  context: z.string().max(500).optional(),
  tags:    z.array(z.string()).optional().default([]),
  expiresAt: z.string().optional(),
});

/**
 * GET /api/ai/memory?type=&q=&limit=
 * Returns AI memories for the current user.
 */
export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const q = searchParams.get("q");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  const memories = await prisma.aIMemory.findMany({
    where: {
      userId: user.id,
      ...(type ? { type: type as never } : {}),
      ...(q ? { content: { contains: q, mode: "insensitive" } } : {}),
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json(memories);
}

/**
 * POST /api/ai/memory
 * Store a new memory for the current user.
 */
export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = storeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation error" }, { status: 400 });
  }

  const memory = await prisma.aIMemory.create({
    data: {
      userId:    user.id,
      type:      parsed.data.type as never,
      content:   parsed.data.content,
      context:   parsed.data.context ?? null,
      tags:      parsed.data.tags,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    },
  });

  return NextResponse.json(memory, { status: 201 });
}

/**
 * DELETE /api/ai/memory?id=
 * Delete a memory by ID.
 */
export async function DELETE(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const memory = await prisma.aIMemory.findFirst({ where: { id, userId: user.id } });
  if (!memory) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.aIMemory.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
