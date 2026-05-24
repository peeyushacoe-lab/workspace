import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMobileUser } from "@/lib/mobile-auth";
import { getAIClient, AI_MODEL } from "@/lib/ai";

export async function POST(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, threadId, tone } = await request.json() as {
    action: "summarize" | "smart-reply";
    threadId: string;
    tone?: "friendly" | "professional" | "brief";
  };

  if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });

  const messages = await prisma.inboxMessage.findMany({
    where: { threadId },
    orderBy: { receivedAt: "asc" },
    take: 10,
    select: { from: true, textBody: true, htmlBody: true, receivedAt: true },
  });

  if (!messages.length) return NextResponse.json({ error: "No messages in thread" }, { status: 404 });

  const threadText = messages.map(m => {
    const body = m.textBody ?? m.htmlBody?.replace(/<[^>]+>/g, "") ?? "";
    return `From: ${m.from}\n${body.slice(0, 800)}`;
  }).join("\n\n---\n\n");

  const ai = getAIClient();

  if (action === "summarize") {
    const prompt = `Summarize this email thread concisely. Return JSON:
{"summary": "2-3 sentence overview", "keyPoints": ["point1", "point2"], "actionItems": ["action1"]}

Thread:
${threadText.slice(0, 4000)}

Only output valid JSON.`;

    const completion = await ai.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 400,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: { summary: string; keyPoints: string[]; actionItems: string[] };
    try { parsed = JSON.parse(raw) as typeof parsed; }
    catch { parsed = { summary: raw, keyPoints: [], actionItems: [] }; }

    return NextResponse.json(parsed);
  }

  if (action === "smart-reply") {
    const lastMsg = messages[messages.length - 1];
    const lastBody = lastMsg.textBody ?? lastMsg.htmlBody?.replace(/<[^>]+>/g, "") ?? "";
    const usedTone = tone ?? "professional";

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
        messages: [{
          role: "user",
          content: `Write a ${usedTone} email reply to: "${lastBody.slice(0, 1000)}". Reply only with the email body, no subject line.`,
        }],
      }),
    });

    if (!res.ok) return NextResponse.json({ error: "AI request failed" }, { status: 503 });

    const data = await res.json() as { content?: { text: string }[] };
    return NextResponse.json({ reply: data.content?.[0]?.text ?? "" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
