import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { createNotification } from "@/lib/notifications";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;

const reviewSchema = z.object({
  verdict: z.enum(["approved", "rejected", "revision_requested"]),
  comment: z.string().optional(),
  score: z.number().int().min(0).max(100).optional(),
});

// PATCH: mentor reviews a submission
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !MENTOR_ROLES.includes(user.role as typeof MENTOR_ROLES[number])) {
    return NextResponse.json({ error: "Only mentors can review submissions" }, { status: 403 });
  }
  const { id } = await params;

  const body = await request.json();
  const data = reviewSchema.parse(body);

  const statusMap: Record<string, string> = {
    approved: "approved",
    rejected: "rejected",
    revision_requested: "revision_requested",
  };

  const [review, submission] = await prisma.$transaction([
    prisma.internReview.create({
      data: {
        submissionId: id,
        reviewerId: user.id,
        verdict: data.verdict,
        comment: data.comment,
        score: data.score,
      },
    }),
    prisma.internSubmission.update({
      where: { id },
      data: { status: statusMap[data.verdict] ?? "under_review" },
      include: {
        submitter: { select: { id: true, fullName: true, avatarUrl: true } },
        task: { select: { id: true, title: true } },
        reviews: {
          include: { reviewer: { select: { id: true, fullName: true, avatarUrl: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
  ]);

  // Notify the submitter of the verdict
  const verdictLabel: Record<string, string> = {
    approved: "✅ Approved",
    rejected: "❌ Rejected",
    revision_requested: "🔄 Revision requested",
  };
  await createNotification({
    userId: submission.submitter.id,
    type: "SYSTEM",
    title: `Submission reviewed: ${verdictLabel[data.verdict] ?? data.verdict}`,
    body: `"${submission.task.title}"${data.score !== undefined ? ` — Score: ${data.score}/100` : ""}${data.comment ? ` — ${data.comment.slice(0, 80)}` : ""}`,
    link: "/internship",
  }).catch(() => {});

  return NextResponse.json({ review, submission });
}
