import { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";

export type AuditAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "LOGOUT"
  | "EMAIL_SEND"
  | "EMAIL_QUEUED"
  | "EMAIL_REPLY"
  | "USER_CREATE"
  | "USER_UPDATE"
  | "USER_DELETE"
  | "MAILBOX_CREATE"
  | "MAILBOX_UPDATE"
  | "SIGNATURE_UPDATE"
  | "PASSWORD_RESET"
  | "ROLE_CHANGE"
  | "INBOUND_RECEIVED"
  | "THREAD_ARCHIVE"
  | "ADMIN_USER_UPDATE"
  | "DRIVE_FILE_VIEW"
  | "DRIVE_FILE_DOWNLOAD"
  | "DRIVE_FILE_UPLOAD"
  | "DRIVE_FILE_SHARE"
  | "DRIVE_FILE_EDIT"
  | "DRIVE_FILE_DELETE"
  | "DRIVE_FILE_RESTORE"
  | "RBAC_GRANT"
  | "RBAC_REVOKE"
  | "RBAC_ROLE_PERMISSIONS_SET"
  | "RBAC_ROLE_CREATED"
  | "RBAC_ROLE_UPDATED"
  | "RBAC_ROLE_DELETED"
  | "RBAC_USER_ASSIGN"
  | "RBAC_USER_UNASSIGN"
  | "RBAC_USER_ROLES_SET"
  | "ORG_DEPARTMENT_CREATED"
  | "ORG_DEPARTMENT_UPDATED"
  | "ORG_DEPARTMENT_DELETED"
  | "ORG_TEAM_CREATED"
  | "ORG_TEAM_UPDATED"
  | "ORG_TEAM_DELETED"
  | "ORG_TEAM_MEMBER_ADDED"
  | "ORG_TEAM_MEMBER_REMOVED"
  // User lifecycle. Deactivation is reversible and is the normal offboarding
  // path; purge is irreversible erasure. Both are recorded because "who
  // removed this person's access, and when" is the first question asked after
  // an incident.
  | "USER_DEACTIVATED"
  | "USER_REACTIVATED"
  | "USER_PURGED"
  // Self-service session revocation from Connect settings. Recorded because
  // "I signed out my old laptop" and "someone else signed out my laptop" look
  // identical without it.
  | "SESSION_REVOKED"
  // Connect org policy change. Retention especially: deletions happen on a
  // schedule with no other trace, so the decision has to be attributable.
  | "CONNECT_POLICY_UPDATED"
  // Client book. Money and ownership are the two things people argue about
  // after the fact, so both are recorded: who changed a client's owner, who
  // recorded a fee, and — separately — who confirmed the payment landed.
  | "CLIENT_CREATED"
  | "CLIENT_UPDATED"
  | "CLIENT_DELETED"
  | "CLIENT_OWNER_CHANGED"
  | "CLIENT_DELIVERABLE_CREATED"
  | "CLIENT_DELIVERABLE_UPDATED"
  | "CLIENT_DELIVERABLE_DELETED"
  | "CLIENT_FEE_CREATED"
  | "CLIENT_FEE_UPDATED"
  | "CLIENT_FEE_PAYMENT_CONFIRMED"
  | "CLIENT_FEE_DELETED"
  // Auto-flagged by the overdue sweep (src/workers/cleanup.worker.ts), not a
  // human action — kept distinct from CLIENT_FEE_UPDATED so the audit trail
  // shows plainly that nobody touched the record, the due date just passed.
  | "CLIENT_FEE_OVERDUE_FLAGGED"
  // The oversight trail: leadership cannot edit a client, so a request is the
  // only mark they leave. It has to be as attributable as an edit would be.
  | "CLIENT_REQUEST_RAISED"
  | "CLIENT_REQUEST_UPDATED";

export async function logAudit({
  actorId,
  action,
  targetType,
  targetId,
  metadata,
  ipAddress,
}: {
  actorId?: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}) {
  try {
    return await prisma.auditLog.create({
      data: {
        actorId,
        action,
        targetType,
        targetId,
        metadata: metadata ?? {},
        ipAddress,
      },
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
    // We don't throw here to avoid breaking the main flow
    return null;
  }
}
