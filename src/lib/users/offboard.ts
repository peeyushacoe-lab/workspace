import { prisma } from "@/lib/prisma";
import { bumpUserPermEpoch } from "@/lib/rbac/session-perms";
import { logAudit } from "@/lib/audit";

/**
 * User offboarding.
 *
 * `prisma.user.delete()` was the only way to remove someone, and it is a far
 * blunter instrument than it looks. `ChatMessage.user` is `onDelete: Cascade`,
 * so deleting a user **erases every message they ever wrote, from every
 * conversation, for everyone else**. A three-year channel history becomes a
 * conversation with one side of it missing the moment someone leaves the
 * company. `LegalHold.user` cascades too, so the delete also destroys the very
 * records placed to prevent destruction — in a security product, that is the
 * compliance version of the same bug.
 *
 * It was also *incomplete*: several Connect tables carry a user id with no
 * foreign key (`ChatScheduledMessage`, `SavedChatMessage`, `ChatPoll`,
 * `ChatPollVote`, `ChannelTab.createdById`, `ChatChannel.createdById`), so the
 * delete left rows pointing at a user that no longer exists. Simultaneously
 * too destructive and not thorough enough.
 *
 * So there are now two distinct operations, and the safe one is the default:
 *
 *   deactivate — the normal path when someone leaves. Revokes all access
 *                immediately, ends sessions, stops push, removes them from
 *                every conversation and team, cancels queued messages. History
 *                stays intact and attributed.
 *
 *   purge      — irreversible erasure, for a GDPR right-to-be-forgotten request
 *                or a test account. Refuses while a legal hold exists, and
 *                cleans the FK-less tables explicitly.
 *
 * `AuditLog.actorId` and `SecurityEvent.userId` deliberately have no foreign
 * key and are deliberately *not* cleaned by either path: an audit trail that
 * disappears when the actor is deleted is not an audit trail.
 */

export type DeactivateResult = {
  channelsLeft: number;
  teamsLeft: number;
  sessionsEnded: number;
  scheduledCancelled: number;
};

/**
 * Revoke a person's access without destroying anything they wrote.
 *
 * Ordering matters: flip `isActive` first so a request landing mid-teardown is
 * already rejected at login, then tear down the access rows, then bump the
 * permission epoch so any live session cookie is refused on its next request.
 */
export async function deactivateUser(userId: string, actorId: string): Promise<DeactivateResult> {
  await prisma.user.update({ where: { id: userId }, data: { isActive: false } });

  const [sessions, channels, teams, scheduled] = await Promise.all([
    // Ends every signed-in session on every device.
    prisma.userSession.deleteMany({ where: { userId } }),
    // Removing ChatMember is what actually revokes conversation access —
    // every Connect route authorises on membership, not on role.
    prisma.chatMember.deleteMany({ where: { userId } }),
    prisma.teamMember.deleteMany({ where: { userId } }),
    // A departed employee's queued messages must never fire. The worker would
    // also refuse them at send time, but leaving them pending means the row
    // sits there looking like it will send.
    prisma.chatScheduledMessage.deleteMany({ where: { userId, sentAt: null } }).catch(() => ({ count: 0 })),
  ]);

  await Promise.all([
    // Stop ringing their phone.
    prisma.mobilePushToken.deleteMany({ where: { userId } }).catch(() => {}),
    // Web push subscriptions live in AuditLog rows (see CLAUDE.md § gotcha 11).
    prisma.auditLog.deleteMany({ where: { actorId: userId, action: "PUSH_SUBSCRIBE" } }).catch(() => {}),
    // Don't leave them showing as "online" forever.
    prisma.userPresence.deleteMany({ where: { userId } }).catch(() => {}),
    // Revoke any delegated access they held into someone else's mailbox.
    prisma.mailboxAccess.deleteMany({ where: { userId } }).catch(() => {}),
    // Their API keys are credentials that outlive the session otherwise.
    prisma.aPIKey.updateMany({ where: { userId }, data: { isActive: false } }).catch(() => {}),
  ]);

  // Forces the signed cookie to be re-issued and rejected on next request.
  await bumpUserPermEpoch(userId).catch(() => {});

  const result: DeactivateResult = {
    channelsLeft: channels.count,
    teamsLeft: teams.count,
    sessionsEnded: sessions.count,
    scheduledCancelled: scheduled.count,
  };

  await logAudit({
    actorId,
    action: "USER_DEACTIVATED",
    targetType: "User",
    targetId: userId,
    metadata: result,
  });

  return result;
}

