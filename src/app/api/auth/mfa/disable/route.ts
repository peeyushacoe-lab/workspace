import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { authenticator } from "@otplib/preset-default";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const user = getSessionUserFromCookieStore(cookieStore);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mfaEnabled: true, mfaSecret: true },
  });

  if (!dbUser?.mfaEnabled || !dbUser.mfaSecret) {
    return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
  }

  const body = await request.json() as { token?: string };
  const { token } = body;

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const isValid = authenticator.verify({ token, secret: dbUser.mfaSecret });
  if (!isValid) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: [],
    },
  });

  return NextResponse.json({ success: true });
}
