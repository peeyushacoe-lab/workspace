import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;
const HUB_ROLES = ["INTERNSHIP", ...MENTOR_ROLES] as const;

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const isMentor = MENTOR_ROLES.includes(user.role as typeof MENTOR_ROLES[number]);

  if (isMentor) {
    // Mentor overview — all interns
    const [internCount, taskCount, submissionCount, pendingReviews, openFindings, interns] = await Promise.all([
      prisma.user.count({ where: { role: "INTERNSHIP" } }),
      prisma.internTask.count(),
      prisma.internSubmission.count(),
      prisma.internSubmission.count({ where: { status: "submitted" } }),
      prisma.internFinding.count({ where: { status: "open" } }),
      prisma.user.findMany({
        where: { role: "INTERNSHIP" },
        select: { id: true, fullName: true, avatarUrl: true, email: true, createdAt: true },
      }),
    ]);

    // Per-intern stats
    const internStats = await Promise.all(
      interns.map(async (intern: { id: string; fullName: string; avatarUrl: string | null; email: string; createdAt: Date }) => {
        const [assigned, submitted, approved, discussions] = await Promise.all([
          prisma.internTask.count({ where: { assigneeIds: { has: intern.id } } }),
          prisma.internSubmission.count({ where: { submitterId: intern.id } }),
          prisma.internSubmission.count({ where: { submitterId: intern.id, status: "approved" } }),
          prisma.internDiscussion.count({ where: { authorId: intern.id } }),
        ]);
        return { intern, assigned, submitted, approved, discussions };
      }),
    );

    return NextResponse.json({ internCount, taskCount, submissionCount, pendingReviews, openFindings, internStats });
  } else {
    // Intern personal stats
    const [assigned, submitted, approved, pendingReview, findings] = await Promise.all([
      prisma.internTask.count({ where: { assigneeIds: { has: user.id } } }),
      prisma.internSubmission.count({ where: { submitterId: user.id } }),
      prisma.internSubmission.count({ where: { submitterId: user.id, status: "approved" } }),
      prisma.internSubmission.count({ where: { submitterId: user.id, status: "submitted" } }),
      prisma.internFinding.count({ where: { submitterId: user.id } }),
    ]);

    // Latest reviews received
    const recentReviews = await prisma.internReview.findMany({
      where: { submission: { submitterId: user.id } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        reviewer: { select: { id: true, fullName: true, avatarUrl: true } },
        submission: { select: { id: true, taskId: true, task: { select: { title: true } } } },
      },
    });

    return NextResponse.json({ assigned, submitted, approved, pendingReview, findings, recentReviews });
  }
}
