import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCached, setCached, withETag } from "@/lib/cache";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ count: 0 });

  const cacheKey = `unread:${user.id}`;
  const userEmail = user.email.toLowerCase();

  try {
    const cached = await getCached<{ count: number }>(cacheKey);

    let count: number;
    if (cached !== null) {
      count = cached.count;
    } else {
      // Count unread THREADS (not messages) so the sidebar badge always agrees
      // with the inbox folder badge. Mirrors the inbox folder filter exactly:
      // own mailbox OR delegated access, exclude trashed/archived, exclude
      // self-sent messages and bounce-tracking addresses.
      count = await prisma.inboxThread.count({
        where: {
          isTrashed: false,
          isArchived: false,
          OR: [
            { mailbox: { email: userEmail } },
            { mailbox: { accessLogs: { some: { userId: user.id } } } },
          ],
          messages: {
            some: {
              isRead: false,
              NOT: { from: { equals: userEmail, mode: "insensitive" } },
              from: { not: { contains: "@send." } },
            },
          },
        },
      });
      await setCached(cacheKey, { count }, 15);
    }

    const { notModified, etag } = withETag({ count }, null);
    void notModified;
    const response = NextResponse.json({ count });
    // No browser caching — stale badge counts were sticking after reads.
    // Freshness is handled by the 15s Redis cache + invalidation on mark-read.
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("ETag", etag);
    return response;
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
