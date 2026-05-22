import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ count: 0 });

  try {
    const isPrivileged = ["ADMIN", "CEO", "CISO"].includes(user.role);

    const count = await prisma.inboxMessage.count({
      where: {
        isRead: false,
        thread: isPrivileged 
          ? {} 
          : {
              mailbox: {
                accessLogs: { some: { userId: user.id } }
              }
            }
      }
    });

    const response = NextResponse.json({ count });
    response.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=20");
    return response;
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
