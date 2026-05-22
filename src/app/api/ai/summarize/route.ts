import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { getAIClient, AI_MODEL } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text, type } = (await request.json()) as {
    text: string;
    type?: "email" | "thread" | "document" | "meeting";
  };

  if (!text?.trim()) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  const prompt = `Summarize this ${type ?? "content"} concisely. Return JSON:
{"summary": "2-3 sentence overview", "keyPoints": ["point1", "point2", "point3"], "actionItems": ["action1"], "sentiment": "positive|neutral|negative"}

Content:
${text.slice(0, 4000)}

Only output valid JSON.`;

  try {
    const ai = getAIClient();
    const completion = await ai.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 600,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: { summary: string; keyPoints: string[]; actionItems: string[]; sentiment: string };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      parsed = { summary: raw, keyPoints: [], actionItems: [], sentiment: "neutral" };
    }

    await prisma.aIInteraction.create({
      data: {
        userId: user.id,
        type: "SUMMARIZE",
        prompt: text.slice(0, 500),
        response: raw.slice(0, 2000),
        model: AI_MODEL,
        tokens: completion.usage?.total_tokens,
      },
    });

    return NextResponse.json(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI request failed";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
