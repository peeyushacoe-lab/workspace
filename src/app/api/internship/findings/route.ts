import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;
const HUB_ROLES = ["INTERNSHIP", ...MENTOR_ROLES] as const;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type"); // bug_report | feature_request | finding
  const isMentor = MENTOR_ROLES.includes(user.role as typeof MENTOR_ROLES[number]);

  const findings = await prisma.internFinding.findMany({
    where: {
      ...(type ? { type } : {}),
      ...(!isMentor ? { submitterId: user.id } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      submitter: { select: { id: true, fullName: true, avatarUrl: true } },
      comments: {
        include: { author: { select: { id: true, fullName: true, avatarUrl: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json(findings);
}

const createSchema = z.object({
  type: z.enum(["bug_report", "feature_request", "finding"]),
  title: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  steps: z.string().optional(),
  useCase: z.string().optional(),
  attachments: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const data = createSchema.parse(body);

  const finding = await prisma.internFinding.create({
    data: { ...data, submitterId: user.id, attachments: data.attachments ?? [] },
    include: {
      submitter: { select: { id: true, fullName: true, avatarUrl: true } },
      comments: true,
    },
  });

  return NextResponse.json(finding, { status: 201 });
}
