import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

  // Run non-EmailLog counts in parallel, and collapse all EmailLog counts into two raw queries
  const [
    totalUsers,
    activeUsers,
    totalMailboxes,
    totalContacts,
    openIncidents,
    chatMessages,
    driveFiles,
    emailLogSummary,
    emailLog30dSummary,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.mailbox.count(),
    prisma.contact.count(),
    prisma.securityIncident.count({ where: { status: { in: ["OPEN", "INVESTIGATING"] } } }),
    prisma.chatMessage.count({ where: { deletedAt: null } }),
    prisma.driveFile.count({ where: { isTrashed: false } }),
    // All-time EmailLog stats in one query
    prisma.$queryRaw<Array<{
      total: bigint;
      today: bigint;
      dlp_violations: bigint;
    }>>`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE "createdAt" >= ${todayStart}) AS today,
        COUNT(*) FILTER (WHERE error LIKE '%DLP Violation%') AS dlp_violations
      FROM "EmailLog"
    `,
    // 30-day EmailLog breakdown in one query
    prisma.$queryRaw<Array<{
      sent30d: bigint;
      delivered30d: bigint;
      bounced30d: bigint;
      opened30d: bigint;
    }>>`
      SELECT
        COUNT(*) AS sent30d,
        COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered30d,
        COUNT(*) FILTER (WHERE status = 'BOUNCED') AS bounced30d,
        COUNT(*) FILTER (WHERE status = 'OPENED') AS opened30d
      FROM "EmailLog"
      WHERE "createdAt" >= ${thirtyDaysAgo}
    `,
  ]);

  const emailSummary = emailLogSummary[0] ?? { total: BigInt(0), today: BigInt(0), dlp_violations: BigInt(0) };
  const email30d = emailLog30dSummary[0] ?? { sent30d: BigInt(0), delivered30d: BigInt(0), bounced30d: BigInt(0), opened30d: BigInt(0) };

  const totalEmails = Number(emailSummary.total);
  const emailsToday = Number(emailSummary.today);
  const dlpViolations = Number(emailSummary.dlp_violations);
  const emailsSent30d = Number(email30d.sent30d);
  const emailsDelivered30d = Number(email30d.delivered30d);
  const emailsBounced30d = Number(email30d.bounced30d);
  const emailsOpened30d = Number(email30d.opened30d);

  const deliveryRate = emailsSent30d > 0 ? Math.round((emailsDelivered30d / emailsSent30d) * 100) : 0;
  const bounceRate = emailsSent30d > 0 ? Math.round((emailsBounced30d / emailsSent30d) * 100) : 0;
  const openRate = emailsSent30d > 0 ? Math.round((emailsOpened30d / emailsSent30d) * 100) : 0;

  return NextResponse.json({
    users: { total: totalUsers, active: activeUsers },
    mailboxes: totalMailboxes,
    emails: { total: totalEmails, today: emailsToday },
    contacts: totalContacts,
    security: { openIncidents, dlpViolations },
    chat: { messages: chatMessages },
    drive: { files: driveFiles },
    emailStats30d: {
      sent: emailsSent30d,
      delivered: emailsDelivered30d,
      bounced: emailsBounced30d,
      opened: emailsOpened30d,
      deliveryRate,
      bounceRate,
      openRate,
    },
  }, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
  });
}
