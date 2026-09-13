// ─── Demo Reputation Adapter ──────────────────────────────────────────────────
// Simulates a guest reputation / review management platform.
// No external calls.

import type { HotelIntegrationAdapter } from "./base";
import type { AdapterSyncResult, HealthCheckResult, IntegrationStatus } from "../types";

export class DemoReputationAdapter implements HotelIntegrationAdapter {
  readonly type             = "reputation";
  readonly category         = "REPUTATION" as const;
  readonly label            = "Reputation Platform";
  readonly supportedDataTypes = ["reviews", "scores", "sentiment"] as const;

  async connect() {
    return { success: true };
  }

  async disconnect() {}

  async healthCheck(): Promise<HealthCheckResult> {
    return { healthy: true, latencyMs: 22, details: "Demo reputation platform responding normally" };
  }

  async getStatus(): Promise<IntegrationStatus> {
    return "demo";
  }

  async sync(): Promise<AdapterSyncResult> {
    return {
      success: true,
      data: {
        overallScore: 8.7,
        reviewCount:  1284,
        recentReviews: [
          { platform: "TripAdvisor",   score: 9.0, summary: "Exceptional service and beautiful property" },
          { platform: "Google",        score: 8.5, summary: "Excellent stay, minor delay with room service" },
          { platform: "Booking.com",   score: 8.8, summary: "Perfect location and wonderful staff" },
          { platform: "Hotels.com",    score: 8.6, summary: "Will definitely return — pool is stunning" },
        ],
        sentimentBreakdown: { positive: 78, neutral: 14, negative: 8 },
      },
      dataTypes:   ["reviews", "scores", "sentiment"],
      recordCount: 1284,
    };
  }
}
