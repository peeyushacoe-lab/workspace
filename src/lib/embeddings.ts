import { getAIClient } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIM = 1536;

/** Generate an embedding vector for a text string. */
export async function embed(text: string): Promise<number[]> {
  const client = getAIClient();
  const res = await client.embeddings.create({ model: EMBED_MODEL, input: text.slice(0, 8000) });
  return res.data[0].embedding;
}

/** Cosine similarity between two equal-length vectors, range [-1, 1]. */
export function cosineSim(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

type EmbeddingRow = {
  id: string;
  resourceType: string;
  resourceId: string;
  userId: string | null;
  content: string;
  embedding: number[];
  metadata: unknown;
  createdAt: Date;
};

/**
 * Semantic search: find the top-K most similar documents to a query string.
 * Filters by optional resourceType and userId.
 */
export async function semanticSearch(
  query: string,
  opts: { resourceType?: string; userId?: string; topK?: number } = {},
): Promise<Array<EmbeddingRow & { similarity: number }>> {
  const { resourceType, userId, topK = 10 } = opts;

  const queryVec = await embed(query);

  const rows = await prisma.documentEmbedding.findMany({
    where: {
      ...(resourceType ? { resourceType } : {}),
      ...(userId ? { userId } : {}),
    },
    take: 500,
  });

  return rows
    .map((r) => ({ ...r, similarity: cosineSim(queryVec, r.embedding) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

/**
 * Upsert an embedding for a resource. Called by background workers or inline.
 */
export async function upsertEmbedding(params: {
  resourceType: string;
  resourceId: string;
  content: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const vector = await embed(params.content);
  await prisma.documentEmbedding.upsert({
    where: { resourceType_resourceId: { resourceType: params.resourceType, resourceId: params.resourceId } },
    create: {
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      content: params.content,
      embedding: vector,
      userId: params.userId ?? null,
      metadata: (params.metadata ?? undefined) as never,
    },
    update: {
      content: params.content,
      embedding: vector,
      metadata: (params.metadata ?? undefined) as never,
    },
  });
}

export { EMBED_DIM };
