import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

// ─── Client request routing ───────────────────────────────────────────────────
//
// A ClientRequest is how someone who can see the client book but not change it
// (CEO, CISO, COO) gets something changed: they ask, and the owning Business
// Manager acts. For that to be more than a suggestion box, two things have to
// hold — the request must reach a named person, and it must not quietly die if
// that person ignores it.
//
// So every request notifies:
//   * the owning Business Manager  — the person who can actually action it, and
//   * the Operations Manager       — who BMs report into, so an unanswered
//                                    request has somewhere to escalate without
//                                    the raiser having to chase it themselves.
//
// An unowned client has no BM to notify; those route to the Ops Manager alone,
// who is also the person who would assign an owner.

/**
 * The Ops Manager account, if one exists — falling back to an Admin when the
 * seat is empty.
 *
 * OPS_MANAGER is a singleton (see KEY_ROLES in src/lib/auth.ts) and both
 * request escalation and the Business Manager reporting line resolve to it.
 * An empty seat must never mean "notifies nobody" or "reports to nobody" — a
 * newly-provisioned org with no Ops Manager yet still has an Admin, so that is
 * the fallback rather than silently dropping the notification.
 */
export async function findOpsManagerId(organizationId: string | null): Promise<string | null> {
  const om = await prisma.user.findFirst({
    where: {
      role: "OPS_MANAGER",
      isActive: true,
      ...(organizationId ? { organizationId } : {}),
    },
    select: { id: true },
  });
  if (om) return om.id;

  const admin = await prisma.user.findFirst({
    where: {
      role: "ADMIN",
      isActive: true,
      ...(organizationId ? { organizationId } : {}),
    },
    select: { id: true },
    orderBy: { createdAt: "asc" }, // the founding admin, for stability across calls
  });
  return admin?.id ?? null;
}

/**
 * Everyone who should hear about a request on this client: the owner plus the
 * Ops Manager, minus whoever raised it (nobody needs telling about their own
 * message) and minus duplicates — the Ops Manager may own a client directly.
 */
export async function requestRecipients(opts: {
  ownerId: string | null;
  organizationId: string | null;
  raisedById: string;
}): Promise<string[]> {
  const opsManagerId = await findOpsManagerId(opts.organizationId);
  const ids = new Set<string>();
  if (opts.ownerId) ids.add(opts.ownerId);
  if (opsManagerId) ids.add(opsManagerId);
  ids.delete(opts.raisedById);
  return [...ids];
}

/**
 * Notify the owner + Ops Manager that a request was raised.
 *
 * Failures are swallowed per recipient: a Redis hiccup in the notification fan
 * out must not fail a request that is already committed. The request row is the
 * record of truth; the notification is only a nudge toward it.
 */
export async function notifyRequestRaised(opts: {
  requestId: string;
  clientId: string;
  clientName: string;
  subject: string;
  raisedByName: string;
  recipientIds: string[];
  priority: string;
}): Promise<void> {
  await Promise.all(
    opts.recipientIds.map((userId) =>
      createNotification({
        userId,
        type: "SYSTEM",
        title: `Request on ${opts.clientName}`,
        body: `${opts.raisedByName}: ${opts.subject}`,
        link: `/clients/${opts.clientId}?request=${opts.requestId}`,
        metadata: {
          kind: "client-request",
          requestId: opts.requestId,
          clientId: opts.clientId,
          priority: opts.priority,
        },
      }).catch((err) => {
        console.error("[client-request] notify failed", userId, err);
      }),
    ),
  );
}

/** Tell the raiser their request moved. The loop only closes if they hear back. */
export async function notifyRequestUpdated(opts: {
  requestId: string;
  clientId: string;
  clientName: string;
  raisedById: string;
  actorId: string;
  actorName: string;
  status: string;
  note?: string | null;
}): Promise<void> {
  if (opts.raisedById === opts.actorId) return; // acting on your own request
  const verb = opts.status.toLowerCase().replace("_", " ");
  await createNotification({
    userId: opts.raisedById,
    type: "SYSTEM",
    title: `${opts.clientName}: request ${verb}`,
    body: opts.note?.trim()
      ? `${opts.actorName}: ${opts.note.trim()}`
      : `${opts.actorName} marked your request ${verb}.`,
    link: `/clients/${opts.clientId}?request=${opts.requestId}`,
    metadata: { kind: "client-request", requestId: opts.requestId, clientId: opts.clientId },
  }).catch((err) => {
    console.error("[client-request] notify failed", opts.raisedById, err);
  });
}

/** Notify participants that someone replied on a request thread. */
export async function notifyRequestComment(opts: {
  requestId: string;
  clientId: string;
  clientName: string;
  authorId: string;
  authorName: string;
  body: string;
  participantIds: string[];
}): Promise<void> {
  const recipients = [...new Set(opts.participantIds)].filter((id) => id !== opts.authorId);
  await Promise.all(
    recipients.map((userId) =>
      createNotification({
        userId,
        type: "SYSTEM",
        title: `Reply on ${opts.clientName}`,
        body: `${opts.authorName}: ${opts.body.slice(0, 140)}`,
        link: `/clients/${opts.clientId}?request=${opts.requestId}`,
        metadata: { kind: "client-request", requestId: opts.requestId, clientId: opts.clientId },
      }).catch((err) => {
        console.error("[client-request] notify failed", userId, err);
      }),
    ),
  );
}
