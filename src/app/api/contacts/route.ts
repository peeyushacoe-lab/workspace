import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessPath } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { getCached, setCached, withETag } from "@/lib/cache";

export async function GET(request: NextRequest) {
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
  const cacheKey = `contacts:${currentUser.id}:${offset}:${limit}`;
  const ifNoneMatch = request.headers.get("if-none-match");

  const cached = await getCached<{ contacts: unknown[] }>(cacheKey);
  const contacts = cached?.contacts ?? await (async () => {
    const rows = await prisma.contact.findMany({
      take: limit, skip: offset, orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, status: true, createdAt: true, updatedAt: true },
    });
    await setCached(cacheKey, { contacts: rows }, 30);
    return rows;
  })();

  const { notModified, etag } = withETag({ contacts }, ifNoneMatch);
  if (notModified) return new NextResponse(null, { status: 304, headers: { ETag: etag } });

  const response = NextResponse.json({ contacts });
  response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
  response.headers.set("ETag", etag);
  return response;
}