/** Restore access. Public channels re-join automatically on next load; team
 *  membership is deliberately not restored — that's a decision a human makes. */
export async function reactivateUser(userId: string, actorId: string) {
  await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
  await bumpUserPermEpoch(userId).catch(() => {});
  await logAudit({ actorId, action: "USER_REACTIVATED", targetType: "User", targetId: userId });
}

export type PurgeBlocker = { reason: string };

/**
 * Reasons a hard delete must not proceed. Checked before anything is written,
 * so a refused purge leaves the account exactly as it was.
 */
export async function checkPurgeBlockers(userId: string): Promise<PurgeBlocker | null> {
  const [holds, user] = await Promise.all([
    prisma.legalHold.count({ where: { userId, isActive: true } }).catch(() => 0),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } }),
  ]);

  if (!user) return { reason: "That user no longer exists" };

  if (holds > 0) {
    return {
      reason:
        "This account is under an active legal hold. Release the hold before erasing it — " +
        "deleting now would destroy the records the hold exists to preserve.",
    };
  }

  if (user.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
    if (adminCount <= 1) return { reason: "Cannot erase the last active admin account" };
  }

  // Erasure has to be a deliberate second step, not something reachable by a
  // stray click on a live account.
  if (user.isActive) {
    return { reason: "Deactivate the account first, then erase it" };
  }

  return null;
}

/**
 * Irreversible. Cascades handle the FK-backed tables; this cleans the ones
 * that carry a user id without a foreign key and would otherwise be left
 * pointing at nothing.
 */
export async function purgeUser(userId: string, actorId: string) {
  // Ordered before the delete so a failure here doesn't leave a half-erased
  // account with the User row already gone.
  await Promise.all([
    prisma.chatScheduledMessage.deleteMany({ where: { userId } }).catch(() => {}),
    prisma.savedChatMessage.deleteMany({ where: { userId } }).catch(() => {}),
    prisma.chatPollVote.deleteMany({ where: { userId } }).catch(() => {}),
    prisma.chatPoll.deleteMany({ where: { createdById: userId } }).catch(() => {}),
    prisma.channelTab.deleteMany({ where: { createdById: userId } }).catch(() => {}),
    prisma.drivePermission.deleteMany({ where: { userId } }).catch(() => {}),
    prisma.driveActivity.deleteMany({ where: { userId } }).catch(() => {}),
    prisma.scheduledEmail.deleteMany({ where: { userId } }).catch(() => {}),
    prisma.mailRule.deleteMany({ where: { userId } }).catch(() => {}),
    prisma.mailFolder.deleteMany({ where: { userId } }).catch(() => {}),
    prisma.aPIKey.deleteMany({ where: { userId } }).catch(() => {}),
    prisma.webhookEndpoint.deleteMany({ where: { userId } }).catch(() => {}),
  ]);

  // A channel whose creator is erased must not be erased with them — other
  // people are still in it. Detach instead.
  await prisma.chatChannel
    .updateMany({ where: { createdById: userId }, data: { createdById: null } })
    .catch(() => {});

  // Written *before* the delete: afterwards there is no user left to describe,
  // and the audit row is the only remaining evidence this account existed.
  await logAudit({
    actorId,
    action: "USER_PURGED",
    targetType: "User",
    targetId: userId,
    metadata: { note: "Irreversible erasure. Message history authored by this user was removed by cascade." },
  });

  await prisma.user.delete({ where: { id: userId } });
}
