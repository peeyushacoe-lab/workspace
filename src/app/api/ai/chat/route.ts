import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { getAIClient, AI_MODEL } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed: rateLimitOk, retryAfter } = await checkRateLimit(`ai:${user.id}`, 60, 60 * 60);
  if (!rateLimitOk) {
    return NextResponse.json(
      { error: "AI rate limit reached. Please try again later.", retryAfter },
      { status: 429 }
    );
  }

  const { message, history } = (await request.json()) as {
    message: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  if (message.length > 8000) {
    return NextResponse.json({ error: "Message too long (max 8000 characters)" }, { status: 400 });
  }

  const sanitizedHistory = (history ?? []).slice(-20).map((h) => ({
    role: h.role,
    content: String(h.content).slice(0, 2000),
  }));

  const systemContent =
    "You are CyberSage AI, a helpful assistant integrated into CyberSage Workspace. " +
    "Answer questions concisely and helpfully. You can help with emails, scheduling, " +
    "document writing, and general productivity tasks.";

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: systemContent },
    ...sanitizedHistory,
    { role: "user", content: message },
  ];

  try {
    const ai = getAIClient();
    const completion = await ai.chat.completions.create({
      model: AI_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    });

    const reply = completion.choices[0]?.message?.content ?? "Sorry, I could not generate a response.";

    await prisma.aIInteraction.create({
      data: {
        userId: user.id,
        type: "CHAT",
        prompt: message.slice(0, 500),
        response: reply.slice(0, 2000),
        model: AI_MODEL,
        tokens: completion.usage?.total_tokens,
      },
    });

    return NextResponse.json({ reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI request failed";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
