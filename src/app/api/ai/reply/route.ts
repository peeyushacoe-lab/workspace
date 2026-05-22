import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { getAIClient, AI_MODEL } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { originalMessage, tone } = (await request.json()) as {
    originalMessage: string;
    tone?: string;
  };

  if (!originalMessage?.trim()) {
    return NextResponse.json({ error: "Original message is required" }, { status: 400 });
  }

  const prompt = `You are a professional email assistant. Given this email, suggest 3 different reply options.

Original email:
${originalMessage}

Generate 3 concise reply options with different tones: formal, friendly, and brief.
Respond in JSON format: {"replies": [{"tone": "formal", "text": "..."}, {"tone": "friendly", "text": "..."}, {"tone": "brief", "text": "..."}]}
Only output valid JSON, nothing else.`;

  try {
    const ai = getAIClient();
    const completion = await ai.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 800,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: { replies: Array<{ tone: string; text: string }> };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      parsed = { replies: [{ tone: tone ?? "professional", text: raw }] };
    }

    await prisma.aIInteraction.create({
      data: {
        userId: user.id,
        type: "REPLY",
        prompt: originalMessage.slice(0, 500),
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
