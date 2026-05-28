/**
 * GDPR Data Export — Phase 27 Compliance
 * GET  ?format=json|csv  — streams a full data package for the requesting user
 */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const format = request.nextUrl.searchParams.get("format") ?? "json";

  const mailboxIds = (
    await prisma.mailboxAccess.findMany({ where: { userId: user.id }, select: { mailboxId: true } })
  ).map(m => m.mailboxId);

  const [profile, messages, chatMessages, events, notes, auditLogs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, fullName: true, role: true, createdAt: true },
    }),
    prisma.inboxMessage.findMany({
      where: { thread: { mailboxId: { in: mailboxIds } } },
      select: { id: true, from: true, to: true, subject: true, textBody: true, receivedAt: true },
      take: 5000,
    }),
    prisma.chatMessage.findMany({
      where: { userId: user.id },
      select: { id: true, content: true, createdAt: true, channelId: true },
      take: 5000,
    }),
    prisma.calendarEvent.findMany({
      where: { organizerId: user.id },
      select: { id: true, title: true, startAt: true, endAt: true, description: true },
      take: 1000,
    }),
    prisma.note.findMany({
      where: { userId: user.id },
      select: { id: true, title: true, content: true, createdAt: true, updatedAt: true },
      take: 1000,
    }),
    prisma.auditLog.findMany({
      where: { actorId: user.id },
      select: { id: true, action: true, targetType: true, targetId: true, createdAt: true, metadata: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
  ]);

  const payload = { profile, messages, chatMessages, calendarEvents: events, notes, auditLogs };

  if (format === "csv") {
    const lines = [
      "type,id,summary,date",
      ...messages.map((m: { id: string; subject: string; receivedAt: Date | null }) =>
        `message,${m.id},"${(m.subject ?? "").replace(/"/g, '""')}",${m.receivedAt?.toISOString() ?? ""}`),
      ...chatMessages.map((m: { id: string; content: string; createdAt: Date }) =>
        `chat,${m.id},"${m.content.slice(0, 100).replace(/"/g, '""')}",${m.createdAt.toISOString()}`),
      ...notes.map((n: { id: string; title: string | null; createdAt: Date }) =>
        `note,${n.id},"${(n.title ?? "").replace(/"/g, '""')}",${n.createdAt.toISOString()}`),
    ];
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="cybersage-export-${user.id}.csv"`,
      },
    });
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="cybersage-export-${user.id}.json"`,
    },
  });
}
