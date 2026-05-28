/**
 * Meeting Intelligence — Phase 36
 * POST  { transcript, title?, duration? }
 * Returns { summary, actionItems, decisions, attendees, sentiment, tags }
 */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { claudeComplete } from "@/lib/claude";

const SYSTEM = `You are an enterprise meeting intelligence assistant.
Given a meeting transcript, extract structured insights.
Return ONLY valid JSON matching this exact schema — no markdown, no prose:
{
  "summary": "2-3 sentence executive summary",
  "actionItems": [{ "owner": "Name or 'Team'", "task": "What to do", "due": "By when (if mentioned)" }],
  "decisions": ["Decision made 1", "Decision made 2"],
  "attendees": ["Name 1", "Name 2"],
  "sentiment": "positive|neutral|negative|mixed",
  "tags": ["tag1", "tag2"],
  "duration_minutes": null
}`;

export async function POST(request: NextRequest) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { transcript, title, duration } = await request.json() as {
    transcript: string;
    title?: string;
    duration?: number;
  };

  if (!transcript?.trim()) {
    return NextResponse.json({ error: "transcript is required" }, { status: 400 });
  }

  if (transcript.length > 100_000) {
    return NextResponse.json({ error: "Transcript too long (max 100k chars)" }, { status: 400 });
  }

  const prompt = [
    title ? `Meeting title: ${title}` : "",
    duration ? `Duration: ${duration} minutes` : "",
    "",
    "TRANSCRIPT:",
    transcript.slice(0, 80_000),
  ].filter(Boolean).join("\n");

  try {
    const raw = await claudeComplete(SYSTEM, prompt, 2000);
    if (!raw) return NextResponse.json({ error: "AI not configured" }, { status: 503 });
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON in response");
    const result = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
      summary: string;
      actionItems: { owner: string; task: string; due: string }[];
      decisions: string[];
      attendees: string[];
      sentiment: string;
      tags: string[];
      duration_minutes: number | null;
    };
    if (duration) result.duration_minutes = duration;
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: "AI processing failed", detail: (err as Error).message }, { status: 500 });
  }
}
