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
  | "DRIVE_FILE_RESTORE";

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
