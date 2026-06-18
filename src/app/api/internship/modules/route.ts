import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;
const HUB_ROLES = ["INTERNSHIP", ...MENTOR_ROLES] as const;

interface QuizQuestion {
  id: string;
  type: "mcq" | "text";
  prompt: string;
  options?: string[];
  answerIndex?: number;
}
interface Quiz { questions: QuizQuestion[] }

function getQuiz(raw: unknown): Quiz {
  if (raw && typeof raw === "object" && Array.isArray((raw as Quiz).questions)) {
    return raw as Quiz;
  }
  return { questions: [] };
}

// GET /api/internship/modules?weekId=...  → module completions (for mentor review)
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const weekId = searchParams.get("weekId");
  const isMentor = MENTOR_ROLES.includes(user.role as typeof MENTOR_ROLES[number]);

  const completions = await prisma.internModuleCompletion.findMany({
    where: {
      ...(weekId ? { weekId } : {}),
      ...(isMentor ? {} : { internId: user.id }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      intern: { select: { id: true, fullName: true, avatarUrl: true } },
      topic: { select: { id: true, title: true, quiz: true } },
    },
  });

  return NextResponse.json(completions);
}

const submitSchema = z.object({
  topicId: z.string().min(1),
  answers: z.record(z.string(), z.union([z.number(), z.string()])).default({}),
});

// POST /api/internship/modules  → grade a module quiz and record completion if passed
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid answers", details: parsed.error.flatten() }, { status: 400 });
  }
  const { topicId, answers } = parsed.data;

  const topic = await prisma.internWeekTopic.findUnique({
    where: { id: topicId },
    select: { id: true, weekId: true, quiz: true },
  });
  if (!topic) return NextResponse.json({ error: "Module not found" }, { status: 404 });

  const quiz = getQuiz(topic.quiz);
  if (quiz.questions.length === 0) {
    return NextResponse.json({ error: "This module has no quiz" }, { status: 400 });
  }

  // Grade. Rule: every MCQ must be correct; every text question must have a non-empty answer.
  const wrongIds: string[] = [];
  let mcqTotal = 0;
  let mcqCorrect = 0;
  for (const q of quiz.questions) {
    const ans = answers[q.id];
    if (q.type === "mcq") {
      mcqTotal++;
      if (typeof ans === "number" && ans === q.answerIndex) mcqCorrect++;
      else wrongIds.push(q.id);
    } else {
      // text — counts as done when a non-empty answer is provided
      if (!(typeof ans === "string" && ans.trim().length > 0)) wrongIds.push(q.id);
    }
  }

  const passed = wrongIds.length === 0;
  const score = mcqTotal > 0 ? Math.round((mcqCorrect / mcqTotal) * 100) : 100;

  if (!passed) {
    return NextResponse.json({ passed: false, score, wrongIds, weekCompleted: false });
  }

  // Record / update this intern's module completion
  await prisma.internModuleCompletion.upsert({
    where: { topicId_internId: { topicId, internId: user.id } },
    create: { topicId, weekId: topic.weekId, internId: user.id, answers, score },
    update: { answers, score },
  });

  // Auto-complete the week when every module that HAS a quiz is completed by this intern
  const weekTopics = await prisma.internWeekTopic.findMany({
    where: { weekId: topic.weekId },
    select: { id: true, quiz: true },
  });
  const quizTopicIds = weekTopics
    .filter(t => getQuiz(t.quiz).questions.length > 0)
    .map(t => t.id);

  let weekCompleted = false;
  if (quizTopicIds.length > 0) {
    const doneCount = await prisma.internModuleCompletion.count({
      where: { internId: user.id, topicId: { in: quizTopicIds } },
    });
    if (doneCount >= quizTopicIds.length) {
      await prisma.internWeekCompletion.upsert({
        where: { weekId_internId: { weekId: topic.weekId, internId: user.id } },
        create: { weekId: topic.weekId, internId: user.id },
        update: {},
      });
      weekCompleted = true;
    }
  }

  return NextResponse.json({ passed: true, score, wrongIds: [], weekCompleted });
}
