/**
 * Data Retention Policy — Phase 27 Compliance
 * POST  { dryRun?: boolean }  — purge data older than retention windows
 * Admin only — intended to be called by a scheduled cron
 */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const RETENTION = {
  auditLogDays: 365,
  trashMessageDays: 30,
} as const;

export async function POST(request: NextRequest) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as { dryRun?: boolean };
  const dryRun = body.dryRun === true;

  const now = new Date();
  const auditCutoff = new Date(now.getTime() - RETENTION.auditLogDays * 86400 * 1000);
  const trashCutoff = new Date(now.getTime() - RETENTION.trashMessageDays * 86400 * 1000);

  if (dryRun) {
    const [auditCount, trashCount] = await Promise.all([
      prisma.auditLog.count({ where: { createdAt: { lt: auditCutoff } } }),
      prisma.inboxThread.count({ where: { isTrashed: true, updatedAt: { lt: trashCutoff } } }),
    ]);
    return NextResponse.json({ dryRun: true, wouldDelete: { auditLogs: auditCount, trashedThreads: trashCount } });
  }

  const [auditResult, trashResult] = await Promise.all([
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } }),
    prisma.inboxThread.deleteMany({ where: { isTrashed: true, updatedAt: { lt: trashCutoff } } }),
  ]);

  return NextResponse.json({
    ok: true,
    deleted: { auditLogs: auditResult.count, trashedThreads: trashResult.count },
    cutoffs: { auditLog: auditCutoff.toISOString(), trash: trashCutoff.toISOString() },
  });
}
