import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const approval = await prisma.approvalFlow.findUnique({ where: { id } });
  if (!approval) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (approval.approverId !== user.id) {
    return NextResponse.json({ error: "Only the designated approver can decide" }, { status: 403 });
  }
  if (approval.status !== "PENDING") {
    return NextResponse.json({ error: "Already decided" }, { status: 400 });
  }

  const body = await request.json() as { decision: "APPROVED" | "REJECTED"; note?: string };
  if (!["APPROVED", "REJECTED"].includes(body.decision)) {
    return NextResponse.json({ error: "decision must be APPROVED or REJECTED" }, { status: 400 });
  }

  const updated = await prisma.approvalFlow.update({
    where: { id },
    data: { status: body.decision, decidedAt: new Date(), note: body.note ?? null },
  });

  // Notify requester
  await prisma.notification.create({
    data: {
      userId: approval.requesterId,
      type: "SYSTEM",
      title: `Approval ${body.decision === "APPROVED" ? "Approved" : "Rejected"}`,
      body: `"${approval.title}" was ${body.decision.toLowerCase()} by ${user.fullName}`,
      link: "/admin?tab=approvals",
    },
  }).catch(() => {});

  return NextResponse.json(updated);
}
