import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const RP_NAME = "Nexus — Cybersage";
const RP_ID = process.env.NEXT_PUBLIC_APP_URL
  ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname
  : "localhost";

export async function POST(_req: NextRequest) {
  const cookieStore = await cookies();
  const user = getSessionUserFromCookieStore(cookieStore);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch existing passkeys so we exclude them (prevents re-registering same device)
  const existingPasskeys = await prisma.passkey.findMany({
    where: { userId: user.id },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: user.email,
    userDisplayName: user.fullName,
    attestationType: "none",
    excludeCredentials: existingPasskeys.map((p: { credentialId: string; transports: string[] }) => ({
      id: p.credentialId,
      transports: p.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required", // biometric / PIN required
    },
  });

  // Store challenge in Redis — 5 min TTL, tied to user
  await redis.set(
    `webauthn:reg:${user.id}`,
    JSON.stringify({ challenge: options.challenge }),
    "EX",
    300,
  );

  return NextResponse.json(options);
}
