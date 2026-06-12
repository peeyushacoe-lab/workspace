import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { SHEET_MARKER } from "../../route";

type Params = { params: Promise<{ id: string }> };

function shareKey(docId: string) { return `doc:share:sheet:${docId}`; }

export async function GET(_req: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const doc = await prisma.note.findFirst({ where: { id, color: SHEET_MARKER } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (doc.userId !== user.id && !["ADMIN","CEO","CISO"].includes(user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const raw = await redis.hgetall(shareKey(id)) as Record<string, string> | null;
  const shares: { userId: string; role: string; name?: string; email?: string }[] = [];
  if (raw) {
    const userIds = Object.keys(raw);
    const users = userIds.length ? await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, email: true },
    }) : [];
    for (const [uid, role] of Object.entries(raw)) {
      const u = users.find((x) => x.id === uid);
      shares.push({ userId: uid, role, name: u?.fullName, email: u?.email });
    }
  }
  return NextResponse.json({ shares, ownerId: doc.userId });
}

export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const doc = await prisma.note.findFirst({ where: { id, color: SHEET_MARKER } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (doc.userId !== user.id && !["ADMIN","CEO","CISO"].includes(user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json()) as { email?: string; userId?: string; role?: string };
  const role = body.role ?? "viewer";

  let targetUser = body.userId
    ? await prisma.user.findFirst({ where: { id: body.userId }, select: { id: true, fullName: true, email: true } })
    : body.email
    ? await prisma.user.findFirst({ where: { email: body.email }, select: { id: true, fullName: true, email: true } })
    : null;

  if (!targetUser) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (targetUser.id === doc.userId) return NextResponse.json({ error: "Cannot share with owner" }, { status: 400 });

  await redis.hset(shareKey(id), { [targetUser.id]: role });
  return NextResponse.json({ userId: targetUser.id, role, name: targetUser.fullName, email: targetUser.email });
}

export async function DELETE(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const doc = await prisma.note.findFirst({ where: { id, color: SHEET_MARKER } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (doc.userId !== user.id && !["ADMIN","CEO","CISO"].includes(user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = (await request.json()) as { userId: string };
  if (userId) await redis.hdel(shareKey(id), userId);
  return NextResponse.json({ ok: true });
}
