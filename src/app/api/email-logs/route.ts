import { NextResponse } from "next/server";
import { Prisma, type EmailStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { canAccessPath } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canAccessPath(currentUser, "/dashboard")) {
    return NextResponse.json(
      { error: "Unauthorized", logs: [] },
      { status: currentUser ? 403 : 401 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ logs: [] });
  }

  const url = new URL(request.url);
  const campaignId = url.searchParams.get("campaignId");
  const status = url.searchParams.get("status");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  const where: Prisma.EmailLogWhereInput = {};
  if (campaignId) where.campaignId = campaignId;
  if (status) where.status = status as EmailStatus;

  const logs = await prisma.emailLog.findMany({
    where,
    take: limit,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      recipient: true,
      subject: true,
      status: true,
      error: true,
      resendId: true,
      createdAt: true,
      contact: { select: { id: true, name: true, email: true } },
      campaign: { select: { id: true, title: true } },
    },
  });

  const response = NextResponse.json({ logs });
  response.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=20");
  return response;
}