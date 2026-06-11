import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const isPrivileged = ["ADMIN", "CEO", "CISO"].includes(user.role);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const folder = searchParams.get("folder") ?? "inbox"; // "inbox" | "sent"
    const cursor = searchParams.get("cursor") ?? undefined;
    const viewAll = isPrivileged && searchParams.get("viewAll") === "true";
    const userEmail = user.email.toLowerCase();

    // Base filter: threads accessible to the user (their mailbox, or explicit access)
    const userAccessFilter = {
      OR: [
        { mailbox: { email: userEmail } },
        { mailbox: { accessLogs: { some: { userId: user.id } } } },
      ] as object[],
    };

    // Folder-specific filters applied server-side so background polls never return
    // stale trashed/archived threads and overwrite optimistic UI state.
    const folderFilter =
      folder === "sent"
        ? { mailbox: { email: userEmail }, messages: { some: { from: userEmail } } }
        : folder === "trash"
        ? { ...userAccessFilter, isTrashed: true }
        : folder === "archive"
        ? { ...userAccessFilter, isArchived: true, isTrashed: false }
        : {
            // "inbox" (default) — exclude trash, archive, and pure sent-copy threads
            ...userAccessFilter,
            isTrashed: false,
            isArchived: false,
            NOT: { messages: { every: { from: userEmail } } },
          };

    const threads = await prisma.inboxThread.findMany({
      where: {
        AND: [
          // Never show bounce-tracking address threads
          { messages: { none: { from: { contains: "@send." } } } },
          viewAll ? {} : folderFilter,
          query
            ? {
                OR: [
                  { subject: { contains: query, mode: "insensitive" } },
                  {
                    messages: {
                      some: {
                        OR: [
                          { from: { contains: query, mode: "insensitive" } },
                          { textBody: { contains: query, mode: "insensitive" } },
                        ],
                      },
                    },
                  },
                ],
              }
            : {},
        ],
      },
      include: {
        mailbox: {
          select: {
            email: true,
            displayName: true,
          },
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
          select: {
            messages: {
              where: { isRead: false },
            },
          },
        },
      },
      orderBy: {
        // updatedAt is bumped by the inbound webhook on every new message, so
        // threads with new replies surface at the top (createdAt buried old
        // threads forever once >50 existed — "disappearing email" bug).
        updatedAt: "desc",
      },
      take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    // Display order: latest message first (the take-window above is by updatedAt)
    threads.sort((a, b) => {
      const aTime = a.messages[0]?.receivedAt ?? a.createdAt;
      const bTime = b.messages[0]?.receivedAt ?? b.createdAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    // Format for frontend
    const formattedThreads = threads.map((t) => {
      const lastMessage = t.messages[0];
      return {
        id: t.id,
        subject: t.subject,
        mailbox: t.mailbox.email,
        mailboxName: t.mailbox.displayName,
        lastMessage: lastMessage
          ? {
              from: lastMessage.from,
              snippet: lastMessage.textBody?.slice(0, 100) || "",
              receivedAt: lastMessage.receivedAt,
            }
          : null,
        unreadCount: t._count.messages,
        isStarred: t.isStarred,
        isArchived: t.isArchived,
        isTrashed: t.isTrashed,
        isSnoozed: t.isSnoozed,
        snoozedUntil: t.snoozedUntil,
        priority: t.priority,
        folderId: t.folderId,
        assignedToId: t.assignedToId,
        slaDeadline: t.slaDeadline,
        labels: t.labels,
        createdAt: t.createdAt,
      };
    });

    const response = NextResponse.json(formattedThreads);
    // Never let the browser serve a stale thread list — cached responses made
    // trashed/sent threads flash back in or freshly-moved threads vanish.
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("Failed to fetch inbox:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
