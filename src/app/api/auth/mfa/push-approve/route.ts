import { NextResponse, type NextRequest } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { redis } from "@/lib/redis";

type ChallengeData = {
  userId: string;
  number: number;
  status: "pending" | "approved" | "denied";
};

export async function POST(request: NextRequest) {
  // This endpoint is called by the mobile app — uses JWT auth
  const mobileUser = await getMobileUser(request);
  if (!mobileUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { challengeId?: string; selectedNumber?: number; action?: "deny" };
  const { challengeId, selectedNumber, action } = body;

  if (!challengeId) return NextResponse.json({ error: "Missing challengeId" }, { status: 400 });

  const key = `mfa:push:${challengeId}`;
  const raw = await redis.get(key);
  if (!raw) return NextResponse.json({ error: "Challenge expired or not found" }, { status: 404 });

  const data = JSON.parse(raw) as ChallengeData;

  // Ownership check — only the user the challenge was issued for can approve it
  if (data.userId !== mobileUser.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (data.status !== "pending") {
    return NextResponse.json({ error: "Challenge already resolved" }, { status: 409 });
  }

  if (action === "deny") {
    data.status = "denied";
    await redis.set(key, JSON.stringify(data), "EX", 60);
    return NextResponse.json({ result: "denied" });
  }

  if (selectedNumber === undefined) {
    return NextResponse.json({ error: "Missing selectedNumber" }, { status: 400 });
  }

  const correct = selectedNumber === data.number;
  data.status = correct ? "approved" : "denied";

  // Keep the key alive for a short window so the web poller can pick up the result
  await redis.set(key, JSON.stringify(data), "EX", 60);

  return NextResponse.json({ result: data.status });
}
