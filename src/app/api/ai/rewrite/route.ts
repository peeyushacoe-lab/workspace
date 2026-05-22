import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { content, style } = (await request.json()) as {
    content: string;
    style: "formal" | "casual" | "concise" | "expand";
  };

  if (!content?.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  if (!style) {
    return NextResponse.json({ error: "style is required" }, { status: 400 });
  }

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
      messages: [
        {
          role: "user",
          content: `Rewrite the following email in a ${style} style: "${content}". Reply only with the rewritten text.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[rewrite] Anthropic error:", errText);
    return NextResponse.json({ error: "AI request failed" }, { status: 503 });
  }

  const data = (await res.json()) as { content?: { text: string }[] };
  const result = data.content?.[0]?.text ?? "";

  return NextResponse.json({ result });
}
