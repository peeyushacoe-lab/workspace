import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { getAIClient, AI_MODEL, AI_PROVIDER, AI_CONFIGURED } from "@/lib/ai";
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
    "You are CyberSage AI, a helpful assistant integrated into Nexus. " +
    "Answer questions concisely and helpfully. You can help with emails, scheduling, " +
    "document writing, and general productivity tasks.";

  // The system prompt goes in the system role. It was being sent as a user
  // turn, which burns the slot the model treats as instructions and leaves the
  // persona competing with the user's own message for priority.
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemContent },
    ...sanitizedHistory,
    { role: "user", content: message },
  ];

  // Fail fast with something actionable. Without this the request goes out to
  // whatever base URL the fallback picked — on Vercel that used to be
  // localhost:11434, which does not exist there, so every AI call became an
  // unexplained 503.
  if (!AI_CONFIGURED) {
    console.error(`AI not configured: provider="${AI_PROVIDER}" has no API key.`);
    return NextResponse.json(
      { error: "AI is not configured on this server. Set GEMINI_API_KEY (or OPENAI_API_KEY) and redeploy." },
      { status: 503 },
    );
  }

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
    // Log what actually failed. The previous version swallowed the provider's
    // own message, so a wrong model name, a bad key and an unreachable host
    // were indistinguishable in the logs — all three just read "AI request
    // failed".
    const e = err as { status?: number; message?: string; error?: { message?: string } };
    const upstream = e?.error?.message ?? e?.message ?? String(err);
    console.error(
      `AI chat failed — provider=${AI_PROVIDER} model=${AI_MODEL} status=${e?.status ?? "n/a"}: ${upstream}`,
    );

    // 401/403 is our misconfiguration, not a transient upstream fault, so it
    // must not tell the user to "try again" — it never gets better on its own.
    if (e?.status === 401 || e?.status === 403) {
      return NextResponse.json(
        { error: "The AI provider rejected our credentials. Check the API key on the server." },
        { status: 503 },
      );
    }
    if (e?.status === 404) {
      return NextResponse.json(
        { error: `The model "${AI_MODEL}" was not found for this provider. Set AI_MODEL to a valid name.` },
        { status: 503 },
      );
    }
    if (e?.status === 429) {
      return NextResponse.json(
        { error: "The AI provider is rate limiting us. Try again shortly." },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: "AI request failed. Please try again." }, { status: 503 });
  }
}
