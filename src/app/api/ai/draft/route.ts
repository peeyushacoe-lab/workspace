import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { getAIClient, AI_MODEL } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed: rateLimitOk, retryAfter } = await checkRateLimit(`ai:draft:${user.id}`, 25, 10 * 60);
  if (!rateLimitOk) {
    return NextResponse.json(
      { error: "AI rate limit reached. Please try again later.", retryAfter },
      { status: 429 }
    );
  }

  const { subject, context, tone, recipient, language } = (await request.json()) as {
    subject?: string;
    context: string;
    tone?: string;
    recipient?: string;
    language?: string;
  };

  if (!context?.trim()) {
    return NextResponse.json({ error: "Context is required" }, { status: 400 });
  }

  const prompt = [
    `You are a professional email assistant for Nexus.`,
    `Write a professional email with the following details:`,
    subject ? `Subject: ${subject}` : "",
    recipient ? `To: ${recipient}` : "",
    `Tone: ${tone ?? "professional"}`,
    language ? `Language: ${language}` : "",
    `Context/Instructions: ${context}`,
    ``,
    `Return ONLY the email body (no subject line, no "Dear X" if not needed, no extra commentary).`,
    `Make it concise, clear, and ${tone ?? "professional"}.`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const ai = getAIClient();
    const completion = await ai.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const draft = completion.choices[0]?.message?.content ?? "";

    await prisma.aIInteraction.create({
      data: {
        userId: user.id,
        type: "DRAFT",
        prompt: context,
        response: draft,
        model: AI_MODEL,
        tokens: completion.usage?.total_tokens,
      },
    });

    return NextResponse.json({ draft });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI request failed";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
