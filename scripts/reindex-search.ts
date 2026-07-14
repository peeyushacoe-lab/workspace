/**
 * Backfills Meilisearch with everything created before the indexing
 * producers existed (or while Meilisearch was down). Safe to re-run —
 * indexDocument() is an upsert (Meilisearch addDocuments upserts by id).
 *
 * Usage: npm run reindex-search
 */
import { prisma } from "@/lib/prisma";
import { indexDocument, isSearchAvailable } from "@/lib/search-engine";

async function main() {
  if (!(await isSearchAvailable())) {
    console.error("[reindex-search] Meilisearch is not reachable (check MEILISEARCH_URL) — aborting.");
    process.exit(1);
  }

  let total = 0;

  // Email — index one document per thread (mirrors the compose-route producer)
  const threads = await prisma.inboxThread.findMany({
    where: { isTrashed: false },
    select: {
      id: true,
      subject: true,
      updatedAt: true,
      messages: { select: { textBody: true, from: true, to: true }, orderBy: { receivedAt: "desc" }, take: 1 },
    },
  });
  for (const t of threads) {
    const msg = t.messages[0];
    await indexDocument("email", t.id, {
      content: `${t.subject} ${msg?.textBody ?? ""}`,
      threadId: t.id,
      subject: t.subject,
      fromEmail: msg?.from ?? "",
      toEmail: msg?.to ?? "",
      updatedAt: t.updatedAt.toISOString(),
    });
    total++;
  }
  console.log(`[reindex-search] Indexed ${threads.length} email threads`);

  // Chat messages
  const chatMessages = await prisma.chatMessage.findMany({
    where: { deletedAt: null },
    select: {
      id: true, content: true, createdAt: true,
      channel: { select: { id: true, name: true } },
      user: { select: { fullName: true } },
    },
    take: 20000, // sane cap for a manual backfill run
  });
  for (const m of chatMessages) {
    await indexDocument("chat_message", m.id, {
      content: m.content,
      channelId: m.channel.id,
      channelName: m.channel.name,
      senderName: m.user.fullName,
      createdAt: m.createdAt.toISOString(),
    });
    total++;
  }
  console.log(`[reindex-search] Indexed ${chatMessages.length} chat messages`);

  // Drive files
  const files = await prisma.driveFile.findMany({
    where: { isTrashed: false },
    select: { id: true, name: true, mimeType: true, ownerId: true },
  });
  for (const f of files) {
    await indexDocument("file", f.id, {
      content: f.name,
      ownerId: f.ownerId,
      name: f.name,
      mimeType: f.mimeType,
    });
    total++;
  }
  console.log(`[reindex-search] Indexed ${files.length} drive files`);

  // Notes + docs (same table)
  const notes = await prisma.note.findMany({
    select: { id: true, title: true, content: true, userId: true, updatedAt: true },
  });
  for (const n of notes) {
    await indexDocument("note", n.id, {
      content: `${n.title} ${n.content}`,
      ownerId: n.userId,
      title: n.title,
      updatedAt: n.updatedAt.toISOString(),
    });
    total++;
  }
  console.log(`[reindex-search] Indexed ${notes.length} notes/docs`);

  // Meetings
  const meetings = await prisma.meeting.findMany({
    where: { status: { not: "CANCELLED" } },
    select: { id: true, title: true, description: true, organizerId: true, status: true, scheduledAt: true },
  });
  for (const mt of meetings) {
    await indexDocument("meeting", mt.id, {
      content: `${mt.title} ${mt.description ?? ""}`,
      organizerId: mt.organizerId,
      title: mt.title,
      status: mt.status,
      scheduledAt: (mt.scheduledAt ?? new Date()).toISOString(),
    });
    total++;
  }
  console.log(`[reindex-search] Indexed ${meetings.length} meetings`);

  // People
  const people = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, fullName: true, email: true, role: true, jobTitle: true, department: true },
  });
  for (const p of people) {
    await indexDocument("person", p.id, {
      content: `${p.fullName} ${p.email} ${p.jobTitle ?? ""} ${p.department ?? ""}`,
      role: p.role,
      fullName: p.fullName,
      email: p.email,
      department: p.department ?? "",
    });
    total++;
  }
  console.log(`[reindex-search] Indexed ${people.length} people`);

  console.log(`[reindex-search] Done — ${total} documents indexed.`);
}

main()
  .catch((err) => { console.error("[reindex-search] Fatal:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
