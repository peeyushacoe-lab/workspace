import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

const ACCESS_TTL = 60 * 60;

function sign(payload: object, ttl: number) {
  const secret = process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? "cybersage-mobile-secret";
  return jwt.sign(payload, secret, { expiresIn: ttl });
}

function verify(token: string) {
  const secret = process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? "cybersage-mobile-secret";
  return jwt.verify(token, secret) as { userId: string };
}

export async function POST(request: Request) {
  const body = await request.json() as { refreshToken?: string };
  if (!body.refreshToken) {
    return NextResponse.json({ error: "Missing refresh token" }, { status: 400 });
  }

  let decoded: { userId: string };
  try {
    decoded = verify(body.refreshToken);
  } catch {
    return NextResponse.json({ error: "Invalid or expired refresh token" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true, email: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    return NextResponse.json({ error: "User not found or inactive" }, { status: 401 });
  }

  const accessToken = sign(
    { userId: user.id, email: user.email, role: user.role },
    ACCESS_TTL,
  );

  return NextResponse.json({ accessToken, expiresIn: ACCESS_TTL });
}
