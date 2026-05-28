/**
 * Billing — Phase 30 Monetization
 * GET  — returns org plan, usage, limits, and Stripe checkout URL scaffold
 * POST { plan }  — upgrades plan (no-op Stripe scaffold, update DB directly)
 * Requires OWNER orgRole or ADMIN system role
 */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLimits, PLAN_LIMITS, PLAN_PRICES, type Plan } from "@/lib/plan-limits";

async function requireBillingAccess() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return { user: null, org: null, error: "Unauthorized" as const };
  if (user.role !== "ADMIN" && user.orgRole !== "OWNER" && user.orgRole !== "ADMIN") {
    return { user, org: null, error: "Forbidden" as const };
  }

  const org = user.organizationId
    ? await prisma.organization.findUnique({ where: { id: user.organizationId } })
    : null;

  return { user, org, error: null };
}

export async function GET() {
  const { user, org, error } = await requireBillingAccess();
  if (error === "Unauthorized" || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (error === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const plan = (org?.plan ?? "FREE") as Plan;
  const limits = getLimits(plan);
  const userCount = org ? await prisma.user.count({ where: { organizationId: org.id } }) : 1;
  const apiKeyCount = await prisma.aPIKey.count({ where: { userId: user.id, isActive: true } });
  const webhookCount = await prisma.webhookEndpoint.count({ where: { userId: user.id, isActive: true } });

  return NextResponse.json({
    plan,
    limits,
    prices: PLAN_PRICES,
    usage: { users: userCount, apiKeys: apiKeyCount, webhooks: webhookCount },
    trialEndsAt: org?.trialEndsAt ?? null,
    stripeCustomerId: null, // set when Stripe is connected
    allPlans: Object.entries(PLAN_LIMITS).map(([p, l]) => ({ plan: p, limits: l, prices: PLAN_PRICES[p as Plan] })),
  });
}

export async function POST(request: NextRequest) {
  const { user, org, error } = await requireBillingAccess();
  if (error === "Unauthorized" || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (error === "Forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as { plan?: string };
  const newPlan = body.plan?.toUpperCase() as Plan | undefined;
  if (!newPlan || !(newPlan in PLAN_LIMITS)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  if (org) {
    await prisma.organization.update({
      where: { id: org.id },
      data: { plan: newPlan, maxUsers: PLAN_LIMITS[newPlan].maxUsers },
    });
  }

  // TODO: When STRIPE_SECRET_KEY is set, create a Stripe checkout session here
  // and return { checkoutUrl } instead of { ok: true }.

  return NextResponse.json({ ok: true, plan: newPlan, limits: getLimits(newPlan) });
}
