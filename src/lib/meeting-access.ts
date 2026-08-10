import { prisma } from "@/lib/prisma";

/**
 * Who may see and edit a meeting's agenda and notes.
 *
 * A meeting's agenda is not public. "Q3 breach post-mortem — decide whether to
 * notify customers" is exactly the kind of line that must not be readable by
 * anyone who happens to guess a meeting id, and notes are worse. So every agenda
 * and notes route resolves access through here rather than trusting the id in
 * the URL — the same organizer-or-participant rule `GET /api/meet/[id]` already
 * applies, in one place so the two can't drift.
 *
 * Deliberately NOT elevated for ADMIN/CEO/CISO. Elsewhere those roles can open
 * any document, but a meeting people are actively talking in is a different
 * expectation, and nothing in the product needs an admin to read an agenda they
 * weren't invited to. If that changes it should be an explicit, audited feature.
 */

export type MeetingAccess = {
  meetingId: string;
  /** The organizer can delete the meeting and edit anything on it. */
  isOrganizer: boolean;
};

/**
 * Returns access, or null when the meeting doesn't exist OR the caller isn't on
 * it — the two are deliberately indistinguishable to the caller, so probing ids
 * reveals nothing.
 */
export async function resolveMeetingAccess(
  meetingId: string,
  userId: string,
): Promise<MeetingAccess | null> {
  const meeting = await prisma.meeting.findFirst({
    where: {
      id: meetingId,
      OR: [
        { organizerId: userId },
        { participants: { some: { userId } } },
      ],
    },
    select: { id: true, organizerId: true },
  });

  if (!meeting) return null;
  return { meetingId: meeting.id, isOrganizer: meeting.organizerId === userId };
}
