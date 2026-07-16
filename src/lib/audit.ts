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
  | "ORG_TEAM_MEMBER_REMOVED";

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
