import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { getTokensForUser, sendExpoPush } from "@/lib/expo-push";

const CHALLENGE_TTL = 5 * 60; // 5 minutes

function randomTwoDigit(): number {
  return Math.floor(Math.random() * 90) + 10; // 10–99
}

function generateDecoys(correct: number): number[] {
  const decoys: number[] = [];
  while (decoys.length < 2) {
    const n = randomTwoDigit();
    if (n !== correct && !decoys.includes(n)) decoys.push(n);
  }
  return decoys;
}

export async function POST(_request: NextRequest) {
  const cookieStore = await cookies();
  const user = getSessionUserFromCookieStore(cookieStore);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const challengeId = randomUUID();
  const number = randomTwoDigit();
  const decoys = generateDecoys(number);
  // Shuffle: all three options shown on mobile in random order
  const options = [number, ...decoys].sort(() => Math.random() - 0.5);

  await redis.set(
    `mfa:push:${challengeId}`,
    JSON.stringify({ userId: user.id, number, status: "pending" }),
    "EX",
    CHALLENGE_TTL,
  );

  // Send push notification to all registered mobile devices
  const tokens = await getTokensForUser(user.id);
  if (tokens.length > 0) {
    await sendExpoPush(tokens, {
      title: "Sign-in request — Nexus",
      body: `Approve your sign-in. Match the number shown on screen.`,
      data: {
        type: "mfa_challenge",
        challengeId,
        number,
        options,
        screen: "mfa-approve",
      },
      sound: "default",
    });
  }

  return NextResponse.json({ challengeId, number, hasPush: tokens.length > 0 });
}
