import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deliverChatMessage } from "@/lib/chat/deliver";
import { enforceChatLimit } from "@/lib/chat/limits";
import { policiesForUser } from "@/lib/connect-policies";
import { parseSlashCommand, parseReminderTime, parsePoll } from "@/lib/chat/slash-commands";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/chat/channels/:id/commands  { input: "/task Ship the RBAC docs" }
 *
 * Executes a slash command typed into the composer.
 *
 * Everything a command creates — a Task, a Meeting, a scheduled message — is a
 * real record owned by the caller, so this route re-derives the command from
 * the raw input rather than trusting a parsed shape from the client. The
 * composer's picker is a convenience; this is the authority. Membership is
 * re-checked here even though the composer only renders inside a channel the
 * user has open, because "the UI wouldn't let you" is not authorization.
 */
export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = await enforceChatLimit("message.send", user.id);
  if (limited) return limited;

  const { id: channelId } = await params;

  const membership = await prisma.chatMember.findUnique({
    where: { channelId_userId: { channelId, userId: user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { input } = (await request.json()) as { input?: string };
  const parsed = parseSlashCommand((input ?? "").trim());
  if (!parsed) return NextResponse.json({ error: "Not a command" }, { status: 400 });

  const { command, args } = parsed;
  const policies = await policiesForUser(user.id);
  const sender = { id: user.id, fullName: user.fullName };

  switch (command.name) {
    // ── /task ─────────────────────────────────────────────────────────────
    case "task": {
      if (!args) return NextResponse.json({ error: "Usage: /task <title>" }, { status: 400 });

      const task = await prisma.task.create({
        data: {
          title: args.slice(0, 300),
          status: "TODO",
          priority: "MEDIUM",
          createdById: user.id,
          // Provenance in the format lib/task-source.ts already knows how to
          // resolve, so the task carries a working backlink to this channel.
          sourceType: "chat",
          sourceId: channelId,
          assignees: { create: [{ userId: user.id }] },
        },
        select: { id: true, title: true },
      });

      await deliverChatMessage(sender, {
        channelId,
        content: `📋 Task created: ${task.title}`,
        allowBroadcast: false,
      });

      return NextResponse.json({ ok: true, kind: "task", id: task.id });
    }

    // ── /meet ─────────────────────────────────────────────────────────────
    case "meet": {
      const channel = await prisma.chatChannel.findUnique({
        where: { id: channelId },
        select: { name: true },
      });
      const title = args.slice(0, 200) || `${channel?.name ?? "Chat"} call`;

      // Room name must be unguessable — anyone who can reach the Jitsi domain
      // can join a room whose name they know, so a predictable one derived from
      // the channel would let a non-member walk into the call.
      const roomName = `nexus-${crypto.randomUUID()}`;

      const meeting = await prisma.meeting.create({
        data: {
          title,
          organizerId: user.id,
          roomName,
          status: "LIVE",
          startedAt: new Date(),
        },
        select: { id: true, title: true },
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nexus.cybersage.uk";
      await deliverChatMessage(sender, {
        channelId,
        content: `📹 ${user.fullName} started a meeting: ${meeting.title}\n${appUrl}/meet/${meeting.id}`,
        allowBroadcast: false,
      });

      return NextResponse.json({ ok: true, kind: "meeting", id: meeting.id });
    }

    // ── /poll ─────────────────────────────────────────────────────────────
    case "poll": {
      const spec = parsePoll(args);
      if (!spec) {
        return NextResponse.json(
          { error: "Usage: /poll Question | Option A | Option B  (2–10 options)" },
          { status: 400 },
        );
      }

      const poll = await prisma.chatPoll.create({
        data: {
          channelId,
          createdById: user.id,
          question: spec.question.slice(0, 300),
          options: {
            create: spec.options.map((text, order) => ({ text: text.slice(0, 150), order })),
          },
        },
        select: { id: true },
      });

      // The poll row and the message that renders it are created separately, so
      // link them explicitly rather than leaving an orphan poll nothing shows.
      const message = await deliverChatMessage(sender, {
        channelId,
        content: `📊 ${spec.question}`,
        allowBroadcast: false,
      });
      await prisma.chatMessage.update({
        where: { id: message.id },
        data: { pollId: poll.id },
      });

      return NextResponse.json({ ok: true, kind: "poll", id: poll.id });
    }

    // ── /remind ───────────────────────────────────────────────────────────
    case "remind": {
      const when = parseReminderTime(args);
      if (!when || !when.rest) {
        return NextResponse.json(
          { error: "Usage: /remind 30m Stand-up notes  ·  /remind tomorrow 9am Ship the release" },
          { status: 400 },
        );
      }
      if (when.at.getTime() <= Date.now()) {
        return NextResponse.json({ error: "That time has already passed" }, { status: 400 });
      }
      if (when.rest.length > policies.messaging.maxMessageLength) {
        return NextResponse.json({ error: "Reminder text is too long" }, { status: 400 });
      }

      // Reuses the existing Scheduled Send pipeline rather than adding a second
      // timer: the worker already re-authorizes membership at fire time, so a
      // reminder set by someone later removed from the channel will not deliver.
      const scheduled = await prisma.chatScheduledMessage.create({
        data: {
          channelId,
          userId: user.id,
          content: `⏰ ${when.rest}`,
          scheduledAt: when.at,
        },
        select: { id: true, scheduledAt: true },
      });

      return NextResponse.json({
        ok: true,
        kind: "reminder",
        id: scheduled.id,
        scheduledAt: scheduled.scheduledAt,
      });
    }

    // ── /sage ─────────────────────────────────────────────────────────────
    case "sage": {
      // `/sage x` is literally "@Sage x". Posting it as a normal message means
      // `deliverChatMessage` → `resolveMentions` → `respondAsSage` fires on the
      // existing path, so the slash form and the mention form cannot drift, and
      // the channel sees the question as well as the answer.
      const question = args || "Summarise this conversation.";
      await deliverChatMessage(sender, {
        channelId,
        content: `@Sage ${question}`,
        allowBroadcast: false,
      });
      return NextResponse.json({ ok: true, kind: "sage" });
    }

    default:
      // `/me` and `/shrug` are text macros expanded in the composer and never
      // reach this route.
      return NextResponse.json({ error: "Unsupported command" }, { status: 400 });
  }
}
