/**
 * Observability Metrics — Phase 28
 * GET — returns Prometheus-compatible text/plain or JSON metrics
 * Admin/CISO only
 */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const ALLOWED_ROLES = new Set(["ADMIN", "CISO"]);

export async function GET(request: NextRequest) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_ROLES.has(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const format = request.nextUrl.searchParams.get("format") ?? "json";
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000);

  const [
    userCount,
    activeUserCount,
    messageCount,
    threadCount,
    chatMessageCount,
    meetingCount,
    driveFileCount,
    auditLogCount,
    alertCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.loginEvent.count({ where: { createdAt: { gte: thirtyDaysAgo }, success: true } }),
    prisma.inboxMessage.count(),
    prisma.inboxThread.count(),
    prisma.chatMessage.count(),
    prisma.meeting.count(),
    prisma.driveFile.count(),
    prisma.auditLog.count(),
    prisma.sentinelAlert.count({ where: { acknowledged: false } }),
  ]);

  // Redis memory
  let redisMemoryMb = 0;
  try {
    const info = await redis.info("memory");
    const match = info.match(/used_memory:(\d+)/);
    if (match) redisMemoryMb = Math.round(Number(match[1]) / 1024 / 1024 * 100) / 100;
  } catch { /* redis optional */ }

  const metrics = {
    users_total: userCount,
    users_active_30d: activeUserCount,
    messages_total: messageCount,
    threads_total: threadCount,
    chat_messages_total: chatMessageCount,
    meetings_total: meetingCount,
    drive_files_total: driveFileCount,
    audit_logs_total: auditLogCount,
    sentinel_alerts_open: alertCount,
    redis_memory_mb: redisMemoryMb,
    collected_at: new Date().toISOString(),
  };

  if (format === "prometheus") {
    const lines = Object.entries(metrics)
      .filter(([, v]) => typeof v === "number")
      .map(([k, v]) => `cybersage_${k} ${v}`)
      .join("\n");
    return new NextResponse(lines + "\n", { headers: { "Content-Type": "text/plain; version=0.0.4" } });
  }

  return NextResponse.json(metrics);
}
