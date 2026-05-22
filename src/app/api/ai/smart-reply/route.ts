import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId, tone } = (await request.json()) as {
    threadId: string;
    tone: "friendly" | "professional" | "brief";
  };

  if (!threadId) return NextResponse.json({ error: "threadId is required" }, { status: 400 });
  if (!tone) return NextResponse.json({ error: "tone is required" }, { status: 400 });

  // Fetch the latest message in the thread
  const latestMessage = await prisma.inboxMessage.findFirst({
    where: { threadId },
    orderBy: { receivedAt: "desc" },
  });

  if (!latestMessage) {
    return NextResponse.json({ error: "No messages found in thread" }, { status: 404 });
  }

  const messageText = latestMessage.textBody ?? latestMessage.htmlBody?.replace(/<[^>]+>/g, "") ?? "";

  if (!messageText.trim()) {
    return NextResponse.json({ error: "Message has no readable content" }, { status: 400 });
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `Write a ${tone} email reply to: "${messageText}". Reply only with the email body, no subject line.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[smart-reply] Anthropic error:", errText);
    return NextResponse.json({ error: "AI request failed" }, { status: 503 });
  }

  const data = (await res.json()) as { content?: { text: string }[] };
  const reply = data.content?.[0]?.text ?? "";

  return NextResponse.json({ reply });
}
