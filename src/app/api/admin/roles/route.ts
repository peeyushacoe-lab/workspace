import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const roleSchema = z.object({
  name:        z.string().min(1).max(60),
  description: z.string().max(200).optional(),
  isSingleton: z.boolean().optional(),
  color:       z.string().max(20).optional(),
});

function requireAdmin() {
  // Only ADMIN / CEO / CISO can manage roles
}

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roles = await prisma.customRole.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(roles);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "CEO", "CISO"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  requireAdmin();

  try {
    const body = await request.json() as unknown;
    const data = roleSchema.parse(body);

    const role = await prisma.customRole.create({ data });
    return NextResponse.json(role, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: err.issues }, { status: 400 });
    }
    if ((err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
    }
    console.error("[admin/roles POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
