import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { IncidentSeverity, IncidentStatus } from "@/generated/prisma/enums";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "CISO", "CEO"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const incident = await prisma.securityIncident.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, fullName: true, avatarUrl: true } },
      timeline: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!incident) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(incident);
}

export async function PUT(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "CISO", "CEO"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { status, severity, assignedTo, title, description } = (await request.json()) as {
    status?: IncidentStatus;
    severity?: IncidentSeverity;
    assignedTo?: string | null;
    title?: string;
    description?: string;
  };

  const incident = await prisma.securityIncident.findUnique({ where: { id } });
  if (!incident) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.securityIncident.update({
    where: { id },
    data: {
      ...(status ? { status, resolvedAt: status === "RESOLVED" ? new Date() : undefined } : {}),
      ...(severity ? { severity } : {}),
      ...(assignedTo !== undefined ? { assignedTo } : {}),
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
    },
    include: {
      assignee: { select: { id: true, fullName: true } },
      timeline: { orderBy: { createdAt: "asc" } },
    },
  });

  // Auto-log status changes
  if (status && status !== incident.status) {
    await prisma.incidentTimeline.create({
      data: {
        incidentId: id,
        userId: user.id,
        action: "STATUS_CHANGED",
        note: `Status changed from ${incident.status} to ${status} by ${user.fullName}`,
      },
    });
  }

  return NextResponse.json(updated);
}
