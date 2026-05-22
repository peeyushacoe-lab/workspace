import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") ?? "pending"; // pending | sent | all

  const where =
    view === "sent"
      ? { requesterId: user.id }
      : view === "all"
        ? { OR: [{ requesterId: user.id }, { approverId: user.id }] }
        : { approverId: user.id, status: "PENDING" };

  const approvals = await prisma.approvalFlow.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(approvals);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    title: string;
    description?: string;
    approverId: string;
    resourceType?: string;
    resourceId?: string;
    dueAt?: string;
    metadata?: Record<string, unknown>;
  };

  if (!body.title || !body.approverId) {
    return NextResponse.json({ error: "title and approverId required" }, { status: 400 });
  }

  const approval = await prisma.approvalFlow.create({
    data: {
      title: body.title,
      description: body.description ?? null,
      requesterId: user.id,
      approverId: body.approverId,
      resourceType: body.resourceType ?? null,
      resourceId: body.resourceId ?? null,
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
      metadata: (body.metadata ?? undefined) as never,
    },
  });

  // Notify the approver
  await prisma.notification.create({
    data: {
      userId: body.approverId,
      type: "SYSTEM",
      title: "Approval Request",
      body: `${user.fullName} is requesting your approval: "${body.title}"`,
      link: "/admin?tab=approvals",
    },
  }).catch(() => {});

  return NextResponse.json(approval, { status: 201 });
}
