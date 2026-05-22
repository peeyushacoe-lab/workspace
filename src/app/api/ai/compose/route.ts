import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { getAIClient, AI_MODEL } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { prompt } = (await request.json()) as { prompt?: string };

  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const systemPrompt = `You are a professional email assistant for CyberSage Workspace.
Given a description of what the user wants to say, generate a complete email with a subject line and body.
Respond ONLY in JSON with exactly this shape:
{"subject": "...", "body": "..."}
Keep the subject concise (under 80 chars). The body should be professional and well-structured.`;

  const userPrompt = `Write an email for: ${prompt}`;

  try {
    const ai = getAIClient();
    const completion = await ai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "user", content: `${systemPrompt}\n\n${userPrompt}` },
      ],
      temperature: 0.7,
      max_tokens: 1200,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: { subject: string; body: string };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
      if (!parsed.subject || !parsed.body) throw new Error("Invalid shape");
    } catch {
      // Fallback: put everything in body
      parsed = { subject: "Draft Email", body: raw };
    }

    await prisma.aIInteraction.create({
      data: {
        userId: user.id,
        type: "COMPOSE",
        prompt: prompt.slice(0, 500),
        response: JSON.stringify(parsed).slice(0, 2000),
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
