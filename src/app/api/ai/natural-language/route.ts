import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { getAIClient, AI_MODEL } from "@/lib/ai";

/**
 * POST /api/ai/natural-language
 *
 * Takes a plain-English command from the user and returns a structured action
 * object that the client can execute directly.
 *
 * Body: { command: string }
 *
 * Response: { action, params, displayText, confidence }
 *
 * Actions:
 *   navigate        â†’ { href: string }
 *   compose_email   â†’ { to?: string, subject?: string, body?: string }
 *   search          â†’ { query: string, type?: string }
 *   create_event    â†’ { title?: string, date?: string, time?: string, attendees?: string }
 *   create_note     â†’ { title?: string }
 *   upload_file     â†’ {}
 *   create_channel  â†’ { name?: string }
 *   summarize_inbox â†’ {}
 *   unknown         â†’ { suggestion: string }
 */

const SYSTEM_PROMPT = `You are the Nexus AI command parser.

The user will type a natural-language command. Parse it into a JSON action.

Available actions and their params:
- navigate: { href } â€” one of /inbox /chat /drive /calendar /notes /ai /settings /users /contacts /admin /docs
- compose_email: { to?, subject?, body? }
- search: { query, type? } â€” type is one of: mail | chat | drive | calendar | all
- create_event: { title?, date?, time?, attendees? }
- create_note: { title? }
- create_doc: { title? }
- upload_file: {}
- create_channel: { name? }
- summarize_inbox: {}
- unknown: { suggestion }

Rules:
1. Always respond with ONLY valid JSON â€” no markdown, no code fences, no commentary.
2. Be liberal in understanding intent. "go to inbox" â†’ navigate /inbox. "write email to bob" â†’ compose_email.
3. If you cannot determine the action with confidence > 0.5, use "unknown" with a helpful suggestion.
4. Extract as many params as available from the command text.
5. For dates/times in create_event, keep them as the user said them (e.g. "tomorrow 3pm", "Friday").

JSON shape:
{
  "action": "<action name>",
  "params": { <action-specific params> },
  "displayText": "<short human-readable confirmation, e.g. 'Composing email to alice@company.com'>",
  "confidence": 0.0-1.0
}`;

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { command } = (await request.json()) as { command?: string };
  if (!command?.trim()) {
    return NextResponse.json({ error: "command is required" }, { status: 400 });
  }

  try {
    const ai = getAIClient();
    const completion = await ai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: command.trim() },
      ],
      temperature: 0.2,
      max_tokens: 256,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";

    // Strip any accidental markdown code fences
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

    const parsed = JSON.parse(cleaned) as {
      action: string;
      params: Record<string, string>;
      displayText: string;
      confidence: number;
    };

    return NextResponse.json(parsed);
  } catch (err) {
    // AI unavailable or parse failure â†’ return unknown action
    console.error("natural-language parse error:", err);
    return NextResponse.json({
      action: "unknown",
      params: { suggestion: "Try: 'compose email to alice', 'go to calendar', 'search drive for report'" },
      displayText: "AI command parsing unavailable",
      confidence: 0,
    });
  }
}
