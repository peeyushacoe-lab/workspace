import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const cookieStore = await cookies();
  const user = getSessionUserFromCookieStore(cookieStore);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentToken = cookieStore.get("cybersage_session")?.value;

  const result = await prisma.userSession.deleteMany({
    where: {
      userId: user.id,
      ...(currentToken ? { token: { not: currentToken } } : {}),
    },
  });

  return NextResponse.json({ revoked: result.count });
}
