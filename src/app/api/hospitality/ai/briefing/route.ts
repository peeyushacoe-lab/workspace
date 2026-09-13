import { NextRequest, NextResponse }  from "next/server";
import { requireApiPermission }       from "@/lib/rbac/can";
import { prisma }                     from "@/lib/prisma";
import { claudeComplete }             from "@/lib/claude";
import { getAIClient, AI_MODEL }      from "@/lib/ai";
import { checkRateLimit }             from "@/lib/rate-limit";
import {
  buildAIContextPrompt,
  getBriefingTypeInstructions,
} from "@/lib/hospitality/ai-context";
import {
  getDemoMetrics,
  getDemoDepartments,
  getDemoAlerts,
  getDemoIntegrationsFull,
  DEMO_PROPERTY,
} from "@/lib/hospitality/demo-data";
import type { BriefingType, AIBriefing, InsightSection } from "@/lib/hospitality/types";

const VALID_TYPES: BriefingType[] = ["morning", "operations", "management", "incident"];

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(type: BriefingType, contextBlock: string): string {
  return `${getBriefingTypeInstructions(type)}

You are Nexus Intelligence, a hotel operations assistant integrated into the Nexus management platform.
Generate a structured management briefing based ONLY on the operational data below.

IMPORTANT RULES (follow strictly):
- Use ONLY the figures and facts provided — never invent hotel metrics, guest names, reservation numbers, or room details
- If a figure is unavailable, say "data unavailable" rather than estimating
- Do not suggest automatic changes to bookings, payroll, reservations, or external communications
- If data is from demo mode, acknowledge this once in the summary
- Keep each section body to 2-3 sentences maximum

Return ONLY valid JSON matching this schema exactly:
{
  "summary": "<One sentence executive summary>",
  "sections": [
    {
      "type": "GOOD" | "ATTENTION" | "RISK" | "FINANCIAL" | "RECOMMENDED",
      "title": "<Short section title>",
      "body": "<2-3 sentence explanation>",
      "priority": "normal" | "high" | "urgent"
    }
  ]
}

Include 3-6 sections total. Use "RISK" only for genuine operational risks. Use "RECOMMENDED" for 1-2 actionable recommendations (not automatic actions).

OPERATIONAL DATA:
${contextBlock}`;
}

// ─── Fallback briefing (no AI available) ──────────────────────────────────────

function buildFallbackBriefing(type: BriefingType, isDemo: boolean): AIBriefing {
  return {
    summary:      "Nexus Intelligence could not generate a briefing at this time.",
    sections:     [{
      type:     "ATTENTION",
      title:    "AI Briefing Unavailable",
      body:     "The Nexus Intelligence service is currently unavailable. Please check system status and try again. Use the metrics panel above to review operational data manually.",
      priority: "normal",
    }],
    briefingType: type,
    generatedAt:  new Date().toISOString(),
    isDemo,
    modelUsed:    "none",
  };
}

