import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export const SHEET_MARKER = "spreadsheet";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Own sheets
  const ownSheets = await prisma.note.findMany({
    where: { userId: user.id, color: SHEET_MARKER },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    select: { id: true, title: true, pinned: true, createdAt: true, updatedAt: true, userId: true },
  });

  // Find sheets shared with this user by scanning all share keys
  // We store share data as doc:share:sheet:{noteId} hash
  // To find what's shared with user: scan keys matching doc:share:sheet:*
  // and check if user.id is a field. We'll do a pattern scan.
  const sharedSheets: typeof ownSheets = [];
  try {
    const keys = await redis.keys(`doc:share:sheet:*`);
    for (const key of keys) {
      const role = await redis.hget(key, user.id);
      if (role) {
        const docId = key.replace("doc:share:sheet:", "");
        const doc = await prisma.note.findFirst({
          where: { id: docId, color: SHEET_MARKER },
          select: { id: true, title: true, pinned: true, createdAt: true, updatedAt: true, userId: true },
        });
        if (doc) sharedSheets.push({ ...doc, pinned: false });
      }
    }
  } catch { /* Redis unavailable */ }

  const all = [
    ...ownSheets.map((s) => ({ ...s, isOwner: true, sharedRole: null })),
    ...sharedSheets.map((s) => ({ ...s, isOwner: false, sharedRole: "editor" })),
  ];

  return NextResponse.json(all);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { title?: string };

  const defaultContent = JSON.stringify({
    sheets: [{ id: "s1", name: "Sheet 1", cells: {}, colWidths: {}, rowHeights: {} }],
    activeSheet: "s1",
  });

  const sheet = await prisma.note.create({
    data: {
      title: body.title?.trim() || "Untitled Spreadsheet",
      content: defaultContent,
      color: SHEET_MARKER,
      userId: user.id,
    },
  });

  return NextResponse.json(sheet, { status: 201 });
}
