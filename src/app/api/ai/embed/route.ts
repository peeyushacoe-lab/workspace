import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { upsertEmbedding } from "@/lib/embeddings";

/**
 * POST /api/ai/embed
 * Embed a resource and store in DocumentEmbedding.
 * Body: { resourceType, resourceId, content, metadata? }
 */
export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    resourceType: string;
    resourceId: string;
    content: string;
    metadata?: Record<string, unknown>;
  };

  if (!body.resourceType || !body.resourceId || !body.content) {
    return NextResponse.json({ error: "resourceType, resourceId, content required" }, { status: 400 });
  }

  try {
    await upsertEmbedding({
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      content: body.content,
      userId: user.id,
      metadata: body.metadata,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Embedding failed — check OPENAI_API_KEY" }, { status: 500 });
  }
}
