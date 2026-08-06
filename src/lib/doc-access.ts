import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { SHEET_MARKER, SLIDE_MARKER } from "@/lib/doc-markers";

/**
 * Shared access resolution for every Note-backed document.
 *
 * Docs, Sheets, Slides and Notes are all rows in `Note`, discriminated by the
 * `color` marker column. Each editor previously carried its own private copy of
 * this logic (`getAccess` in /api/sheets/[id], /api/slides/[id], ...), which
 * meant new cross-cutting features — version history, presence — had no single
 * place to ask "may this user touch this document?".
 */

export const DOC_MARKER = "document";

export type DocKind = "doc" | "sheet" | "slide" | "note";
export type DocAccess = "owner" | "editor" | "viewer";

const ELEVATED_ROLES = ["ADMIN", "CEO", "CISO"];

/** Maps a Note.color marker to the share-key namespace used in Redis. */
export function kindFromMarker(marker: string | null): DocKind {
  if (marker === SHEET_MARKER) return "sheet";
  if (marker === SLIDE_MARKER) return "slide";
  if (marker === DOC_MARKER) return "doc";
  return "note";
}

export type ResolvedDoc = {
  id: string;
  title: string;
  content: string;
  userId: string;
  kind: DocKind;
  access: DocAccess;
};

/**
 * Loads a document and the caller's access level, or null when the document
 * does not exist or the caller may not see it.
 *
 * Plain notes are private to their owner — they are never shared via the
 * `doc:share:*` keys, so only ownership (or an elevated role) grants access.
 */
export async function resolveDocAccess(
  noteId: string,
  userId: string,
  userRole: string,
): Promise<ResolvedDoc | null> {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: { id: true, title: true, content: true, userId: true, color: true },
  });
  if (!note) return null;

  const kind = kindFromMarker(note.color);
  const base = {
    id: note.id,
    title: note.title,
    content: note.content,
    userId: note.userId,
    kind,
  };

  if (note.userId === userId || ELEVATED_ROLES.includes(userRole)) {
    return { ...base, access: "owner" };
  }

  if (kind === "note") return null;

  const role = await redis
    .hget(`doc:share:${kind}:${noteId}`, userId)
    .catch(() => null);
  if (role === "editor") return { ...base, access: "editor" };
  if (role === "viewer") return { ...base, access: "viewer" };
  return null;
}

/** True when the access level permits mutation. */
export function canEdit(access: DocAccess): boolean {
  return access === "owner" || access === "editor";
}

/** Redis hash key for a doc's share list. */
export function docShareKey(docId: string): string {
  return `doc:share:doc:${docId}`;
}

/** Returns the caller's effective role on a doc, or null if no access. */
export async function getDocAccessRole(
  docId: string,
  doc: { userId: string },
  user: { id: string; role: string },
): Promise<"owner" | "editor" | "viewer" | null> {
  if (doc.userId === user.id || ELEVATED_ROLES.includes(user.role)) return "owner";
  const role = await redis.hget(docShareKey(docId), user.id) as string | null;
  if (role === "editor") return "editor";
  if (role === "viewer") return "viewer";
  return null;
}
