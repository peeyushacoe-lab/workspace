import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { getAIClient, AI_MODEL } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed: rateLimitOk, retryAfter } = await checkRateLimit(`ai:optimize-subject:${user.id}`, 25, 10 * 60);
  if (!rateLimitOk) {
    return NextResponse.json(
      { error: "AI rate limit reached. Please try again later.", retryAfter },
      { status: 429 }
    );
  }

  const { subject } = (await request.json()) as { subject?: string };

  if (!subject?.trim()) {
    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  }

  const prompt = `You are an email marketing and communication expert.
Given the email subject line: "${subject}"

Generate exactly 3 improved alternative subject lines that are:
- Clear and compelling
- Under 80 characters each
- Different styles (e.g., direct, curious, benefit-focused)

Respond ONLY in JSON: {"alternatives": ["...", "...", "..."]}
Output only valid JSON, nothing else.`;

  try {
    const ai = getAIClient();
    const completion = await ai.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: 300,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: { alternatives: string[] };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
      if (!Array.isArray(parsed.alternatives)) throw new Error("Invalid");
      // Ensure exactly 3
      parsed.alternatives = parsed.alternatives.slice(0, 3);
    } catch {
      parsed = { alternatives: [subject] };
    }

    await prisma.aIInteraction.create({
      data: {
        userId: user.id,
        type: "OPTIMIZE_SUBJECT",
        prompt: subject.slice(0, 200),
        response: JSON.stringify(parsed).slice(0, 500),
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
