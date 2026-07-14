/**
 * Sentinel Brain — AI threat correlation engine.
 *
 * Scans recent SentinelAlert + DLPViolation events, groups them by the user
 * they're attributed to, and where a single user has multiple distinct
 * security signals within a short window, auto-assembles a SecurityIncident
 * with an AI-generated (Claude) narrative timeline — instead of leaving SOC
 * analysts to manually notice that five unrelated-looking alerts are
 * actually one attack chain.
 *
 * Runs on a recurring cleanup-queue job (see cleanup.worker.ts /
 * scripts/worker.ts) so it works the same in dev and prod without a
 * dedicated always-on process.
 */
import { prisma } from "@/lib/prisma";
import { claudeComplete } from "@/lib/claude";
import { logger } from "@/lib/logger";

const CORRELATION_WINDOW_HOURS = 24;
const MIN_EVENTS_TO_CORRELATE = 2;

type CorrelatedEvent = {
  kind: "alert" | "dlp";
  id: string;
  type: string;
  severity: string;
  description: string;
  createdAt: Date;
};

function severityRank(s: string): number {
  switch (s.toUpperCase()) {
    case "CRITICAL": return 4;
    case "HIGH": return 3;
    case "MEDIUM": return 2;
    default: return 1;
  }
}

function highestSeverity(events: CorrelatedEvent[]): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  const top = events.reduce((max, e) => (severityRank(e.severity) > severityRank(max) ? e.severity : max), "LOW");
  const upper = top.toUpperCase();
  return (["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(upper) ? upper : "MEDIUM") as never;
}

async function buildNarrative(userLabel: string, events: CorrelatedEvent[]): Promise<string> {
  const eventLines = events
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((e) => `- [${e.createdAt.toISOString()}] (${e.kind}, ${e.severity}) ${e.type}: ${e.description}`)
    .join("\n");

  const aiNarrative = await claudeComplete(
    "You are a SOC analyst assistant. Given a list of security signals attributed to the same user within a short time window, " +
      "write a concise (3-5 sentence) incident summary explaining what likely happened, why these signals are related, and what " +
      "the immediate risk is. Be factual and avoid speculation beyond what the events support. Do not use markdown headers.",
    `User: ${userLabel}\n\nSignals in the last ${CORRELATION_WINDOW_HOURS}h:\n${eventLines}`,
    500,
  );

  if (aiNarrative) return aiNarrative.trim();

  // Deterministic fallback when Claude isn't configured — still a real,
  // data-driven summary, just without the AI-authored prose.
  return `${events.length} correlated security signals for ${userLabel} within ${CORRELATION_WINDOW_HOURS}h:\n${eventLines}`;
}

export async function runSentinelCorrelation(): Promise<{ incidentsCreated: number; usersEvaluated: number }> {
  const since = new Date(Date.now() - CORRELATION_WINDOW_HOURS * 60 * 60 * 1000);

  const [alerts, violations] = await Promise.all([
    prisma.sentinelAlert.findMany({
      where: { createdAt: { gte: since }, resolvedAt: null, userId: { not: null } },
      select: { id: true, alertType: true, severity: true, description: true, userId: true, createdAt: true },
    }),
    prisma.dLPViolation.findMany({
      where: { createdAt: { gte: since }, resolved: false, userId: { not: null } },
      select: { id: true, resourceType: true, action: true, snippet: true, userId: true, createdAt: true },
    }),
  ]);

  const byUser = new Map<string, CorrelatedEvent[]>();
  for (const a of alerts) {
    if (!a.userId) continue;
    const list = byUser.get(a.userId) ?? [];
    list.push({ kind: "alert", id: a.id, type: a.alertType, severity: a.severity, description: a.description, createdAt: a.createdAt });
    byUser.set(a.userId, list);
  }
  for (const v of violations) {
    if (!v.userId) continue;
    const list = byUser.get(v.userId) ?? [];
    list.push({
      kind: "dlp",
      id: v.id,
      type: `DLP: ${v.resourceType}`,
      severity: v.action === "BLOCKED" ? "HIGH" : "MEDIUM",
      description: v.snippet ? `${v.action} — "${v.snippet.slice(0, 120)}"` : v.action,
      createdAt: v.createdAt,
    });
    byUser.set(v.userId, list);
  }

  let incidentsCreated = 0;
  let incidentsUpdated = 0;

  for (const [userId, events] of byUser) {
    if (events.length < MIN_EVENTS_TO_CORRELATE) continue;

    const sourceIds = events.map((e) => e.id).sort();

    // Dedup on the indexed sourceId (userId) column, not a JSON-path query —
    // one open Sentinel Brain incident per user at a time. The event window
    // is rolling (last 24h), so the exact event set naturally drifts run to
    // run; we update the existing incident with any genuinely new signals
    // instead of matching on an exact set, which would never re-match and
    // would spam a fresh incident every cycle.
    const existing = await prisma.securityIncident.findFirst({
      where: {
        sourceType: "SENTINEL_BRAIN",
        sourceId: userId,
        status: { in: ["OPEN", "INVESTIGATING"] },
      },
    }).catch(() => null);

    if (existing) {
      const knownIds = new Set<string>(
        Array.isArray((existing.metadata as { correlationKey?: string[] } | null)?.correlationKey)
          ? ((existing.metadata as { correlationKey: string[] }).correlationKey)
          : [],
      );
      const newEvents = events.filter((e) => !knownIds.has(e.id));
      if (newEvents.length === 0) continue; // nothing new — leave the incident as-is

      await prisma.securityIncident.update({
        where: { id: existing.id },
        data: {
          severity: highestSeverity(events),
          metadata: { correlationKey: sourceIds, eventCount: events.length, userId } as never,
          timeline: {
            create: newEvents.map((e) => ({
              action: `${e.kind.toUpperCase()}_SIGNAL`,
              note: `${e.type}: ${e.description}`,
              createdAt: e.createdAt,
            })),
          },
        },
      });
      incidentsUpdated++;
      continue;
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, email: true } });
    const userLabel = user ? `${user.fullName} (${user.email})` : userId;

    const description = await buildNarrative(userLabel, events);
    const severity = highestSeverity(events);

    await prisma.securityIncident.create({
      data: {
        title: `Correlated activity: ${user?.fullName ?? "Unknown user"} (${events.length} signals)`,
        description,
        severity,
        sourceType: "SENTINEL_BRAIN",
        sourceId: userId,
        metadata: { correlationKey: sourceIds, eventCount: events.length, userId } as never,
        timeline: {
          create: [
            { action: "AUTO_CORRELATED", note: `Sentinel Brain grouped ${events.length} signals into this incident.` },
            ...events.map((e) => ({
              action: `${e.kind.toUpperCase()}_SIGNAL`,
              note: `${e.type}: ${e.description}`,
              createdAt: e.createdAt,
            })),
          ],
        },
      },
    });

    incidentsCreated++;
  }

  logger.info({ incidentsCreated, incidentsUpdated, usersEvaluated: byUser.size }, "[sentinel-brain] Correlation pass complete");
  return { incidentsCreated, usersEvaluated: byUser.size };
}
