import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const RP_ID = process.env.NEXT_PUBLIC_APP_URL
  ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname
  : "localhost";

export async function POST(_req: NextRequest) {
  const cookieStore = await cookies();
  const user = getSessionUserFromCookieStore(cookieStore);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const passkeys = await prisma.passkey.findMany({
    where: { userId: user.id },
    select: { credentialId: true, transports: true },
  });

  if (passkeys.length === 0) {
    return NextResponse.json({ error: "No passkeys registered. Set one up in Settings → Security." }, { status: 400 });
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "required",
    allowCredentials: passkeys.map((p: { credentialId: string; transports: string[] }) => ({
      id: p.credentialId,
      transports: p.transports as AuthenticatorTransportFuture[],
    })),
  });

  await redis.set(
    `webauthn:auth:${user.id}`,
    JSON.stringify({ challenge: options.challenge }),
    "EX",
    300,
  );

  return NextResponse.json(options);
}
