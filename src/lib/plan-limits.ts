/**
 * Plan limits enforcement — Phase 30 Monetization
 * Central source of truth for what each plan includes.
 */

export type Plan = "FREE" | "STARTER" | "PRO" | "ENTERPRISE";

export type PlanLimits = {
  maxUsers: number;
  maxStorageGb: number;
  maxApiKeys: number;
  maxWebhooks: number;
  aiEnabled: boolean;
  meetEnabled: boolean;
  whiteboardEnabled: boolean;
  retentionDays: number;
};

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    maxUsers: 5,
    maxStorageGb: 5,
    maxApiKeys: 2,
    maxWebhooks: 1,
    aiEnabled: false,
    meetEnabled: false,
    whiteboardEnabled: false,
    retentionDays: 30,
  },
  STARTER: {
    maxUsers: 25,
    maxStorageGb: 50,
    maxApiKeys: 5,
    maxWebhooks: 5,
    aiEnabled: true,
    meetEnabled: true,
    whiteboardEnabled: false,
    retentionDays: 90,
  },
  PRO: {
    maxUsers: 100,
    maxStorageGb: 250,
    maxApiKeys: 20,
    maxWebhooks: 20,
    aiEnabled: true,
    meetEnabled: true,
    whiteboardEnabled: true,
    retentionDays: 365,
  },
  ENTERPRISE: {
    maxUsers: 500,
    maxStorageGb: 2000,
    maxApiKeys: 100,
    maxWebhooks: 100,
    aiEnabled: true,
    meetEnabled: true,
    whiteboardEnabled: true,
    retentionDays: 2555, // 7 years
  },
};

export const PLAN_PRICES: Record<Plan, { monthly: number; annual: number }> = {
  FREE:       { monthly: 0,   annual: 0 },
  STARTER:    { monthly: 29,  annual: 290 },
  PRO:        { monthly: 99,  annual: 990 },
  ENTERPRISE: { monthly: 299, annual: 2990 },
};

export function getLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[(plan as Plan) in PLAN_LIMITS ? (plan as Plan) : "FREE"];
}
