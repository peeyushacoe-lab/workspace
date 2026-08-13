import { prisma } from "@/lib/prisma";

/**
 * Reporting-line integrity.
 *
 * `User.managerId` is a self-relation, which means the data can describe an
 * impossible org: A reports to B, B reports to A. Nothing crashes when you write
 * it — the damage shows up later, when something walks the chain to build an org
 * chart or resolve an approval path and loops forever.
 *
 * The database blocks the one-hop case (`User_manager_not_self` CHECK). Longer
 * cycles can't be expressed as a CHECK, so they're validated here before write.
 */

/** Depth cap. Also a runaway guard if a cycle somehow already exists in the data. */
export const MAX_CHAIN = 64;

/** Resolves one person's current manager id. Injected so the walk is testable. */
export type ManagerLookup = (userId: string) => Promise<string | null>;

/**
 * The pure cycle check — walk logic with no database.
 *
 * Separated from `wouldCreateReportingCycle` so the traversal can be tested
 * exhaustively (self, two-hop, deep chains, pre-existing corruption) without a
 * Postgres instance. The graph walk is the part with the bugs; the query isn't.
 */
export async function detectReportingCycle(
  userId: string,
  managerId: string,
  lookup: ManagerLookup,
): Promise<boolean> {
  if (userId === managerId) return true;

  let cursor: string | null = managerId;
  const seen = new Set<string>([userId]);

  for (let depth = 0; depth < MAX_CHAIN && cursor; depth++) {
    // Reaching `userId` means the proposed edge closes a loop. Reaching anything
    // already seen means the data ALREADY contains a cycle above the proposed
    // manager — also a refusal, since writing into it would deepen the damage.
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = await lookup(cursor);
  }

  // Ran out of depth without terminating: treat as a cycle rather than allow a
  // write whose safety we couldn't establish.
  return cursor !== null;
}

/**
 * Would setting `userId`'s manager to `managerId` create a cycle?
 *
 * One query per level, but chains are a handful deep in practice and this runs
 * only on an admin write.
 */
export async function wouldCreateReportingCycle(
  userId: string,
  managerId: string,
): Promise<boolean> {
  return detectReportingCycle(userId, managerId, async (id) => {
    const row = await prisma.user.findUnique({
      where: { id },
      select: { managerId: true },
    });
    return row?.managerId ?? null;
  });
}

/**
 * The chain of managers above a user, nearest first.
 *
 * Stops on a repeat rather than looping, so a cycle already present in the data
 * degrades to a truncated chain instead of hanging the request.
 */
export async function getReportingChain(
  userId: string,
): Promise<Array<{ id: string; fullName: string; jobTitle: string | null }>> {
  const chain: Array<{ id: string; fullName: string; jobTitle: string | null }> = [];
  const seen = new Set<string>([userId]);

  // `string`, not `string | null`: the loop breaks the moment there is no next
  // manager, so the cursor is never null when it reaches the query. Typing it
  // nullable made `where: { id: cursor }` fail to match `UserWhereUniqueInput`,
  // and a `where` that doesn't typecheck collapses Prisma's conditional result
  // type to the full User payload — which is why the compiler reported the
  // confusing "property 'manager' is missing" against the annotation below
  // rather than pointing at the actual mismatch.
  let cursor: string = userId;

  for (let depth = 0; depth < MAX_CHAIN; depth++) {
    const row: {
      managerId: string | null;
      manager: { id: string; fullName: string; jobTitle: string | null } | null;
    } | null = await prisma.user.findUnique({
      where: { id: cursor },
      select: {
        managerId: true,
        manager: { select: { id: true, fullName: true, jobTitle: true } },
      },
    });

    const next = row?.manager;
    if (!next || seen.has(next.id)) break;

    chain.push(next);
    seen.add(next.id);
    cursor = next.id;
  }

  return chain;
}
