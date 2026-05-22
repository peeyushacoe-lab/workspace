import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { InboxView } from "@/components/InboxView";
import { DashboardTour } from "@/components/DashboardTour";

export default async function InboxPage() {
  // getCurrentUser is React.cache()-wrapped — no duplicate HMAC verify vs layout.
  const user = await getCurrentUser();

  // Fetch the first page of threads server-side so InboxView has data
  // immediately on hydration with zero client-side waterfall on initial load.
  const isPrivileged = user ? ["ADMIN", "CEO", "CISO"].includes(user.role) : false;

  const rawThreads = await prisma.inboxThread.findMany({
    where: isPrivileged
      ? {}
      : {
          mailbox: {
            accessLogs: { some: { userId: user?.id ?? "" } },
          },
        },
    include: {
      mailbox: {
        select: { email: true, displayName: true },
      },
      messages: {
        orderBy: { receivedAt: "desc" },
        take: 1,
        select: {
          from: true,
          subject: true,
          textBody: true,
          receivedAt: true,
          isRead: true,
        },
      },
      _count: {
        select: { messages: { where: { isRead: false } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const initialThreads = rawThreads.map((t) => {
    const lastMessage = t.messages[0];
    return {
      id: t.id,
      subject: t.subject,
      mailbox: t.mailbox.email,
      mailboxName: t.mailbox.displayName,
      lastMessage: lastMessage
        ? {
            from: lastMessage.from,
            snippet: lastMessage.textBody?.slice(0, 100) ?? "",
            receivedAt: lastMessage.receivedAt.toISOString(),
          }
        : null,
      unreadCount: t._count.messages,
      isStarred: t.isStarred,
      isArchived: t.isArchived,
      isTrashed: t.isTrashed,
      isSnoozed: t.isSnoozed,
      snoozedUntil: t.snoozedUntil?.toISOString() ?? null,
      priority: t.priority as "LOW" | "NORMAL" | "HIGH" | "URGENT",
      folderId: t.folderId,
      assignedToId: t.assignedToId,
      slaDeadline: t.slaDeadline?.toISOString() ?? null,
      labels: t.labels,
      createdAt: t.createdAt.toISOString(),
    };
  });

  return (
    <>
      <DashboardTour />
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Workspace Mail</h1>
          <p className="text-muted mt-2">
            Secure, centralised communication for {user!.fullName}.
          </p>
        </div>
        <InboxView userRole={user!.role} initialThreads={initialThreads} />
      </div>
    </>
  );
}
