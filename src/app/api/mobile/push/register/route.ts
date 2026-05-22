import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileUser } from "@/lib/mobile-auth";

export async function POST(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { token?: string; platform?: string };
  const { token, platform = "unknown" } = body;
  if (!token?.startsWith("ExponentPushToken[")) {
    return NextResponse.json({ error: "Invalid Expo push token" }, { status: 400 });
  }

  await prisma.mobilePushToken.upsert({
    where: { token },
    create: { userId: user.userId, token, platform },
    update: { userId: user.userId, platform },
  });

  return NextResponse.json({ registered: true });
}

export async function DELETE(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { token?: string };
  if (!body.token) return NextResponse.json({ error: "token required" }, { status: 400 });

  await prisma.mobilePushToken.deleteMany({
    where: { token: body.token, userId: user.userId },
  }).catch(() => {});

  return NextResponse.json({ unregistered: true });
}
