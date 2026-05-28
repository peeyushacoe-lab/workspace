import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { claudeComplete } from "@/lib/claude";
import { getAIClient, AI_MODEL } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

const COMPOSE_SYSTEM = `You are a professional email assistant for CyberSage Workspace.
Given a description of what the user wants to say, generate a complete email with a subject line and body.
Respond ONLY in JSON with exactly this shape: {"subject": "...", "body": "..."}
Keep the subject concise (under 80 chars). The body should be professional and well-structured.`;

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { prompt, context, tone, length, replyTo } = (await request.json()) as {
    prompt?: string; context?: string; tone?: string; length?: string; replyTo?: string;
  };
  const userInput = context ?? prompt;

  if (!userInput?.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const userPrompt = [
    replyTo ? `Replying to:\n${replyTo.slice(0, 800)}\n\n` : "",
    `Write a ${tone ?? "professional"} email that is ${length ?? "medium"} in length.`,
    `Instructions: ${userInput}`,
    `Sender: ${user.fullName}`,
  ].join("\n");

  let raw: string | null = null;
  let modelUsed = "claude-sonnet-4-6";

  // Try Claude first (Phase 22 upgrade), fall back to OpenAI/Ollama
  raw = await claudeComplete(COMPOSE_SYSTEM, userPrompt, 1200);

  if (!raw) {
    try {
      const ai = getAIClient();
      const completion = await ai.chat.completions.create({
        model: AI_MODEL,
        messages: [{ role: "user", content: `${COMPOSE_SYSTEM}\n\n${userPrompt}` }],
        temperature: 0.7,
        max_tokens: 1200,
      });
      raw = completion.choices[0]?.message?.content ?? null;
      modelUsed = AI_MODEL;
    } catch {
      return NextResponse.json({ error: "AI unavailable" }, { status: 503 });
    }
  }

  if (!raw) return NextResponse.json({ error: "AI returned empty response" }, { status: 503 });

  let parsed: { subject: string; body: string };
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? raw) as typeof parsed;
    if (!parsed.subject || !parsed.body) throw new Error("Invalid shape");
  } catch {
    parsed = { subject: "Draft Email", body: raw };
  }

  await prisma.aIInteraction.create({
    data: { userId: user.id, type: "COMPOSE", prompt: userInput.slice(0, 500), response: JSON.stringify(parsed).slice(0, 2000), model: modelUsed },
  }).catch(() => {});

  return NextResponse.json(parsed);
}
