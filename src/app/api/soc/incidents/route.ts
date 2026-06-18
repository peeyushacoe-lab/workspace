import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { IncidentSeverity, IncidentStatus } from "@/generated/prisma/enums";

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "CISO", "CEO"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as IncidentStatus | null;
  const severity = searchParams.get("severity") as IncidentSeverity | null;

  const incidents = await prisma.securityIncident.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(severity ? { severity } : {}),
    },
    include: {
      assignee: { select: { id: true, fullName: true, avatarUrl: true } },
      _count: { select: { timeline: true } },
    },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(incidents);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "CISO", "CEO"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { title, description, severity, assignedTo, sourceType, sourceId, metadata } =
    (await request.json()) as {
      title: string;
      description: string;
      severity: IncidentSeverity;
      assignedTo?: string;
      sourceType?: string;
      sourceId?: string;
      metadata?: Record<string, unknown>;
    };

  if (!title || !description || !severity) {
    return NextResponse.json({ error: "title, description, severity required" }, { status: 400 });
  }

  const incident = await prisma.securityIncident.create({
    data: {
      title,
      description,
      severity,
      assignedTo,
      sourceType,
      sourceId,
      metadata: metadata as never,
      timeline: {
        create: {
          userId: user.id,
          action: "CREATED",
          note: `Incident created by ${user.fullName}`,
        },
      },
    },
    include: {
      assignee: { select: { id: true, fullName: true } },
      timeline: { orderBy: { createdAt: "asc" } },
    },
  });

  return NextResponse.json(incident, { status: 201 });
}
