// AI module — OpenAI / Ollama client, models, async AI queue
export { getAIClient, AI_MODEL, AI_PROVIDER } from "@/lib/ai";
export { aiQueue, AI_QUEUE_NAME } from "@/lib/queues/ai.queue";
export type { AIJobData } from "@/lib/queues/ai.queue";
