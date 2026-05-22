import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

const ACCESS_TTL  = 60 * 60;        // 1 hour
const REFRESH_TTL = 60 * 60 * 24 * 30; // 30 days

function sign(payload: object, ttl: number) {
  const secret = process.env.JWT_SECRET ?? process.env.SESSION_SECRET ?? "cybersage-mobile-secret";
  return jwt.sign(payload, secret, { expiresIn: ttl });
}

export async function POST(request: Request) {
  const body = await request.json() as unknown;
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true, email: true, fullName: true, role: true,
      customRole: true, avatarUrl: true, mfaEnabled: true,
      passwordHash: true, isActive: true,
    },
  });

  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  if (!user.passwordHash) {
    return NextResponse.json({ error: "Account has no password set" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  if (user.mfaEnabled) {
    // Signal to mobile to prompt for TOTP
    const mfaToken = sign({ userId: user.id, mfaPending: true }, 300); // 5 min
    return NextResponse.json({ mfaRequired: true, mfaToken }, { status: 200 });
  }

  const tokenPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  const accessToken  = sign(tokenPayload, ACCESS_TTL);
  const refreshToken = sign({ userId: user.id }, REFRESH_TTL);

  // Store refresh token hash in DB for revocation
  await prisma.userSession.create({
    data: {
      userId:    user.id,
      token:     Buffer.from(refreshToken).toString("base64").slice(0, 64),
      expiresAt: new Date(Date.now() + REFRESH_TTL * 1000),
      userAgent: request.headers.get("user-agent") ?? "mobile",
      ipAddress: request.headers.get("x-forwarded-for") ?? null,
    },
  }).catch(() => {}); // non-fatal

  const { passwordHash: _, ...safeUser } = user;
  void _;

  return NextResponse.json({
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TTL,
    user: safeUser,
  });
}
