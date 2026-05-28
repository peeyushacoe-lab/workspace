/**
 * AI Inbox Prioritization — Phase 36
 * POST  { threads: [{ id, subject, from, snippet, receivedAt }] }
 * Returns { priorities: [{ id, score, reason, label }] }
 *
 * score 1–10: 10 = urgent/CEO-level, 1 = newsletter/noise
 * label: "urgent" | "important" | "normal" | "low"
 */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { claudeComplete } from "@/lib/claude";

const SYSTEM = `You are an enterprise email triage assistant for a senior professional.
Given a list of email threads, score each by business priority.
Return ONLY a JSON array — no markdown, no extra text:
[{ "id": "<thread id>", "score": <1-10>, "reason": "<one sentence>", "label": "urgent|important|normal|low" }]

Scoring guide:
9-10: Requires same-day action, security/compliance, CEO/board/legal
7-8:  Important but not on fire, client emails, time-sensitive decisions
5-6:  Standard business correspondence
3-4:  FYI, CC'd, low-urgency internal
1-2:  Newsletters, automated notifications, marketing`;

export async function POST(request: NextRequest) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threads } = await request.json() as {
    threads: { id: string; subject: string; from: string; snippet: string; receivedAt: string }[];
  };

  if (!Array.isArray(threads) || threads.length === 0) {
    return NextResponse.json({ error: "threads array is required" }, { status: 400 });
  }

  const input = threads.slice(0, 30).map((t) =>
    `ID: ${t.id}\nFrom: ${t.from}\nSubject: ${t.subject}\nSnippet: ${(t.snippet ?? "").slice(0, 200)}\nReceived: ${t.receivedAt}`
  ).join("\n---\n");

  try {
    const raw = await claudeComplete(SYSTEM, input, 1500);
    if (!raw) return NextResponse.json({ error: "AI not configured" }, { status: 503 });
    const arrStart = raw.indexOf("[");
    const arrEnd = raw.lastIndexOf("]");
    if (arrStart === -1) throw new Error("No JSON array in response");
    const priorities = JSON.parse(raw.slice(arrStart, arrEnd + 1)) as {
      id: string; score: number; reason: string; label: string;
    }[];
    return NextResponse.json({ priorities });
  } catch (err) {
    return NextResponse.json({ error: "AI prioritization failed", detail: (err as Error).message }, { status: 500 });
  }
}
