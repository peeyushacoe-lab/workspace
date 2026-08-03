import OpenAI from "openai";

/**
 * AI provider selection for every `/api/ai/*` route.
 *
 * All three providers are reached through the OpenAI SDK, because Gemini and
 * Ollama both expose OpenAI-compatible endpoints. That is why adding Gemini
 * needed no new dependency and no change to any calling route — only the
 * base URL, the key and the default model differ.
 *
 * ── Where to put your key ──────────────────────────────────────────────────
 *   Local:  add GEMINI_API_KEY to .env
 *   Vercel: Project → Settings → Environment Variables → GEMINI_API_KEY
 *           (set it for Production, Preview and Development)
 *   Key:    https://aistudio.google.com/apikey
 *
 * Then redeploy — Next.js reads server env at build/boot, so an added variable
 * does not take effect until the next deployment.
 *
 * ── Precedence ─────────────────────────────────────────────────────────────
 * Gemini → OpenAI → Ollama, first configured wins. Set AI_PROVIDER to force
 * one explicitly, which is what you want when several keys are present and you
 * are comparing them.
 *
 * Note this is separate from `src/lib/claude.ts`, which some routes use
 * directly through the Anthropic SDK for its own message format. Switching
 * those is a bigger change than switching this file.
 */

export type AIProvider = "gemini" | "openai" | "ollama";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const OPENAI_BASE_URL = "https://api.openai.com/v1";

function resolveProvider(): AIProvider {
  const forced = process.env.AI_PROVIDER?.toLowerCase();
  if (forced === "gemini" || forced === "openai" || forced === "ollama") return forced;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "ollama";
}

export const AI_PROVIDER: AIProvider = resolveProvider();

/**
 * Default model per provider. Model names move fast — override with AI_MODEL
 * rather than editing this, and check Google's current lineup before assuming
 * the default below is still the one you want.
 */
const DEFAULT_MODEL: Record<AIProvider, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  ollama: "llama3.2",
};

export const AI_MODEL = process.env.AI_MODEL ?? DEFAULT_MODEL[AI_PROVIDER];

/**
 * Provider/model mismatch guard.
 *
 * Setting AI_MODEL without AI_PROVIDER is the easiest way to break this: the
 * model name reaches the client but the provider resolves from whichever key
 * happens to be present, so a Gemini model gets posted to api.openai.com and
 * every AI feature 404s behind a generic 503. Loud at boot beats silent at
 * runtime — the status endpoint surfaces it too.
 */
export const AI_MISCONFIGURED: string | null = (() => {
  const m = AI_MODEL.toLowerCase();
  if (m.startsWith("gemini") && AI_PROVIDER !== "gemini") {
    return `AI_MODEL is "${AI_MODEL}" but the active provider is "${AI_PROVIDER}". ` +
      `GEMINI_API_KEY is not visible to this process — check it is set for THIS ` +
      `environment in Vercel and that you redeployed after adding it.`;
  }
  if (m.startsWith("gpt") && AI_PROVIDER !== "openai") {
    return `AI_MODEL is "${AI_MODEL}" but the active provider is "${AI_PROVIDER}".`;
  }
  return null;
})();

if (AI_MISCONFIGURED) console.error(`[ai] ${AI_MISCONFIGURED}`);

export function getAIClient(): OpenAI {
  switch (AI_PROVIDER) {
    case "gemini":
      return new OpenAI({
        baseURL: GEMINI_BASE_URL,
        // Non-null asserted only when the provider was resolved *from* the key.
        // If AI_PROVIDER forced gemini without a key, fail loudly here rather
        // than sending unauthenticated requests that 401 on every AI feature.
        apiKey: requireKey("GEMINI_API_KEY"),
      });
    case "openai":
      return new OpenAI({
        baseURL: OPENAI_BASE_URL,
        apiKey: requireKey("OPENAI_API_KEY"),
      });
    case "ollama":
      return new OpenAI({
        baseURL: process.env.OLLAMA_URL ?? "http://localhost:11434/v1",
        apiKey: "ollama", // Ollama ignores it, but the SDK requires a value.
      });
  }
}

function requireKey(name: "GEMINI_API_KEY" | "OPENAI_API_KEY"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `AI_PROVIDER is "${AI_PROVIDER}" but ${name} is not set. ` +
      `Add it to .env locally, or to Vercel → Settings → Environment Variables, then redeploy.`,
    );
  }
  return value;
}

/** True when the active provider can actually serve a request. Use this for
 *  the /api/ai/status check rather than probing the model. */
export const AI_CONFIGURED =
  AI_PROVIDER === "ollama" ||
  (AI_PROVIDER === "gemini" && !!process.env.GEMINI_API_KEY) ||
  (AI_PROVIDER === "openai" && !!process.env.OPENAI_API_KEY);
