"use client";

import { useState, useEffect } from "react";
import { CreditCard, Check, Zap, Building2, Rocket, Star } from "lucide-react";
import { PageHeader } from "@/components/Shell";

type Plan = "FREE" | "STARTER" | "PRO" | "ENTERPRISE";

type PlanInfo = {
  plan: Plan;
  limits: { maxUsers: number; maxStorageGb: number; maxApiKeys: number; aiEnabled: boolean; meetEnabled: boolean; whiteboardEnabled: boolean; retentionDays: number };
  prices: { monthly: number; annual: number };
};

type BillingData = {
  plan: Plan;
  usage: { users: number; apiKeys: number; webhooks: number };
  limits: PlanInfo["limits"] & { whiteboardEnabled: boolean };
  trialEndsAt: string | null;
  allPlans: PlanInfo[];
};

const PLAN_ICONS: Record<Plan, typeof CreditCard> = {
  FREE: Zap,
  STARTER: Rocket,
  PRO: Star,
  ENTERPRISE: Building2,
};

const PLAN_COLORS: Record<Plan, string> = {
  FREE:       "text-subtle",
  STARTER:    "text-ok",
  PRO:        "text-accent",
  ENTERPRISE: "text-warn",
};

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [upgrading, setUpgrading] = useState<Plan | null>(null);

  useEffect(() => {
    void fetch("/api/billing").then(r => r.json()).then(d => setData(d as BillingData));
  }, []);

  const handleUpgrade = async (plan: Plan) => {
    if (plan === data?.plan) return;
    setUpgrading(plan);
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (res.ok) {
        const updated = await res.json() as { plan: Plan };
        setData(prev => prev ? { ...prev, plan: updated.plan } : prev);
      }
    } finally {
      setUpgrading(null);
    }
  };

  return (
    <div className="min-h-full bg-surface text-foreground">
      <PageHeader
        eyebrow="Monetization · Phase 30"
        title="Billing & Plans"
        description="Manage your workspace plan and usage"
      />

      <div className="px-6 pb-10 max-w-5xl space-y-6">
        {/* Current usage */}
        {data && (
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-4 h-4 text-accent" />
              <span className="font-medium text-sm">Current Plan: <span className={PLAN_COLORS[data.plan]}>{data.plan}</span></span>
              {data.trialEndsAt && (
                <span className="ml-auto text-xs text-warn">Trial ends {new Date(data.trialEndsAt).toLocaleDateString()}</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="bg-surface-sunken rounded-lg p-3">
                <p className="text-subtle text-xs mb-1">Users</p>
                <p className="font-semibold font-mono">{data.usage.users} / {data.limits.maxUsers}</p>
                <div className="mt-2 h-1 bg-surface-sunken rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (data.usage.users / data.limits.maxUsers) * 100)}%`, background: "linear-gradient(135deg,var(--accent),var(--accent-hover))" }} />
                </div>
              </div>
              <div className="bg-surface-sunken rounded-lg p-3">
                <p className="text-subtle text-xs mb-1">API Keys</p>
                <p className="font-semibold font-mono">{data.usage.apiKeys} / {data.limits.maxApiKeys}</p>
              </div>
              <div className="bg-surface-sunken rounded-lg p-3">
                <p className="text-subtle text-xs mb-1">Webhooks</p>
                <p className="font-semibold font-mono">{data.usage.webhooks}</p>
              </div>
            </div>
          </div>
        )}

        {/* Billing toggle */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">Billing period:</span>
          {(["monthly", "annual"] as const).map(period => (
            <button
              key={period}
              onClick={() => setBilling(period)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${billing === period ? "bg-accent/15 text-accent border border-accent/30" : "bg-surface-sunken text-muted hover:bg-border"}`}
            >
              {period === "annual" ? "Annual (save ~17%)" : "Monthly"}
            </button>
          ))}
        </div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {data?.allPlans.map(({ plan, limits, prices }) => {
            const Icon = PLAN_ICONS[plan];
            const isCurrent = data.plan === plan;
            const price = billing === "annual" ? Math.round(prices.annual / 12) : prices.monthly;
            return (
              <div key={plan} className={`relative bg-surface border rounded-xl p-5 flex flex-col gap-4 ${isCurrent ? "border-accent/40" : "border-border"}`}>
                {isCurrent && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] bg-accent text-accent-foreground font-semibold px-2 py-0.5 rounded-full">CURRENT</span>
                )}
                <div>
                  <Icon className={`w-5 h-5 mb-2 ${PLAN_COLORS[plan]}`} />
                  <h3 className="font-semibold text-base">{plan}</h3>
                  <p className="text-2xl font-semibold mt-1 font-mono">
                    {price === 0 ? "Free" : `$${price}`}
                    {price > 0 && <span className="text-sm font-normal text-subtle">/mo</span>}
                  </p>
                  {billing === "annual" && price > 0 && <p className="text-xs text-subtle font-mono">${prices.annual}/yr billed annually</p>}
                </div>
                <ul className="space-y-1.5 text-xs text-muted flex-1">
                  {[
                    `${limits.maxUsers} users`,
                    `${limits.maxStorageGb} GB storage`,
                    `${limits.maxApiKeys} API keys`,
                    limits.aiEnabled && "AI assistant",
                    limits.meetEnabled && "Video meetings",
                    limits.whiteboardEnabled && "Whiteboard",
                    `${limits.retentionDays}d retention`,
                  ].filter(Boolean).map((feat, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-ok flex-shrink-0" />
                      {feat as string}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => void handleUpgrade(plan)}
                  disabled={isCurrent || upgrading !== null}
                  className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors ${isCurrent ? "bg-surface-sunken text-subtle cursor-default" : "bg-accent text-accent-foreground hover:bg-accent-hover"} disabled:opacity-60`}
                >
                  {upgrading === plan ? "Upgrading…" : isCurrent ? "Current plan" : plan === "FREE" ? "Downgrade" : "Upgrade"}
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-subtle">
          Stripe payment integration coming soon. Plan changes take effect immediately.
        </p>
      </div>
    </div>
  );
}
