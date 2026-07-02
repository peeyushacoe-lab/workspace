import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  LEAVE_ALLOWANCES,
  LEAVE_TYPES,
  businessDaysBetween,
  holidaySetForYear,
  isHRManager,
  leaveUsedByType,
} from "@/lib/hr";

const USER_SELECT = { id: true, fullName: true, email: true, avatarUrl: true, role: true } as const;

// GET /api/hr/leave            → my requests + balances
// GET /api/hr/leave?scope=all  → all requests (HR managers only), ?status=PENDING filter
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope");
  const status = searchParams.get("status");
  const year = new Date().getUTCFullYear();

  if (scope === "all") {
    if (!isHRManager(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const requests = await prisma.leaveRequest.findMany({
      where: status ? { status: status as never } : undefined,
      include: { user: { select: USER_SELECT }, reviewer: { select: USER_SELECT } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ requests });
  }

  const [requests, used] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { userId: user.id },
      include: { reviewer: { select: USER_SELECT } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    leaveUsedByType(user.id, year),
  ]);

  const balances = LEAVE_TYPES.map((t) => ({
    type: t,
    allowance: LEAVE_ALLOWANCES[t],
    used: used[t] ?? 0,
    remaining: LEAVE_ALLOWANCES[t] == null ? null : Math.max(0, (LEAVE_ALLOWANCES[t] ?? 0) - (used[t] ?? 0)),
  }));

  return NextResponse.json({ requests, balances, year });
}

// POST /api/hr/leave — create a leave request { type, startDate, endDate, reason? }
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || !LEAVE_TYPES.includes(body.type) || !body.startDate || !body.endDate) {
    return NextResponse.json({ error: "type, startDate and endDate are required" }, { status: 400 });
  }

  const start = new Date(body.startDate + "T00:00:00.000Z");
  const end = new Date(body.endDate + "T00:00:00.000Z");
  if (isNaN(+start) || isNaN(+end) || end < start) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const holidays = await holidaySetForYear(start.getUTCFullYear());
  const days = businessDaysBetween(start, end, holidays);
  if (days <= 0) return NextResponse.json({ error: "Range contains no working days" }, { status: 400 });

  // Overlap check against own pending/approved requests
  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      userId: user.id,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: end },
      endDate: { gte: start },
    },
  });
  if (overlap) return NextResponse.json({ error: "Overlaps an existing pending/approved request" }, { status: 409 });

  // Balance check for tracked types
  const allowance = LEAVE_ALLOWANCES[body.type as string];
  if (allowance != null) {
    const used = await leaveUsedByType(user.id, start.getUTCFullYear());
    if ((used[body.type] ?? 0) + days > allowance) {
      return NextResponse.json(
        { error: `Insufficient ${String(body.type).toLowerCase()} balance (${allowance - (used[body.type] ?? 0)} day(s) left)` },
        { status: 400 },
      );
    }
  }

  const created = await prisma.leaveRequest.create({
    data: {
      userId: user.id,
      type: body.type,
      startDate: start,
      endDate: end,
      days,
      reason: typeof body.reason === "string" ? body.reason.slice(0, 1000) : null,
    },
  });

  // Notify HR managers
  const managers = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "CEO", "COO", "OPS_MANAGER"] as never[] }, isActive: true },
    select: { id: true },
  });
  await Promise.all(
    managers.map((m) =>
      prisma.notification
        .create({
          data: {
            userId: m.id,
            type: "SYSTEM",
            title: "Leave request",
            body: `${user.fullName} requested ${days} day(s) ${String(body.type).toLowerCase()} leave`,
            link: "/admin/hr?tab=leave",
          },
        })
        .catch(() => {}),
    ),
  );

  return NextResponse.json(created, { status: 201 });
}

// PATCH /api/hr/leave — { id, action: "approve" | "reject" | "cancel", note? }
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.id || !["approve", "reject", "cancel"].includes(body.action)) {
    return NextResponse.json({ error: "id and valid action required" }, { status: 400 });
  }

  const req = await prisma.leaveRequest.findUnique({ where: { id: body.id } });
  if (!req) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "cancel") {
    if (req.userId !== user.id && !isHRManager(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (req.status !== "PENDING" && req.status !== "APPROVED") {
      return NextResponse.json({ error: "Only pending/approved requests can be cancelled" }, { status: 400 });
    }
    const updated = await prisma.leaveRequest.update({ where: { id: req.id }, data: { status: "CANCELLED" } });
    return NextResponse.json(updated);
  }

  // approve / reject — HR managers only, not on own request
  if (!isHRManager(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (req.userId === user.id) return NextResponse.json({ error: "Cannot review your own request" }, { status: 400 });
  if (req.status !== "PENDING") return NextResponse.json({ error: "Request already reviewed" }, { status: 400 });

  const status = body.action === "approve" ? "APPROVED" : "REJECTED";
  const updated = await prisma.leaveRequest.update({
    where: { id: req.id },
    data: {
      status,
      reviewerId: user.id,
      reviewNote: typeof body.note === "string" ? body.note.slice(0, 500) : null,
      reviewedAt: new Date(),
    },
  });

  await prisma.notification
    .create({
      data: {
        userId: req.userId,
        type: "SYSTEM",
        title: `Leave ${status.toLowerCase()}`,
        body: `Your ${req.type.toLowerCase()} leave (${req.days} day(s)) was ${status.toLowerCase()} by ${user.fullName}`,
        link: "/hr",
      },
    })
    .catch(() => {});

  return NextResponse.json(updated);
}
