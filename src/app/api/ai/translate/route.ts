import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { getAIClient, AI_MODEL } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text, targetLanguage } = (await request.json()) as {
    text: string;
    targetLanguage: string;
  };

  if (!text?.trim() || !targetLanguage?.trim()) {
    return NextResponse.json({ error: "text and targetLanguage are required" }, { status: 400 });
  }

  const prompt = `Translate the following text to ${targetLanguage}. Return only the translated text, nothing else.

Text:
${text}`;

  try {
    const ai = getAIClient();
    const completion = await ai.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 2000,
    });

    const translated = completion.choices[0]?.message?.content ?? "";

    await prisma.aIInteraction.create({
      data: {
        userId: user.id,
        type: "TRANSLATE",
        prompt: `${targetLanguage}: ${text.slice(0, 200)}`,
        response: translated.slice(0, 2000),
        model: AI_MODEL,
        tokens: completion.usage?.total_tokens,
      },
    });

    return NextResponse.json({ translated, targetLanguage });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI request failed";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
