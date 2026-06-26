import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { signPayload } from "@/lib/session-crypto";

const RP_ID = process.env.NEXT_PUBLIC_APP_URL
  ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname
  : "localhost";

const ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const user = getSessionUserFromCookieStore(cookieStore);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await redis.get(`webauthn:auth:${user.id}`);
  if (!raw) return NextResponse.json({ error: "Session expired. Please try again." }, { status: 400 });

  const { challenge } = JSON.parse(raw) as { challenge: string };
  await redis.del(`webauthn:auth:${user.id}`);

  const body = await req.json() as AuthenticationResponseJSON;

  // Look up the passkey being used
  const passkey = await prisma.passkey.findUnique({
    where: { credentialId: body.id },
  });

  if (!passkey || passkey.userId !== user.id) {
    return NextResponse.json({ error: "Passkey not found." }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: Number(passkey.counter),
        transports: passkey.transports as never,
      },
      requireUserVerification: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "Passkey verification failed." }, { status: 400 });
  }

  // Update counter (replay attack prevention) and lastUsedAt
  await prisma.passkey.update({
    where: { id: passkey.id },
    data: {
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    },
  });

  // Set mfa_verified cookie — same pattern as TOTP challenge
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  };

  const signed = signPayload(user.id);
  const response = NextResponse.json({ verified: true });
  response.cookies.set("mfa_verified", signed, cookieOptions);
  return response;
}
