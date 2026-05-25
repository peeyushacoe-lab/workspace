import { NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ pollId: string }> };

export async function POST(request: Request, { params }: Params) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pollId } = await params;
  const { optionId } = await request.json() as { optionId: string };
  if (!optionId) return NextResponse.json({ error: "optionId required" }, { status: 400 });

  const poll = await prisma.chatPoll.findUnique({
    where: { id: pollId },
    include: { options: true },
  });
  if (!poll) return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  if (!poll.options.find(o => o.id === optionId)) {
    return NextResponse.json({ error: "Option not in poll" }, { status: 400 });
  }

  // If not multiple choice, remove previous vote in this poll
  if (!poll.isMultiple) {
    await prisma.chatPollVote.deleteMany({
      where: {
        userId: user.userId,
        option: { pollId },
      },
    });
  }

  const existing = await prisma.chatPollVote.findUnique({
    where: { optionId_userId: { optionId, userId: user.userId } },
  });

  if (existing) {
    await prisma.chatPollVote.delete({ where: { id: existing.id } });
  } else {
    await prisma.chatPollVote.create({ data: { optionId, userId: user.userId } });
  }

  const updated = await prisma.chatPoll.findUnique({
    where: { id: pollId },
    include: { options: { include: { votes: { select: { userId: true } } }, orderBy: { order: "asc" } } },
  });

  return NextResponse.json(updated);
}
