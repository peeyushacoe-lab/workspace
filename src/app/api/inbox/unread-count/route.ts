import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCached, setCached, withETag } from "@/lib/cache";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ count: 0 });

  const cacheKey = `unread:${user.id}`;

  try {
    const cached = await getCached<{ count: number }>(cacheKey);

    let count: number;
    if (cached !== null) {
      count = cached.count;
    } else {
      count = await prisma.inboxMessage.count({
        where: {
          isRead: false,
          thread: { mailbox: { accessLogs: { some: { userId: user.id } } } },
        },
      });
      await setCached(cacheKey, { count }, 15);
    }

    const { notModified, etag } = withETag({ count }, null);
    void notModified;
    const response = NextResponse.json({ count });
    response.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=20");
    response.headers.set("ETag", etag);
    return response;
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
