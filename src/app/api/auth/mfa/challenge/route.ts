import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { authenticator } from "@otplib/preset-default";
import bcrypt from "bcrypt";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { signPayload } from "@/lib/session-crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const user = getSessionUserFromCookieStore(cookieStore);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mfaEnabled: true, mfaSecret: true, mfaBackupCodes: true },
  });

  if (!dbUser?.mfaEnabled || !dbUser.mfaSecret) {
    return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
  }

  // 5 attempts per 5 minutes — covers both TOTP and backup code brute-force
  const { allowed, retryAfter } = await checkRateLimit(`mfa-challenge:${user.id}`, 5, 5 * 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later.", retryAfter }, { status: 429 });
  }

  const body = await request.json() as { token?: string; isBackupCode?: boolean };
  const { token, isBackupCode } = body;

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  let verified = false;

  if (isBackupCode) {
    const codes = dbUser.mfaBackupCodes;
    let matchIndex = -1;

    for (let i = 0; i < codes.length; i++) {
      const match = await bcrypt.compare(token, codes[i]!);
      if (match) {
        matchIndex = i;
        break;
      }
    }

    if (matchIndex === -1) {
      return NextResponse.json({ error: "Invalid backup code" }, { status: 400 });
    }

    const remaining = codes.filter((_, i) => i !== matchIndex);
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaBackupCodes: remaining },
    });

    verified = true;
  } else {
    verified = authenticator.verify({ token, secret: dbUser.mfaSecret });
    if (!verified) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }
  }

  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  };

  // Bind the cookie to this specific user — prevents stolen cookie reuse across accounts
  const signed = signPayload(user.id);
  const response = NextResponse.json({ verified: true });
  response.cookies.set("mfa_verified", signed, cookieOptions);

  return response;
}
