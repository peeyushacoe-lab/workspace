/**
 * Parses Gmail-style filter tokens out of a raw omnibox query string:
 *   from:alice in:inbox has:attachment before:2026-01-01 after:2025-12-01 is:unread search text
 *
 * Recognized tokens are stripped from the string; whatever remains is the
 * free-text portion used for the actual full-text/ILIKE search.
 *
 * Shared by /api/search (both the Meilisearch path and the Prisma fallback)
 * so filter behaviour stays identical regardless of which backend answers.
 */

export type ParsedSearchQuery = {
  /** Free-text remainder after all recognized tokens are stripped. */
  text: string;
  /** Raw, unmodified input (useful for display / "Searching for ..." UI). */ raw: string;
  from?: string;
  in?: string;
  hasAttachment?: boolean;
  before?: Date;
  after?: Date;
  isUnread?: boolean;
  isStarred?: boolean;
};

const TOKEN_RE = /(\w+):("[^"]*"|\S+)/g;

function unquote(value: string): string {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1);
  }
  return value;
}

function parseDateToken(value: string): Date | undefined {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const parsed: ParsedSearchQuery = { text: "", raw };
  let remainder = raw;

  remainder = remainder.replace(TOKEN_RE, (match, key: string, rawValue: string) => {
    const value = unquote(rawValue);
    const k = key.toLowerCase();

    switch (k) {
      case "from":
        parsed.from = value;
        return "";
      case "in":
        parsed.in = value.toLowerCase();
        return "";
      case "has":
        if (value.toLowerCase() === "attachment" || value.toLowerCase() === "attachments") {
          parsed.hasAttachment = true;
          return "";
        }
        return match; // unrecognized has: value — leave as free text
      case "before": {
        const d = parseDateToken(value);
        if (d) { parsed.before = d; return ""; }
        return match;
      }
      case "after": {
        const d = parseDateToken(value);
        if (d) { parsed.after = d; return ""; }
        return match;
      }
      case "is":
        if (value.toLowerCase() === "unread") { parsed.isUnread = true; return ""; }
        if (value.toLowerCase() === "starred") { parsed.isStarred = true; return ""; }
        return match;
      default:
        return match; // not a recognized filter token — keep as free text
    }
  });

  parsed.text = remainder.replace(/\s+/g, " ").trim();
  return parsed;
}

/** Builds a Meilisearch `filter` expression string from parsed tokens that
 * have Meilisearch-filterable equivalents. Resource-specific attribute names
 * are passed in since each index uses different field names. */
export function buildMeiliFilter(
  parsed: ParsedSearchQuery,
  attrs: { hasAttachment?: string; isRead?: string; dateField?: string },
): string | undefined {
  const clauses: string[] = [];

  if (parsed.hasAttachment && attrs.hasAttachment) {
    clauses.push(`${attrs.hasAttachment} = true`);
  }
  if (parsed.isUnread && attrs.isRead) {
    clauses.push(`${attrs.isRead} = false`);
  }
  if (attrs.dateField) {
    if (parsed.after) clauses.push(`${attrs.dateField} >= ${Math.floor(parsed.after.getTime() / 1000)}`);
    if (parsed.before) clauses.push(`${attrs.dateField} <= ${Math.floor(parsed.before.getTime() / 1000)}`);
  }

  return clauses.length > 0 ? clauses.join(" AND ") : undefined;
}
