import { prisma } from "@/lib/prisma";

/**
 * Capture a platform metrics snapshot. Called by the worker on a schedule.
 * Records key counters to MetricSnapshot for trend charting.
 */
export async function captureMetrics(): Promise<void> {
  const now = new Date();

  const [
    activeUsers,
    emailsSentToday,
    filesUploaded,
    openAlerts,
    openIncidents,
    workflowRuns,
  ] = await Promise.all([
    prisma.userSession.count({ where: { expiresAt: { gt: now } } }),
    prisma.emailLog.count({ where: { createdAt: { gte: new Date(now.getTime() - 86_400_000) } } }),
    prisma.driveFile.count({ where: { isTrashed: false } }),
    prisma.sentinelAlert.count({ where: { acknowledged: false } }),
    prisma.securityIncident.count({ where: { status: { in: ["OPEN", "INVESTIGATING"] } } }),
    prisma.workflowRun.count({ where: { startedAt: { gte: new Date(now.getTime() - 86_400_000) } } }),
  ]);

  await prisma.metricSnapshot.createMany({
    data: [
      { name: "active_sessions",      value: activeUsers },
      { name: "emails_sent_24h",      value: emailsSentToday },
      { name: "total_files",          value: filesUploaded },
      { name: "open_alerts",          value: openAlerts },
      { name: "open_incidents",       value: openIncidents },
      { name: "workflow_runs_24h",    value: workflowRuns },
    ],
  });
}
