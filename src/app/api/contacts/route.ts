import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessPath } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canAccessPath(currentUser, "/contacts")) {
    return NextResponse.json(
      { error: "Unauthorized", contacts: [] },
      { status: currentUser ? 403 : 401 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ contacts: [] });
  }

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") || "100");
  const offset = parseInt(url.searchParams.get("offset") || "0");

  const contacts = await prisma.contact.findMany({
    take: limit,
    skip: offset,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const response = NextResponse.json({ contacts });
  response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
  return response;
}