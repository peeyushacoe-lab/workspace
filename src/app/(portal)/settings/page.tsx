import { SettingsView } from "@/components/settings/SettingsView";
import { PageHeader } from "@/components/Shell";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

async function getRecentLogins(userId: string) {
  if (!process.env.DATABASE_URL) return [];
  return prisma.loginEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}

async function getMfaEnabled(userId: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaEnabled: true },
  });
  return user?.mfaEnabled ?? false;
}

export default async function SettingsPage() {
  const currentUser = await getCurrentUser();

  const [recentLogins, mfaEnabled] = await Promise.all([
    getRecentLogins(currentUser!.id),
    getMfaEnabled(currentUser!.id),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Workspace Control"
        title="Settings"
        description="Configure your workspace preferences, manage security, and control how CyberSage works for you."
      />
      <SettingsView
        user={currentUser!}
        recentLogins={recentLogins}
        mfaEnabled={mfaEnabled}
      />
    </>
  );
}
