import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/rbac/can";

// GET /api/clients/revenue-summary — the executive-dashboard rollup.
//
// Gated on `clients.finance.read` alone, same as the client book itself: a
// Business Manager already sees every client's money on /clients (per the
// "read all, edit own" design — see src/lib/clients.ts), so this adds no new
// visibility, just a summary view of numbers the viewer could already see.
//
// PER-CURRENCY, NEVER SUMMED TOGETHER. A UK book in GBP and an India book in
// INR are not one number — see the matching comment in ClientsView.tsx. This
// is grouped at the database with `groupBy`, not reduced client-side, so a
// future caller cannot accidentally re-introduce a cross-currency sum by
// consuming raw client rows instead of this endpoint.
export async function GET() {
  const auth = await requireApiPermission("clients.finance.read");
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const orgFilter = user.organizationId ? { organizationId: user.organizationId } : {};

  const [byCurrency, overdueCount, clientCount] = await Promise.all([
    prisma.clientFee.groupBy({
      by: ["currency"],
      where: { client: orgFilter, status: { not: "WRITTEN_OFF" } },
      _sum: { amountMinor: true, paidMinor: true },
    }),
    prisma.clientFee.count({
      where: { client: orgFilter, status: "OVERDUE" },
    }),
    prisma.client.count({ where: orgFilter }),
  ]);

  return NextResponse.json({
    byCurrency: byCurrency
      .map((row) => ({
        currency: row.currency,
        billedMinor: row._sum.amountMinor ?? 0,
        paidMinor: row._sum.paidMinor ?? 0,
      }))
      .sort((a, b) => b.billedMinor - a.billedMinor),
    overdueCount,
    clientCount,
  });
}
