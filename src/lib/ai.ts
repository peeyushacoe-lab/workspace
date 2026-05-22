import OpenAI from "openai";

// Ollama when no OpenAI key → switch to OpenAI in production by setting OPENAI_API_KEY
const useOpenAI = !!process.env.OPENAI_API_KEY;

export function getAIClient(): OpenAI {
  return new OpenAI({
    baseURL: useOpenAI
      ? "https://api.openai.com/v1"
      : (process.env.OLLAMA_URL ?? "http://localhost:11434/v1"),
    apiKey: useOpenAI ? process.env.OPENAI_API_KEY! : "ollama",
  });
}

export const AI_MODEL =
  process.env.AI_MODEL ?? (useOpenAI ? "gpt-4o-mini" : "llama3.2");

export const AI_PROVIDER = useOpenAI ? "openai" : "ollama";
