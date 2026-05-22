import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { semanticSearch } from "@/lib/embeddings";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/ai/search?q=...&type=email|file|note|doc&limit=10
 * Semantic search across all embedded resources the user owns.
 */
export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const type = searchParams.get("type") ?? undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10"), 50);

  if (!q) return NextResponse.json({ results: [] });

  try {
    const hits = await semanticSearch(q, { resourceType: type, userId: user.id, topK: limit });

    // Hydrate knowledge base results
    const knowledgeHits = await prisma.workspaceKnowledge.findMany({
      where: { OR: [{ userId: user.id }, { isPublic: true }] },
      take: 200,
    });

    const { embed, cosineSim } = await import("@/lib/embeddings");
    const queryVec = await embed(q);
    const knowledgeResults = knowledgeHits
      .map((k) => ({ ...k, similarity: cosineSim(queryVec, k.embedding) }))
      .filter((k) => k.similarity > 0.5)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5)
      .map((k) => ({
        id: k.id,
        resourceType: "knowledge",
        resourceId: k.id,
        content: k.content,
        similarity: k.similarity,
        metadata: { title: k.title, category: k.category, tags: k.tags },
      }));

    return NextResponse.json({
      results: [
        ...hits.map((h) => ({
          id: h.id,
          resourceType: h.resourceType,
          resourceId: h.resourceId,
          content: h.content,
          similarity: h.similarity,
          metadata: h.metadata,
        })),
        ...knowledgeResults,
      ].sort((a, b) => b.similarity - a.similarity).slice(0, limit),
    });
  } catch {
    return NextResponse.json({ error: "Semantic search unavailable — check OPENAI_API_KEY" }, { status: 500 });
  }
}
