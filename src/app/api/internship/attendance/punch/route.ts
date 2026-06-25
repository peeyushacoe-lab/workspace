import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

const HUB_ROLES = ["INTERNSHIP", "ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;

interface PunchBody {
  location?: { lat: number; lng: number; accuracy: number } | null;
  device?: string | null;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Optional context from client — silently ignore if absent or malformed
  const body: PunchBody = await request.json().catch(() => ({}));
  const location = body.location ?? null;
  const device = typeof body.device === "string" ? body.device.slice(0, 200) : null;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const lastPunch = await prisma.auditLog.findFirst({
    where: {
      actorId: user.id,
      action: { in: ["INTERN_PUNCH_IN", "INTERN_PUNCH_OUT"] },
      createdAt: { gte: todayStart },
    },
    orderBy: { createdAt: "desc" },
  });

  const alreadyPunchedIn = lastPunch?.action === "INTERN_PUNCH_IN";
  const action = alreadyPunchedIn ? "INTERN_PUNCH_OUT" : "INTERN_PUNCH_IN";

  let sessionId: string;
  if (!alreadyPunchedIn) {
    sessionId = randomUUID();
  } else {
    const meta = lastPunch?.metadata as Record<string, unknown> | null;
    sessionId = (meta?.sessionId as string) ?? randomUUID();
  }

  // Only store location + device on punch-in (not punch-out)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metadata: Record<string, any> = { sessionId };
  if (action === "INTERN_PUNCH_IN") {
    if (location) metadata.location = location;
    if (device) metadata.device = device;
  }

  const log = await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action,
      targetType: "attendance",
      metadata,
    },
  });

  return NextResponse.json({ action, sessionId, id: log.id, createdAt: log.createdAt });
}
