/**
 * Anthropic Claude client singleton — Phase 22 AI Intelligence
 * Returns null when ANTHROPIC_API_KEY is not configured so all callers
 * can gracefully degrade without crashing.
 */
import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getClaudeClient(): Anthropic | null {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export const CLAUDE_MODEL = "claude-sonnet-4-6";

export async function claudeComplete(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 1024,
): Promise<string | null> {
  const client = getClaudeClient();
  if (!client) return null;
  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    const block = response.content[0];
    return block?.type === "text" ? block.text : null;
  } catch (err) {
    console.error("[claude] completion error:", (err as Error).message);
    return null;
  }
}
