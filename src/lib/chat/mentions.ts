import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

/**
 * The one place a message body is turned into a set of people.
 *
 * Before this existed the pieces were scattered and none of them met:
 * `ChatMessage.mentionedUserIds` was declared in the schema and read by
 * `/api/connect/activity` (`mentionedUserIds: { has: userId }`), but nothing
 * in the codebase ever *wrote* it — so the Activity feed's entire mention
 * section was structurally empty, and had been since the column was added.
 * Meanwhile the autocomplete in `/api/chat/channels/[id]/mentions` offered
 * `@everyone`, `@here` and `@team` as selectable tokens that resolved to
 * nothing at all once sent.
 *
 * Parsing happens server-side, in `deliverChatMessage`, for the same reason
 * authorization does: the client decides what to *display*, never who gets
 * notified. A crafted POST that hand-set `mentionedUserIds` would otherwise be
 * a notification-spam primitive against the whole organisation.
 */

/** Everything a parsed message body resolved to. */
export type ResolvedMentions = {
  /** Users to record on the message and notify. Always ⊆ channel members. */
  userIds: string[];
  /** Team slugs that matched, for rendering the chip and for audit. */
  teamSlugs: string[];
  /** `@everyone` / `@channel` was used and the sender was allowed to use it. */
  broadcast: boolean;
  /** `@here` was used — resolved against live presence. */
  here: boolean;
  /** The message addressed `@Sage`; the trailing text is the prompt. */
  sage: { prompt: string } | null;
};

const EMPTY: ResolvedMentions = {
  userIds: [],
  teamSlugs: [],
  broadcast: false,
  here: false,
  sage: null,
};

/**
 * Tokens that address a group rather than a person. Kept as a literal set so
 * that a user literally named "Here" cannot shadow `@here`.
 */
const BROADCAST_TOKENS = new Set(["everyone", "channel", "all"]);
const HERE_TOKENS = new Set(["here", "online"]);
const SAGE_TOKENS = new Set(["sage", "cybersage"]);

/**
 * `@Sage summarize this` — the assistant token plus everything after it.
 * Anchored to a word boundary so "message@sagegroup.com" is not a summon.
 */
const SAGE_RE = /(?:^|\s)@(sage|cybersage)\b[:,]?\s*([\s\S]*)$/i;

/**
 * Names are inserted by the composer as plain display text (`@Peeyush Maurya `),
 * so a mention can contain spaces and there is no delimiter to parse against.
 * Rather than guess, we match the *known* candidates for this channel against
 * the text following each `@`, longest name first — so "@Ana Maria" prefers the
 * member called "Ana Maria" over the one called "Ana".
 */
