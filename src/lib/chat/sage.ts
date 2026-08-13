import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getAIClient, AI_MODEL, AI_CONFIGURED } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * `@Sage` — the assistant, as a participant in the conversation.
 *
 * This replaces the client-side `@CyberSage` bot, which had four problems that
 * were not fixable in place:
 *
 *  1. **It ran in the sender's browser.** Closing the tab before the reply
 *     arrived meant no reply, ever. Nobody else in the channel could summon it
 *     on the sender's behalf either.
 *  2. **It posted under the asking user's account.** `BotResponseCard` already
 *     documents the consequence: the `[BOT_RESPONSE]` prefix is forgeable, so
 *     anyone could hand-type a message that renders with the assistant's
 *     styling. Its own comment asks for "a real system account posting bot
 *     replies server-side" — that is what `getSageUser()` below is.
 *  3. **It sent no conversation context.** It POSTed the bare question to
 *     `/api/ai/chat`, so "summarize this conversation" was answered by a model
 *     that had never seen the conversation.
 *  4. **It encoded the reply as `[BOT_RESPONSE] {json}` inside the message
 *     body**, which every consumer then had to string-match — see
 *     `api/chat/channels/route.ts` reconstructing preview text by stripping the
 *     prefix.
 *
 * Replies are now ordinary `ChatMessage` rows authored by a real system user,
 * so threading, reactions, search indexing, pinning and unread counts all work
 * on them with no special cases.
 */

/** Well-known identity for the assistant. Never logs in — `passwordHash` stays null. */
const SAGE_EMAIL = "sage@cybersage.uk";
const SAGE_NAME = "Sage";

/** Module-scope memo. The row is immutable once created; re-reading it is waste. */
let sageUserIdCache: string | null = null;

/**
 * The assistant's user row, created on first use.
 *
 * Deliberately created lazily rather than in the seed: this ships without a
 * migration, and an installation that never summons Sage never grows the row.
 *
 * `passwordHash` is left null on purpose. `POST /api/auth/login` compares
 * against a dummy hash when `passwordHash` is null, so no password can ever
 * authenticate as Sage. `isActive` must stay true — an inactive user is
 * filtered out of member lists and the message would render as a ghost.
 */
export async function getSageUser(): Promise<{ id: string; fullName: string } | null> {
  if (sageUserIdCache) return { id: sageUserIdCache, fullName: SAGE_NAME };

  try {
    const user = await prisma.user.upsert({
      where: { email: SAGE_EMAIL },
      update: {},
      create: {
        email: SAGE_EMAIL,
        fullName: SAGE_NAME,
        role: "MEMBER",
        jobTitle: "Workspace assistant",
        bio: "Cybersage's in-workspace assistant. Mention @Sage in any conversation.",
        isActive: true,
        passwordHash: null,
      },
      select: { id: true, fullName: true },
    });
    sageUserIdCache = user.id;
    return user;
  } catch (err) {
    console.error("[chat/sage] could not resolve system user:", (err as Error).message);
    return null;
  }
}

/** True when `userId` is the assistant — used to stop it answering itself. */
export async function isSageUser(userId: string): Promise<boolean> {
  const sage = await getSageUser();
  return !!sage && sage.id === userId;
}

/**
 * How much of the conversation Sage is allowed to read.
 *
 * Capped rather than unbounded: a two-year-old channel would blow the context
 * window and cost a fortune per mention. Fifty messages is roughly "what a
 * person scrolling up would skim before answering".
 */
const CONTEXT_MESSAGE_LIMIT = 50;
const CONTEXT_CHAR_BUDGET = 12_000;

/**
 * Build the transcript Sage reasons over.
 *
 * The permission scoping is structural rather than a check: this only ever
 * reads messages from `channelId`, and `respondAsSage` is only reachable from
 * `deliverChatMessage`, which the route calls *after* verifying the sender's
 * `ChatMember` row. So Sage can never surface content from a conversation the
 * person asking is not already in. It deliberately does not reach into Drive,
 * mail or other channels — `/api/ai/chat` does that, with its own per-user
 * scoping in `lib/ai-context.ts`, and duplicating it here would mean two
 * retrieval paths to keep correct.
 */
