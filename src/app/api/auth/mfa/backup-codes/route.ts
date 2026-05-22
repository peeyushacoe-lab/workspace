import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { authenticator } from "@otplib/preset-default";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const user = getSessionUserFromCookieStore(cookieStore);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3 regenerations per hour — prevents backup code cycling attacks
  const { allowed, retryAfter } = await checkRateLimit(`mfa-backup-regen:${user.id}`, 3, 60 * 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later.", retryAfter }, { status: 429 });
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

  const plainCodes = Array.from({ length: 8 }, () =>
    crypto.randomBytes(4).toString("hex")
  );

  const hashedCodes = await Promise.all(
    plainCodes.map((code) => bcrypt.hash(code, 12))
  );

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaBackupCodes: hashedCodes },
  });

  return NextResponse.json({ success: true, backupCodes: plainCodes });
}