// ─── POST /api/hospitality/ai/briefing ───────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireApiPermission("hospitality.view");
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { allowed: rateLimitOk } = await checkRateLimit(`hospitality:ai:${user.id}`, 10, 60 * 60);
  if (!rateLimitOk) {
    return NextResponse.json({ error: "Rate limit reached — max 10 briefings per hour" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const briefingType: BriefingType = VALID_TYPES.includes(body?.type) ? body.type : "operations";

  // ── Build context ─────────────────────────────────────────────────────────
  let isDemo = true;
  const metrics = getDemoMetrics();
  const departments: ReturnType<typeof getDemoDepartments> = getDemoDepartments();
  let alertSummary = { critical: 1, high: 2, medium: 2, low: 1, resolved: 4, total: 6 };
  let openAlerts   = getDemoAlerts()
    .filter(a => a.status !== "RESOLVED" && a.status !== "DISMISSED")
    .map(a => ({ priority: a.priority, title: a.title }));
  let integSummary = {
    total:        getDemoIntegrationsFull().length,
    connected:    0,
    errors:       0,
    demo:         getDemoIntegrationsFull().length,
    disconnected: 0,
  };

  try {
    const properties = await prisma.hotelProperty.findMany({
      where: { organizationId: user.organizationId ?? undefined },
      select: { id: true },
    });
    if (properties.length) {
      isDemo = false;
      const propertyIds = properties.map(p => p.id);
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [critCount, highCount, medCount, lowCount, resolvedCount, alertRows, integRows] = await Promise.all([
        prisma.hotelAlert.count({ where: { propertyId: { in: propertyIds }, priority: "CRITICAL", status: { not: "RESOLVED" } } }),
        prisma.hotelAlert.count({ where: { propertyId: { in: propertyIds }, priority: "HIGH",     status: { not: "RESOLVED" } } }),
        prisma.hotelAlert.count({ where: { propertyId: { in: propertyIds }, priority: "MEDIUM",   status: { not: "RESOLVED" } } }),
        prisma.hotelAlert.count({ where: { propertyId: { in: propertyIds }, priority: "LOW",      status: { not: "RESOLVED" } } }),
        prisma.hotelAlert.count({ where: { propertyId: { in: propertyIds }, status: "RESOLVED",   resolvedAt: { gte: since } } }),
        prisma.hotelAlert.findMany({
          where:   { propertyId: { in: propertyIds }, status: { not: "RESOLVED" } },
          orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
          take:    6,
          select:  { priority: true, title: true },
        }),
        prisma.hotelIntegration.findMany({
          where:  { propertyId: { in: propertyIds } },
          select: { status: true },
        }),
      ]);

      const total = critCount + highCount + medCount + lowCount;
      alertSummary = { critical: critCount, high: highCount, medium: medCount, low: lowCount, resolved: resolvedCount, total };
      openAlerts   = alertRows.map(a => ({ priority: a.priority, title: a.title }));
      integSummary = {
        total:        integRows.length,
        connected:    integRows.filter(i => i.status === "connected").length,
        errors:       integRows.filter(i => i.status === "error").length,
        demo:         integRows.filter(i => i.status === "demo").length,
        disconnected: integRows.filter(i => i.status === "disconnected" || i.status === "disabled").length,
      };
    }
  } catch {
    // Fall through with demo data
  }

  const ctx = {
    property:     { name: DEMO_PROPERTY.name, totalRooms: DEMO_PROPERTY.totalRooms, city: DEMO_PROPERTY.city, currency: DEMO_PROPERTY.currency, isDemo },
    asOf:         new Date().toISOString(),
    briefingType,
    metrics,
    alerts:       { ...alertSummary, openList: openAlerts },
    departments,
    integrations: integSummary,
    isDemo,
  };

  const contextBlock = buildAIContextPrompt(ctx);
  const systemPrompt = "You are Nexus Intelligence, a professional hotel operations AI. Return only valid JSON.";
  const userPrompt   = buildPrompt(briefingType, contextBlock);

  // ── Call AI (Claude primary, OpenAI fallback) ─────────────────────────────
  let raw: string | null = null;
  let modelUsed         = "none";

  raw = await claudeComplete(systemPrompt, userPrompt, 1200);
  if (raw) modelUsed = "claude";

  if (!raw) {
    try {
      const ai         = getAIClient();
      const completion = await ai.chat.completions.create({
        model:       AI_MODEL,
        messages:    [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        temperature: 0.3,
        max_tokens:  1200,
      });
      raw       = completion.choices[0]?.message?.content ?? null;
      modelUsed = AI_MODEL;
    } catch {
      return NextResponse.json({ briefing: buildFallbackBriefing(briefingType, isDemo) });
    }
  }

  if (!raw) return NextResponse.json({ briefing: buildFallbackBriefing(briefingType, isDemo) });

  // ── Parse AI response ─────────────────────────────────────────────────────
  let parsed: { summary: string; sections: InsightSection[] };
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.summary || !Array.isArray(parsed.sections)) throw new Error("Invalid schema");
  } catch {
    return NextResponse.json({ briefing: buildFallbackBriefing(briefingType, isDemo) });
  }

  // ── Safety: strip any invented guest/reservation data ─────────────────────
  const BANNED_PATTERNS = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;  // proper names
  const sanitize = (s: string) => s.replace(BANNED_PATTERNS, "[guest]");

  const briefing: AIBriefing = {
    summary:      sanitize(String(parsed.summary).slice(0, 300)),
    sections:     (parsed.sections ?? []).slice(0, 8).map(s => ({
      type:     (["GOOD","ATTENTION","RISK","FINANCIAL","RECOMMENDED"].includes(s.type) ? s.type : "ATTENTION") as InsightSection["type"],
      title:    sanitize(String(s.title   ?? "").slice(0, 100)),
      body:     sanitize(String(s.body    ?? "").slice(0, 500)),
      priority: (["normal","high","urgent"].includes(s.priority) ? s.priority : "normal") as InsightSection["priority"],
    })),
    briefingType,
    generatedAt:  new Date().toISOString(),
    isDemo,
    modelUsed,
  };

  return NextResponse.json({ briefing });
}
