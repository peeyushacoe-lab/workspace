import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scanContent } from "@/lib/dlp";

/**
 * POST /api/sentinel/scan
 * Scan content (email body, file text, chat message) against DLP policies.
 * Body: { content, scope, resourceType, resourceId }
 */
export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    content: string;
    scope: string;
    resourceType: string;
    resourceId: string;
  };

  if (!body.content || !body.scope || !body.resourceType || !body.resourceId) {
    return NextResponse.json({ error: "content, scope, resourceType, resourceId required" }, { status: 400 });
  }

  const violations = await scanContent(body.content, body.scope, body.resourceType, body.resourceId, user.id);
  return NextResponse.json({ clean: violations.length === 0, violations });
}

/**
 * POST /api/sentinel/scan/file
 * Trigger a file malware scan (async — returns scan record immediately).
 */
export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get("fileId");
  if (!fileId) return NextResponse.json({ error: "fileId required" }, { status: 400 });

  const scan = await prisma.fileScan.findUnique({ where: { fileId } });
  return NextResponse.json(scan ?? { fileId, status: "NOT_SCANNED" });
}