async function buildTranscript(channelId: string): Promise<string> {
  const messages = await prisma.chatMessage.findMany({
    where: { channelId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: CONTEXT_MESSAGE_LIMIT,
    select: {
      content: true,
      createdAt: true,
      user: { select: { fullName: true } },
    },
  });

  const lines: string[] = [];
  let budget = CONTEXT_CHAR_BUDGET;

  // Walk newest → oldest so that when the budget runs out we drop the *oldest*
  // messages, which are the least likely to be what "this conversation" means.
  for (const m of messages) {
    const body = m.content.trim();
    if (!body) continue;
    const line = `[${m.createdAt.toISOString().slice(0, 16).replace("T", " ")}] ${m.user?.fullName ?? "Unknown"}: ${body}`;
    if (line.length > budget) break;
    budget -= line.length;
    lines.push(line);
  }

  return lines.reverse().join("\n");
}

const SYSTEM_PROMPT = [
  "You are Sage, the assistant built into Cybersage's Connect workspace.",
  "You are replying inside a live team conversation, so other people will read your answer.",
  "",
  "Rules:",
  "- Be concise. Two or three short paragraphs at most unless asked for detail.",
  "- Answer only from the transcript provided. If the transcript does not contain",
  "  the answer, say so plainly rather than inventing one.",
  "- Never invent names, dates, ticket numbers or incident IDs.",
  "- When asked to extract tasks or action items, output a short list with the",
  "  owner's name where the transcript names one, and 'unassigned' where it does not.",
  "- Do not repeat the whole transcript back.",
  "- Plain text only. No markdown headers.",
].join("\n");

/**
 * Answer an `@Sage` mention and post the reply into the channel.
 *
 * Never throws — it is invoked un-awaited from `deliverChatMessage`, so an
 * unhandled rejection here would become an unhandled promise rejection in the
 * request that sent the message.
 */
export async function respondAsSage({
  channelId,
  askedBy,
  prompt,
  parentId,
}: {
  channelId: string;
  askedBy: { id: string; fullName: string };
  prompt: string;
  parentId?: string | null;
}): Promise<void> {
  try {
    // Stop the assistant answering its own replies. Without this, a reply that
    // happened to contain the word "@Sage" would summon it again, forever.
    if (await isSageUser(askedBy.id)) return;

    const sage = await getSageUser();
    if (!sage) return;

    if (!AI_CONFIGURED) {
      await postSageMessage(sage, channelId, parentId, "The assistant isn't configured on this workspace yet — no AI provider key is set.");
      return;
    }

    // Rate limited per *asking user*, not per channel: the cost and the abuse
    // vector both follow the person, and a shared channel limit would let one
    // person exhaust the budget for their whole team.
    const { allowed } = await checkRateLimit(`sage:${askedBy.id}`, 20, 60 * 60);
    if (!allowed) {
      await postSageMessage(sage, channelId, parentId, `${askedBy.fullName} — you've hit the hourly limit for @Sage. Try again a bit later.`);
      return;
    }

    const question = prompt.trim() || "Summarise this conversation.";
    const transcript = await buildTranscript(channelId);

    const client = getAIClient();
    const completion = await client.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 700,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `Conversation so far (oldest first):\n<transcript>\n${transcript || "(no earlier messages)"}\n</transcript>\n\n` +
            `${askedBy.fullName} asked: ${question}`,
        },
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    await postSageMessage(
      sage,
      channelId,
      parentId,
      reply || "I couldn't come up with an answer for that one.",
    );
  } catch (err) {
    console.error("[chat/sage] reply failed:", err instanceof Error ? err.message : err);
    // Silence would be indistinguishable from the assistant ignoring the person.
    const sage = await getSageUser().catch(() => null);
    if (sage) {
      await postSageMessage(sage, channelId, parentId, "Something went wrong answering that. Try again in a moment.").catch(() => {});
    }
  }
}

/**
 * Write and broadcast Sage's message.
 *
 * Intentionally does *not* go through `deliverChatMessage`: that would re-run
 * mention resolution on Sage's own output (so a reply quoting "@Priya" would
 * notify Priya as though Sage had summoned her), re-enter the @Sage branch, and
 * fan out push notifications to the whole channel for a message people are
 * already watching arrive.
 */
async function postSageMessage(
  sage: { id: string; fullName: string },
  channelId: string,
  parentId: string | null | undefined,
  content: string,
): Promise<void> {
  const message = await prisma.chatMessage.create({
    data: {
      channelId,
      userId: sage.id,
      content,
      parentId: parentId ?? null,
      mentionedUserIds: [],
    },
    include: {
      user: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
      reactions: true,
      replies: { select: { id: true } },
      readBy: { select: { userId: true, readAt: true, user: { select: { fullName: true } } } },
    },
  });

  await redis
    .publish(`chat:channel:${channelId}`, JSON.stringify({ type: "message", data: message }))
    .catch(() => {});

  prisma.chatChannel
    .update({ where: { id: channelId }, data: { updatedAt: new Date() }, select: { id: true } })
    .catch(() => {});
}
