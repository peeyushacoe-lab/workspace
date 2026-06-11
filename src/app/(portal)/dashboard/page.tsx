import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import type { SessionUser } from "@/lib/auth";
import { WorkspaceDashboard } from "@/components/WorkspaceDashboard";

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

  return (
    <div className="p-8 min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-[#dfe1f6]">Communication Center</h1>
        <p className="text-[#9aa3b8] mt-2">
          Send quick messages and track delivery status across the workspace.
        </p>
      </div>
      <WorkspaceDashboard currentUser={currentUser!} recentLogs={recentLogs} />
    </div>
  );
}
