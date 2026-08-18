import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import type { SessionUser } from "@/lib/auth";
import { WorkspaceDashboard } from "@/components/WorkspaceDashboard";
import { can } from "@/lib/rbac/can";
import { RevenueSummaryCard } from "@/components/clients/RevenueSummaryCard";

async function getRecentEmailLogs(user: SessionUser) {
  if (!process.env.DATABASE_URL) return [];
  try {
    const isPrivileged = ["ADMIN", "CEO", "CISO"].includes(user.role);
    return await prisma.emailLog.findMany({
      where: isPrivileged ? {} : { userId: user.id },
      take: 20,
      orderBy: { createdAt: "desc" },
      select: { id: true, recipient: true, status: true, createdAt: true, subject: true },
    });
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const currentUser = await getCurrentUser();
  const recentLogs = await getRecentEmailLogs(currentUser!);
  // Checked server-side so the card (and its fetch) never mounts for a viewer
  // who cannot see client fees — no flash of a component that immediately 403s.
  const showRevenue = currentUser ? await can(currentUser.id, "clients.finance.read") : false;

  return (
    <div className="p-8 min-h-full">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-foreground">Communication Center</h1>
        <p className="text-muted mt-2">
          Send quick messages and track delivery status across the workspace.
        </p>
      </div>
      {showRevenue && (
        <div className="mb-8">
          <RevenueSummaryCard />
        </div>
      )}
      <WorkspaceDashboard currentUser={currentUser!} recentLogs={recentLogs} />
    </div>
  );
}
