import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import type { DocKind } from "@/lib/doc-access";

/**
 * Resolves `@Name` mentions in a document comment to real users and notifies
 * them.
 *
 * Mentions are plain text rather than structured IDs, because the comment
 * composer is a plain textarea in all three editors. That means resolution is
 * best-effort: an unmatched or ambiguous name is skipped silently rather than
 * guessing and pinging the wrong person.
 */

/** Deep-link back to the commented document, honouring per-app subdomains. */
function linkFor(kind: DocKind, docId: string): string {
  switch (kind) {
    case "sheet": return `/apps/sheets/${docId}`;
    case "slide": return `/apps/slides/${docId}`;
    case "doc":   return `/docs?open=${docId}`;
    default:      return `/notes`;
  }
}

const KIND_LABEL: Record<DocKind, string> = {
  doc: "document",
  sheet: "spreadsheet",
  slide: "presentation",
  note: "note",
};

export async function notifyUsers(opts: {
  /** Raw `@Name` fragments captured from the comment body. */
  names: string[];
  actorId: string;
  actorName: string;
  docId: string;
  docTitle: string;
  docKind: DocKind;
  excerpt: string;
}): Promise<void> {
  try {
    const wanted = [...new Set(opts.names.map(n => n.trim().toLowerCase()))].filter(Boolean);
    if (!wanted.length) return;

    // One query for all candidates. `mode: insensitive` so "@ada lovelace"
    // matches "Ada Lovelace".
    const candidates = await prisma.user.findMany({
      where: {
        OR: [
          { fullName: { in: opts.names, mode: "insensitive" } },
          { email: { in: opts.names, mode: "insensitive" } },
        ],
      },
      select: { id: true, fullName: true, email: true },
    });

    const seen = new Set<string>();
    for (const candidate of candidates) {
      // Never notify the author of their own mention.
      if (candidate.id === opts.actorId || seen.has(candidate.id)) continue;

      const matches =
        wanted.includes(candidate.fullName.toLowerCase()) ||
        wanted.includes(candidate.email.toLowerCase());
      if (!matches) continue;

      seen.add(candidate.id);
      await createNotification({
        userId: candidate.id,
        type: "MENTION",
        title: `${opts.actorName} mentioned you`,
        body: `${opts.docTitle || `Untitled ${KIND_LABEL[opts.docKind]}`} — ${opts.excerpt}`,
        link: linkFor(opts.docKind, opts.docId),
        metadata: { docId: opts.docId, docKind: opts.docKind },
      });
    }
  } catch {
    // A failed mention lookup must never fail the comment write.
  }
}