function matchCandidates(
  content: string,
  candidates: { key: string; label: string }[],
): Set<string> {
  const hits = new Set<string>();
  if (!candidates.length) return hits;

  const lower = content.toLowerCase();
  const ordered = [...candidates].sort((a, b) => b.label.length - a.label.length);

  // Every position where an @ starts a token.
  const atPositions: number[] = [];
  for (let i = 0; i < lower.length; i++) {
    if (lower[i] !== "@") continue;
    // Must begin a word — avoids email addresses entirely.
    if (i > 0 && !/\s|[([{,;:]/.test(lower[i - 1])) continue;
    atPositions.push(i);
  }

  for (const at of atPositions) {
    const rest = lower.slice(at + 1);
    for (const cand of ordered) {
      if (!rest.startsWith(cand.label.toLowerCase())) continue;
      // The candidate must end at a word boundary, so "@Sam" does not fire on
      // "@Samantha" when only Sam is a member.
      const after = rest.charAt(cand.label.length);
      if (after && /[\w'-]/.test(after)) continue;
      hits.add(cand.key);
      break; // longest match wins; don't also credit the shorter one
    }
  }

  return hits;
}

/** Members of `channelId` who are currently online, per the presence TTL keys. */
async function onlineMemberIds(memberIds: string[]): Promise<string[]> {
  if (!memberIds.length) return [];
  try {
    const states = await redis.mget(...memberIds.map((id) => `presence:${id}`));
    return memberIds.filter((_, i) => {
      const raw = states[i];
      if (!raw) return false;
      // Stored either as a bare status or as a JSON blob depending on writer.
      const status = raw.startsWith("{")
        ? ((JSON.parse(raw) as { status?: string }).status ?? "")
        : raw;
      // "Here" means reachable. Someone on Do Not Disturb explicitly is not.
      return status === "online" || status === "away" || status === "busy" || status === "in_meeting";
    });
  } catch {
    // Presence is best-effort. A dead Redis must not turn @here into a silent
    // no-op *or* into a notification to the entire channel — so: nobody.
    return [];
  }
}

/**
 * Resolve every mention in `content` for a message being sent to `channelId`.
 *
 * The invariant that matters: **the returned `userIds` are always a subset of
 * the channel's own members.** A team mention cannot pull in someone who is
 * not already in the conversation. Without that, `@team security` in a private
 * channel would notify people about a channel they have no right to read —
 * leaking the channel name, the sender, and a slice of the message body
 * through the notification itself.
 */
export async function resolveMentions({
  content,
  channelId,
  actorId,
  allowBroadcast = true,
}: {
  content: string;
  channelId: string;
  actorId: string;
  /** Org policy may forbid @everyone. Downgrades to no-op rather than rejecting. */
  allowBroadcast?: boolean;
}): Promise<ResolvedMentions> {
  if (!content.includes("@")) return EMPTY;

  const members = await prisma.chatMember
    .findMany({
      where: { channelId },
      select: { userId: true, user: { select: { id: true, fullName: true } } },
    })
    .catch(() => [] as { userId: string; user: { id: string; fullName: string } | null }[]);

  const memberIds = members.map((m) => m.userId);
  const notSender = (id: string) => id !== actorId;

  // ── @Sage ────────────────────────────────────────────────────────────────
  const sageMatch = content.match(SAGE_RE);
  const sage =
    sageMatch && SAGE_TOKENS.has(sageMatch[1].toLowerCase())
      ? { prompt: (sageMatch[2] ?? "").trim() }
      : null;

  // ── group tokens ─────────────────────────────────────────────────────────
  const bareTokens = new Set(
    Array.from(content.matchAll(/(?:^|\s)@([a-z]+)\b/gi)).map((m) => m[1].toLowerCase()),
  );

  const wantsBroadcast = [...bareTokens].some((t) => BROADCAST_TOKENS.has(t));
  const wantsHere = [...bareTokens].some((t) => HERE_TOKENS.has(t));

  const collected = new Set<string>();

  if (wantsBroadcast && allowBroadcast) {
    memberIds.filter(notSender).forEach((id) => collected.add(id));
  }

  if (wantsHere) {
    (await onlineMemberIds(memberIds.filter(notSender))).forEach((id) => collected.add(id));
  }

  // ── @team ────────────────────────────────────────────────────────────────
  // Teams are matched by both slug ("@security") and display name
  // ("@QA & Testing" → matched on "qa"), then intersected with channel members.
  const teamSlugs: string[] = [];
  const teams = await prisma.team
    .findMany({
      select: {
        slug: true,
        name: true,
        members: { select: { userId: true } },
      },
    })
    .catch(() => [] as { slug: string; name: string; members: { userId: string }[] }[]);

  if (teams.length) {
    const teamHits = matchCandidates(
      content,
      teams.flatMap((t) => [
        { key: t.slug, label: t.slug },
        { key: t.slug, label: t.name },
      ]),
    );

    const memberSet = new Set(memberIds);
    for (const team of teams) {
      if (!teamHits.has(team.slug)) continue;
      teamSlugs.push(team.slug);
      for (const m of team.members) {
        // The intersection is the security boundary — see the doc comment.
        if (memberSet.has(m.userId) && notSender(m.userId)) collected.add(m.userId);
      }
    }
  }

  // ── individual people ────────────────────────────────────────────────────
  const nameHits = matchCandidates(
    content,
    members
      .filter((m) => m.user)
      .map((m) => ({ key: m.user!.id, label: m.user!.fullName })),
  );
  nameHits.forEach((id) => {
    if (notSender(id)) collected.add(id);
  });

  return {
    userIds: [...collected],
    teamSlugs: [...new Set(teamSlugs)],
    broadcast: wantsBroadcast && allowBroadcast,
    here: wantsHere,
    sage,
  };
}
