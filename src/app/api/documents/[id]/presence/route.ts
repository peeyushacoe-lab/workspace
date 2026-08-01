import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { resolveDocAccess } from "@/lib/doc-access";

type Params = { params: Promise<{ id: string }> };

/**
 * Live co-authoring presence for Note-backed documents.
 *
 * Deliberately Redis + polling rather than Socket.IO: production runs on Vercel
 * where there is no always-on Socket.IO server (see src/lib/socket-client.ts —
 * getSocket() returns null unless NEXT_PUBLIC_SOCKET_URL is set). A presence
 * feature built on sockets alone would simply not work in production. Each
 * editor heartbeats every few seconds; entries expire on their own via TTL, so
 * a closed tab or crashed browser cleans itself up.
 */

/** Presence entries outlive ~2 missed heartbeats, then vanish. */
const PRESENCE_TTL_SECONDS = 15;

type PresenceEntry = {
  userId: string;
  name: string;
  /** Stable per-user colour for the cursor / avatar ring. */
  color: string;
  /** Sheets: the focused cell, e.g. "B7". Slides: the slide id. Docs: unused. */
  location?: string;
  /** Sheets: the active sheet tab id, so we only draw cursors on that tab. */
  scope?: string;
  updatedAt: number;
};

const CURSOR_COLORS = [
  "#4f46e5", "#0e7c5a", "#c0362c", "#b45309",
  "#7c3aed", "#0369a1", "#be185d", "#4d7c0f",
];

/** Deterministic colour so a collaborator keeps the same hue across reloads. */
function colorFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

const presenceKey = (docId: string) => `doc:presence:${docId}`;

/** GET — everyone currently in the document, excluding the caller. */
export async function GET(_req: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const doc = await resolveDocAccess(id, user.id, user.role);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const raw = await redis.hgetall(presenceKey(id));
    const now = Date.now();
    const cutoff = now - PRESENCE_TTL_SECONDS * 1000;

    const peers: PresenceEntry[] = [];
    const expired: string[] = [];

    for (const [uid, value] of Object.entries(raw ?? {})) {
      try {
        const entry = JSON.parse(value) as PresenceEntry;
        // The hash itself has a TTL, but individual fields do not — sweep
        // stale members lazily on read.
        if (entry.updatedAt < cutoff) { expired.push(uid); continue; }
        if (uid === user.id) continue;
        peers.push(entry);
      } catch {
        expired.push(uid);
      }
    }

    if (expired.length) {
      await redis.hdel(presenceKey(id), ...expired).catch(() => {});
    }

    return NextResponse.json({ peers });
  } catch {
    // Redis unavailable — presence degrades to "nobody else here" rather than
    // breaking the editor.
    return NextResponse.json({ peers: [] });
  }
}

/** POST — heartbeat the caller's presence and return everyone else's. */
export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const doc = await resolveDocAccess(id, user.id, user.role);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    location?: string;
    scope?: string;
    leaving?: boolean;
  };

  try {
    if (body.leaving) {
      await redis.hdel(presenceKey(id), user.id).catch(() => {});
      return NextResponse.json({ peers: [] });
    }

    const entry: PresenceEntry = {
      userId: user.id,
      name: user.fullName || user.email,
      color: colorFor(user.id),
      location: body.location,
      scope: body.scope,
      updatedAt: Date.now(),
    };

    await redis.hset(presenceKey(id), user.id, JSON.stringify(entry));
    // Refresh the whole-hash TTL on every beat so an idle document eventually
    // disappears from Redis entirely.
    await redis.expire(presenceKey(id), PRESENCE_TTL_SECONDS * 4);

    const raw = await redis.hgetall(presenceKey(id));
    const cutoff = Date.now() - PRESENCE_TTL_SECONDS * 1000;
    const peers: PresenceEntry[] = [];

    for (const [uid, value] of Object.entries(raw ?? {})) {
      if (uid === user.id) continue;
      try {
        const peer = JSON.parse(value) as PresenceEntry;
        if (peer.updatedAt >= cutoff) peers.push(peer);
      } catch { /* skip malformed */ }
    }

    return NextResponse.json({ peers, self: entry });
  } catch {
    return NextResponse.json({ peers: [] });
  }
}
