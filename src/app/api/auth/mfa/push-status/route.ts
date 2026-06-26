import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { signPayload } from "@/lib/session-crypto";
import { redis } from "@/lib/redis";

type ChallengeData = {
  userId: string;
  number: number;
  status: "pending" | "approved" | "denied";
};

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const user = getSessionUserFromCookieStore(cookieStore);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const challengeId = searchParams.get("challengeId");
  if (!challengeId) return NextResponse.json({ error: "Missing challengeId" }, { status: 400 });

  const raw = await redis.get(`mfa:push:${challengeId}`);
  if (!raw) return NextResponse.json({ status: "expired" });

  const data = JSON.parse(raw) as ChallengeData;

  // Ownership check — prevent polling another user's challenge
  if (data.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (data.status === "approved") {
    // Delete challenge so it can't be reused
    await redis.del(`mfa:push:${challengeId}`);

    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    };

    const signed = signPayload(user.id);
    const response = NextResponse.json({ status: "approved" });
    response.cookies.set("mfa_verified", signed, cookieOptions);
    return response;
  }

  return NextResponse.json({ status: data.status });
}
