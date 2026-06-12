import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { SLIDE_MARKER } from "@/lib/doc-markers";

const defaultSlide = {
  id: "slide-1",
  background: "#ffffff",
  elements: [
    { id: "el-1", type: "text", x: 80, y: 200, w: 760, h: 100,
      content: "Click to add title", style: { fontSize: 48, bold: true, color: "#202124", align: "center" } },
    { id: "el-2", type: "text", x: 80, y: 320, w: 760, h: 60,
      content: "Click to add subtitle", style: { fontSize: 24, bold: false, color: "#5f6368", align: "center" } },
  ],
};

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ownPres = await prisma.note.findMany({
    where: { userId: user.id, color: SLIDE_MARKER },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    select: { id: true, title: true, pinned: true, createdAt: true, updatedAt: true, userId: true },
  });

  const sharedPres: typeof ownPres = [];
  try {
    const keys = await redis.keys(`doc:share:pres:*`);
    for (const key of keys) {
      const role = await redis.hget(key, user.id);
      if (role) {
        const docId = key.replace("doc:share:pres:", "");
        const doc = await prisma.note.findFirst({
          where: { id: docId, color: SLIDE_MARKER },
          select: { id: true, title: true, pinned: true, createdAt: true, updatedAt: true, userId: true },
        });
        if (doc) sharedPres.push({ ...doc, pinned: false });
      }
    }
  } catch { /* Redis unavailable */ }

  const all = [
    ...ownPres.map((p) => ({ ...p, isOwner: true, sharedRole: null })),
    ...sharedPres.map((p) => ({ ...p, isOwner: false, sharedRole: "editor" })),
  ];

  return NextResponse.json(all);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { title?: string };

  const defaultContent = JSON.stringify({
    slides: [defaultSlide],
    theme: "light",
    slideSize: { w: 960, h: 540 },
  });

  const pres = await prisma.note.create({
    data: {
      title: body.title?.trim() || "Untitled Presentation",
      content: defaultContent,
      color: SLIDE_MARKER,
      userId: user.id,
    },
  });

  return NextResponse.json(pres, { status: 201 });
}
