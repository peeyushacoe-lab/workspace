/**
 * Note tag helpers.
 *
 * Tags used to be stashed inside the note's `content` JSON blob, which meant
 * they could not be filtered server-side, indexed, or counted without loading
 * and parsing every note. They now live in the `Note.tags` String[] column;
 * this module owns the normalisation rules both sides agree on.
 */

/** Longest a single tag may be — keeps chips from wrapping the sidebar. */
export const MAX_TAG_LENGTH = 32;

/** Cap per note, so the column stays small and the UI stays readable. */
export const MAX_TAGS_PER_NOTE = 20;

/**
 * Normalises one tag: trims, strips a leading '#', collapses inner whitespace
 * to single hyphens, lowercases, and drops anything unusable.
 *
 * Lowercasing is deliberate — "Roadmap" and "roadmap" being separate tags is a
 * bug, not a feature, and Postgres array containment is case-sensitive.
 */
export function normaliseTag(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .toLowerCase()
    .slice(0, MAX_TAG_LENGTH);
  return cleaned.length ? cleaned : null;
}

/** Normalises, de-duplicates and caps a list of tags. */
export function normaliseTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const tag = normaliseTag(item);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= MAX_TAGS_PER_NOTE) break;
  }
  return out;
}

/**
 * Reads tags out of the legacy `content` JSON blob.
 *
 * Kept so notes written before the migration keep showing their tags until
 * `npm run migrate:note-tags` has run — and so the migration itself has one
 * canonical parser.
 */
export function legacyTagsFromContent(content: string): string[] {
  if (!content || !content.trimStart().startsWith("{")) return [];
  try {
    const parsed = JSON.parse(content) as { tags?: unknown };
    return normaliseTags(parsed?.tags);
  } catch {
    return [];
  }
}

/** Tag counts across a set of notes, sorted by frequency then alphabetically. */
export function tagCounts(notes: { tags?: string[] }[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const note of notes) {
    for (const tag of note.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
