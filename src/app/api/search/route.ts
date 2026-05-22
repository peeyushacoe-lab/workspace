import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type SearchResult = {
  id: string;
  type: "mail" | "chat" | "drive" | "calendar";
  title: string;
  excerpt: string;
  link: string;
  createdAt: string;
  metadata?: Record<string, string>;
};

function excerpt(text: string | null | undefined, max = 120): string {
  if (!text) return "";
  return text.length <= max ? text : text.slice(0, max);
}

async function searchMail(q: string, userId: string, limit: number): Promise<SearchResult[]> {
  const messages = await prisma.inboxMessage.findMany({
    where: {
      OR: [
        { subject: { contains: q, mode: "insensitive" } },
        { textBody: { contains: q, mode: "insensitive" } },
        { from: { contains: q, mode: "insensitive" } },
      ],
      thread: {
        mailbox: {
          accessLogs: { some: { userId } },
        },
      },
    },
    select: {
      id: true,
      subject: true,
      textBody: true,
      from: true,
      receivedAt: true,
      thread: { select: { id: true } },
    },
    orderBy: { receivedAt: "desc" },
    take: limit,
  });

  return messages.map((m) => ({
    id: m.id,
    type: "mail",
    title: m.subject,
    excerpt: excerpt(m.textBody),
    link: "/inbox",
    createdAt: m.receivedAt.toISOString(),
    metadata: { from: m.from, threadId: m.thread.id },
  }));
}

async function searchChat(q: string, userId: string, limit: number): Promise<SearchResult[]> {
  const messages = await prisma.chatMessage.findMany({
    where: {
      content: { contains: q, mode: "insensitive" },
      deletedAt: null,
      channel: {
        members: { some: { userId } },
      },
    },
    select: {
      id: true,
      content: true,
      createdAt: true,
      channel: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return messages.map((m) => ({
    id: m.id,
    type: "chat",
    title: m.channel.name,
    excerpt: excerpt(m.content),
    link: "/chat",
    createdAt: m.createdAt.toISOString(),
    metadata: { channelId: m.channel.id },
  }));
}

async function searchDrive(q: string, userId: string, limit: number): Promise<SearchResult[]> {
  const files = await prisma.driveFile.findMany({
    where: {
      ownerId: userId,
      isTrashed: false,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { mimeType: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      mimeType: true,
      size: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return files.map((f) => ({
    id: f.id,
    type: "drive",
    title: f.name,
    excerpt: `${f.mimeType} · ${(Number(f.size) / 1024).toFixed(1)} KB`,
    link: "/drive",
    createdAt: f.createdAt.toISOString(),
    metadata: { mimeType: f.mimeType },
  }));
}

async function searchCalendar(q: string, userId: string, limit: number): Promise<SearchResult[]> {
  const events = await prisma.calendarEvent.findMany({
    where: {
      organizerId: userId,
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { location: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      title: true,
      description: true,
      location: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return events.map((e) => ({
    id: e.id,
    type: "calendar",
    title: e.title,
    excerpt: excerpt(e.description ?? e.location),
    link: "/calendar",
    createdAt: e.createdAt.toISOString(),
    metadata: e.location ? { location: e.location } : undefined,
  }));
}

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const type = searchParams.get("type") ?? "all";
  const rawLimit = parseInt(searchParams.get("limit") ?? "10", 10);
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 10 : rawLimit), 50);

  if (q.length < 2) {
    return NextResponse.json({ results: [], total: 0 });
  }

  const searches: Promise<SearchResult[]>[] = [];

  if (type === "all" || type === "mail") searches.push(searchMail(q, user.id, limit));
  if (type === "all" || type === "chat") searches.push(searchChat(q, user.id, limit));
  if (type === "all" || type === "drive") searches.push(searchDrive(q, user.id, limit));
  if (type === "all" || type === "calendar") searches.push(searchCalendar(q, user.id, limit));

  const buckets = await Promise.all(searches);
  const merged = buckets
    .flat()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);

  return NextResponse.json({ results: merged, total: merged.length });
}
