import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { AI_MODEL, AI_PROVIDER } from "@/lib/ai";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (AI_PROVIDER === "ollama") {
    const ollamaUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
    try {
      const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) throw new Error("Ollama not responding");
      const data = (await res.json()) as { models: Array<{ name: string }> };
      return NextResponse.json({
        provider: "ollama",
        available: true,
        model: AI_MODEL,
        models: data.models.map((m) => m.name),
      });
    } catch {
      return NextResponse.json({
        provider: "ollama",
        available: false,
        model: AI_MODEL,
        hint: `Start Ollama and run: ollama pull ${AI_MODEL}`,
      });
    }
  }

  return NextResponse.json({ provider: "openai", available: true, model: AI_MODEL });
}
