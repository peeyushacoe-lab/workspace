import { ProfileSettings } from "@/components/ProfileSettings";
import { PageHeader } from "@/components/Shell";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { roleLabels } from "@/lib/auth";

async function getProfileStats() {
  if (!process.env.DATABASE_URL) return { contacts: 0, campaigns: 0, delivered: 0, opened: 0 };

  const [contacts, campaigns, delivered, opened] = await Promise.all([
    prisma.contact.count(),
    prisma.campaign.count(),
    prisma.emailLog.count({ where: { status: "DELIVERED" } }),
    prisma.emailLog.count({ where: { status: "OPENED" } }),
  ]);

  return { contacts, campaigns, delivered, opened };
}

async function getRecentLogins(userId: string) {
  if (!process.env.DATABASE_URL) return [];

  return prisma.loginEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
}

export default async function ProfilePage() {
  const currentUser = await getCurrentUser();

  const stats = await getProfileStats();
  const recentLogins = await getRecentLogins(currentUser!.id);

  return (
    <>
      <PageHeader
        eyebrow="Profile"
        title="Account center"
        description="Manage your account security, password, and email signature settings from the CyberSage dashboard."
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <section className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
          <div className="rounded-xl border border-border bg-surface p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold text-accent">Account profile</p>
                <h1 className="text-2xl font-semibold text-foreground">Welcome, {currentUser!.fullName}</h1>
                <p className="mt-2 text-sm text-muted">{currentUser!.email}</p>
              </div>
              <div className="rounded-md bg-accent/10 px-4 py-3 text-sm text-accent">
                {roleLabels[currentUser!.role]} access
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm text-muted">Joined</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{new Date().toLocaleDateString()}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm text-muted">Active tasks</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{recentLogins.length}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm text-muted">Contacts</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{stats.contacts}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm text-muted">Campaigns</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{stats.campaigns}</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-surface p-6">
              <h3 className="text-lg font-semibold text-foreground">Security overview</h3>
              <p className="text-sm text-muted mt-2">A central place to manage your profile protections and session security.</p>
              <div className="mt-6 grid gap-4">
                <div className="rounded-lg bg-accent/10 p-4">
                  <p className="text-sm text-accent">Account verified</p>
                </div>
                <div className="rounded-lg bg-surface p-4">
                  <p className="text-sm text-muted">Enterprise monitoring is enabled for your session.</p>
                </div>
                <div className="rounded-lg bg-surface p-4">
                  <p className="text-sm text-muted">Password and MFA controls are available in the profile editor.</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface text-foreground p-6">
              <h3 className="text-lg font-semibold">Session protection</h3>
              <p className="mt-2 text-sm text-muted">Your account is secured with enterprise AI monitoring and access discovery.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="rounded-xl border border-border bg-surface p-8">
            <h3 className="text-xl font-semibold text-foreground">Manage your profile</h3>
            <p className="text-sm text-muted mt-2">Update your user name, password, signature, and account preferences.</p>
            <div className="mt-8">
              <ProfileSettings userEmail={currentUser!.email} userName={currentUser!.fullName} />
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-surface p-6">
              <h3 className="text-lg font-semibold text-foreground">Recent login activity</h3>
              <p className="text-sm text-muted mt-2">Tracked login attempts for your account.</p>
              <div className="mt-6 space-y-3">
                {recentLogins.length === 0 ? (
                  <div className="rounded-lg bg-surface p-4 text-sm text-muted">No login activity available.</div>
                ) : (
                  recentLogins.map((login) => (
                    <div key={login.id} className="rounded-lg bg-surface border border-border p-4">
                      <p className="text-sm font-medium text-foreground">{login.success ? "Successful login" : "Failed login"}</p>
                      <p className="text-sm text-muted">{login.ip ?? "Unknown IP"}</p>
                      <p className="text-xs text-muted mt-2">{new Date(login.createdAt).toLocaleString()}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-6">
              <h3 className="text-lg font-semibold text-foreground">Account quick links</h3>
              <div className="mt-4 space-y-3">
                <button className="w-full text-left px-4 py-3 rounded-lg border border-border bg-surface text-sm font-medium text-foreground hover:bg-surface-sunken transition-colors">Change password</button>
                <button className="w-full text-left px-4 py-3 rounded-lg border border-border bg-surface text-sm font-medium text-foreground hover:bg-surface-sunken transition-colors">View session history</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
