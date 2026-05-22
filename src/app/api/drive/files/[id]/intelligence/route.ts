import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAIClient, AI_MODEL } from "@/lib/ai";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/drive/files/:id/intelligence
 * Returns AI-generated summary, classification, and key entities for a file.
 * For text/code files only — uses stored content preview or filename-based classification.
 */
export async function GET(_request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const file = await prisma.driveFile.findFirst({
    where: { id, isTrashed: false, ownerId: user.id },
    select: {
      id: true, name: true, mimeType: true, size: true,
      aiSummary: true, classification: true, sensitivityLevel: true,
    },
  });

  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Return cached analysis if available
  if (file.aiSummary) {
    return NextResponse.json({
      summary: file.aiSummary,
      classification: file.classification,
      sensitivityLevel: file.sensitivityLevel,
      cached: true,
    });
  }

  // Can only process text-based files without actual content fetching
  const isText = file.mimeType.startsWith("text/") ||
    ["application/json", "application/xml", "application/javascript"].includes(file.mimeType) ||
    file.name.match(/\.(md|txt|csv|json|xml|js|ts|py|sql|html|css)$/i);

  if (!isText) {
    return NextResponse.json({
      summary: `${file.name} — binary file (${file.mimeType}). Content analysis requires file download.`,
      classification: file.mimeType.split("/")[0]?.toUpperCase() ?? "OTHER",
      sensitivityLevel: "INTERNAL",
      cached: false,
    });
  }

  const ai = getAIClient();
  const prompt = `Analyze this file and provide:
1. A 2-3 sentence summary of what this file likely contains based on its name and type
2. A classification: DOCUMENT, SPREADSHEET, PRESENTATION, IMAGE, CODE, ARCHIVE, or OTHER
3. A sensitivity level: PUBLIC, INTERNAL, CONFIDENTIAL, or RESTRICTED

File name: ${file.name}
File type: ${file.mimeType}
File size: ${(Number(file.size) / 1024).toFixed(1)} KB

Respond as JSON: {"summary": "...", "classification": "...", "sensitivityLevel": "..."}`;

  const response = await ai.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.choices[0]?.message.content ?? "{}";
  let analysis: { summary?: string; classification?: string; sensitivityLevel?: string };
  try {
    analysis = JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim()) as typeof analysis;
  } catch {
    analysis = { summary: text, classification: "OTHER", sensitivityLevel: "INTERNAL" };
  }

  // Cache the result
  await prisma.driveFile.update({
    where: { id },
    data: {
      aiSummary: analysis.summary ?? "",
      classification: analysis.classification ?? "OTHER",
      sensitivityLevel: analysis.sensitivityLevel ?? "INTERNAL",
    },
  }).catch(() => {});

  return NextResponse.json({
    summary: analysis.summary ?? "",
    classification: analysis.classification ?? "OTHER",
    sensitivityLevel: analysis.sensitivityLevel ?? "INTERNAL",
    cached: false,
  });
}
