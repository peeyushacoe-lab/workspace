/**
 * Task provenance — where a task came from, and how to get back there.
 *
 * `Task.sourceType` / `Task.sourceId` have existed in the schema since Tasks
 * shipped, but only `/meet/intelligence` ever wrote them and nothing ever read
 * them: the data was inert because no view could turn it into a link. This module
 * is the single place that maps a source to a label, an icon key and an href, so
 * the backlink chip on /tasks, on Home, and anywhere it appears next can never
 * disagree about what "from mail" points at.
 *
 * ── The meeting caveat ────────────────────────────────────────────────────────
 * Meetings used to be unlinkable: `/meet/intelligence` wrote `sourceId: title` —
 * a human title string, not an id, because the transcript it analyses isn't
 * necessarily a stored Meeting row. Linking that would have produced
 * `/meet/Weekly%20Security%20Sync`, a 404 dressed up as a feature.
 *
 * Now that meetings have a detail page at `/meetings/<id>`, writers that HAVE a
 * real meeting store its id and the backlink works. Legacy title rows still
 * exist though, and a cuid is not distinguishable from a title by inspection —
 * so `looksLikeId` is the discriminator: cuids have a fixed shape, titles have
 * spaces and punctuation. A value that isn't clearly an id renders as plain
 * text, exactly as before.
 */

/** Sources a task can be created from. Keep in sync with what writers pass. */
export type TaskSourceType = "email" | "chat" | "meeting" | "doc";

const SOURCE_TYPES = new Set<string>(["email", "chat", "meeting", "doc"]);

export function isTaskSourceType(value: string | null | undefined): value is TaskSourceType {
  return typeof value === "string" && SOURCE_TYPES.has(value);
}

/**
 * Does this value look like a generated record id rather than human text?
 *
 * Needed because `sourceType: "meeting"` rows written before meetings had a
 * detail page hold a *title* in `sourceId`. Both are strings, so the shape is the
 * only signal: Prisma cuids are a single lowercase-alphanumeric run starting with
 * `c`, ~24-32 chars, no spaces. A title like "Weekly Security Sync" fails on the
 * spaces; "Standup" fails on length.
 *
 * Conservative by design — a false negative renders an unclickable chip (mildly
 * disappointing), a false positive renders a link to a 404 (broken). It also
 * accepts other id-ish formats (uuid) so this doesn't become cuid-specific if the
 * id strategy ever changes.
 */
export function looksLikeId(value: string): boolean {
  if (/\s/.test(value)) return false;
  // cuid / cuid2 / nanoid-style
  if (/^[a-z0-9]{20,40}$/i.test(value)) return true;
  // uuid v4-ish
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return true;
  return false;
}

export type ResolvedTaskSource = {
  type: TaskSourceType;
  /** Short chip text, e.g. "From mail". */
  label: string;
  /** Icon key resolved to a lucide glyph by the consuming component. */
  icon: "mail" | "chat" | "meeting" | "doc";
  /**
   * Where to go back to, or null when this source can't be linked (a meeting
   * title, or a blank sourceId). A null href must render as plain text, never as
   * a dead link.
   */
  href: string | null;
};

const LABEL: Record<TaskSourceType, string> = {
  email: "From mail",
  chat: "From chat",
  meeting: "From meeting",
  doc: "From document",
};

/**
 * Builds the backlink for a task's source.
 *
 * Every href here is a deep link that a view actually reads — `?thread=` in
 * InboxView, `?channel=` in ChatView, `?open=` in DocsView. Do not add a param
 * here without wiring the receiving view first; a chip that looks clickable and
 * lands on a generic list is worse than a chip that doesn't link at all.
 */
export function resolveTaskSource(
  sourceType: string | null | undefined,
  sourceId: string | null | undefined,
): ResolvedTaskSource | null {
  if (!isTaskSourceType(sourceType)) return null;

  const id = sourceId?.trim() || null;
  const base = { type: sourceType, label: LABEL[sourceType] } as const;

  switch (sourceType) {
    case "email":
      return { ...base, icon: "mail", href: id ? `/inbox?thread=${encodeURIComponent(id)}` : null };

    case "chat": {
      // ChatView deep-links by CHANNEL (`?channel=`), but a task created from a
      // message is naturally identified by the MESSAGE. Both are cuids, so a bare
      // id is ambiguous — and passing a message id as ?channel= fails the
      // `channels.some(c => c.id === target)` check and silently does nothing.
      //
      // New rows therefore store "<channelId>#<messageId>". Rows written before
      // that (a bare message id) cannot be resolved, so they render as an
      // unclickable chip rather than a link that quietly goes nowhere.
      const channelId = id?.includes("#") ? id.split("#")[0] : null;
      return {
        ...base,
        icon: "chat",
        href: channelId ? `/connect/chat?channel=${encodeURIComponent(channelId)}` : null,
      };
    }

    case "doc":
      return { ...base, icon: "doc", href: id ? `/docs?open=${encodeURIComponent(id)}` : null };

    case "meeting":
      // Links to the meeting's detail page (agenda/notes/tasks), NOT to
      // /meet/<roomName> — a task backlink should show you what the meeting was
      // about, not drop you into a live video call.
      return {
        ...base,
        icon: "meeting",
        href: id && looksLikeId(id) ? `/meetings/${encodeURIComponent(id)}` : null,
      };
  }
}

/**
 * Chip text including the source's own name when we have one, e.g.
 * "From mail · Q3 pen-test results". Falls back to the bare label.
 *
 * The title is passed in rather than looked up: resolving it needs a DB round
 * trip per task, and the places that show this chip (a task list, a Home card)
 * render many at once. Callers that already have the title — the dialog that just
 * created the task, or a query that joined it — pass it; the rest don't.
 */
/**
 * Builds the `sourceId` for a task created from a chat message.
 *
 * Encodes both ids because the linkable unit (channel) and the meaningful unit
 * (message) differ — see the `chat` case in `resolveTaskSource`. When ChatView
 * grows a `?message=` param, the message half is already stored and the backlink
 * can start scrolling to it without a data migration.
 */
export function chatSourceId(channelId: string, messageId: string): string {
  return `${channelId}#${messageId}`;
}

/** The message half of a chat `sourceId`, when present. */
export function chatSourceMessageId(sourceId: string | null | undefined): string | null {
  const parts = sourceId?.split("#");
  return parts && parts.length > 1 ? parts[1] || null : null;
}

export function taskSourceLabel(source: ResolvedTaskSource, sourceTitle?: string | null): string {
  const title = sourceTitle?.trim();
  return title ? `${source.label} · ${title}` : source.label;
}
