import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { MODULE_QUIZZES } from "@/lib/internship-quizzes";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"];

// Applies the pre-built handbook quizzes to existing modules (matched by week
// number + topic order). Safe to run multiple times — it just overwrites the
// quiz on each matching module. Use this for weeks seeded before quizzes existed.
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !MENTOR_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Mentors only" }, { status: 403 });
  }

  const weeks = await prisma.internWeek.findMany({
    select: { weekNumber: true, topics: { select: { id: true, order: true } } },
  });

  let updated = 0;
  for (const wk of weeks) {
    const wq = MODULE_QUIZZES[wk.weekNumber];
    if (!wq) continue;
    for (const t of wk.topics) {
      const quiz = wq[t.order];
      if (quiz) {
        await prisma.internWeekTopic.update({ where: { id: t.id }, data: { quiz } });
        updated++;
      }
    }
  }

  return NextResponse.json({ updated, message: `Quizzes applied to ${updated} modules.` });
}
