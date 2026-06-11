import { NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";

export async function POST(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { message, history } = await request.json() as {
    message: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }
  if (message.length > 8000) {
    return NextResponse.json({ error: "Message too long (max 8000 chars)" }, { status: 400 });
  }

  const messages = [
    ...(history ?? []).slice(-10),
    { role: "user" as const, content: message.trim() },
  ];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: "You are Nexus AI, a helpful assistant integrated into the Nexus enterprise workspace. You help with tasks, answer questions, and assist with work. Be concise and practical.",
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    return NextResponse.json(
      { error: err.error?.message ?? "AI service error" },
      { status: 503 }
    );
  }

  const data = await res.json() as { content?: { type: string; text: string }[] };
  const reply = data.content?.find(c => c.type === "text")?.text ?? "";

  return NextResponse.json({ reply });
}
