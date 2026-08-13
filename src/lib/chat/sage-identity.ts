/**
 * Sage's identity, in a module with no server-only imports.
 *
 * `lib/chat/sage.ts` pulls in Prisma and the AI client, so a client component
 * cannot import from it just to learn the assistant's name. These two
 * constants are the only part ChatView needs, so they live here and both sides
 * import them — rather than the name being written as a bare string literal in
 * a component and silently drifting from the row in the database.
 */

/** Well-known address for the assistant's system user. Never logs in. */
export const SAGE_EMAIL = "sage@cybersage.uk";

/** Display name, and what `ChatMessage.user.fullName` reads for its replies. */
export const SAGE_NAME = "Sage";

/**
 * Does this message body summon the assistant?
 *
 * Shared with the server parser in `lib/chat/mentions.ts` so the composer's
 * "thinking…" indicator fires on exactly the messages that will actually get a
 * reply. Anchored on a word boundary so an email address like
 * `alerts@sagegroup.com` is not a summon.
 */
export function mentionsSage(content: string): boolean {
  return /(?:^|\s)@(sage|cybersage)\b/i.test(content);
}

/** True when a rendered message was authored by the assistant. */
export function isSageAuthor(user?: { fullName?: string | null; email?: string | null } | null): boolean {
  if (!user) return false;
  return user.email === SAGE_EMAIL || user.fullName === SAGE_NAME;
}
