import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const RP_ID = process.env.NEXT_PUBLIC_APP_URL
  ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname
  : "localhost";

const ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:3000`;

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const user = getSessionUserFromCookieStore(cookieStore);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await redis.get(`webauthn:reg:${user.id}`);
  if (!raw) return NextResponse.json({ error: "Registration session expired. Try again." }, { status: 400 });

  const { challenge } = JSON.parse(raw) as { challenge: string };
  await redis.del(`webauthn:reg:${user.id}`);

  const body = await req.json() as RegistrationResponseJSON & { name?: string };
  const passkeyName = body.name ?? "My passkey";

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Passkey verification failed." }, { status: 400 });
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  await prisma.passkey.create({
    data: {
      userId: user.id,
      name: passkeyName,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: body.response.transports ?? [],
    },
  });

  // Enable MFA on user account if not already
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: true },
  });

  const response = NextResponse.json({ verified: true });
  // Clear the onboarding gate cookie if present
  response.cookies.set("pending_mfa_setup", "", { maxAge: 0, path: "/" });
  return response;
}
