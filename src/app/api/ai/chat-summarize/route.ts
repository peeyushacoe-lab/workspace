import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAIClient, AI_MODEL } from "@/lib/ai";

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { channelId, mode } = (await request.json()) as {
    channelId: string;
    mode: "summary" | "action-items" | "schedule-meeting";
  };

  if (!channelId) return NextResponse.json({ error: "channelId is required" }, { status: 400 });

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const messages = await prisma.chatMessage.findMany({
    where: { channelId, deletedAt: null, parentId: null },
    include: { user: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  if (messages.length === 0) {
    return NextResponse.json({ result: "No messages in this channel yet." });
  }

  const transcript = messages
    .reverse()
    .map(m => `${m.user.fullName}: ${m.content}`)
    .join("\n");

  const prompts: Record<string, string> = {
    "summary":          `Summarize this chat channel conversation in 3-5 bullet points:\n\n${transcript}`,
    "action-items":     `Extract all action items and tasks from this conversation. Format as a numbered list:\n\n${transcript}`,
    "schedule-meeting": `Based on this conversation, draft a meeting agenda and suggest a time slot. Format clearly:\n\n${transcript}`,
  };

  const prompt = prompts[mode ?? "summary"] ?? prompts["summary"];

  const ai = getAIClient();
  const response = await ai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const result = response.choices[0]?.message.content ?? "";
  return NextResponse.json({ result });
}
