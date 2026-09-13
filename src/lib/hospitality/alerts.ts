// ─── Hospitality Alert Helpers ────────────────────────────────────────────────
// Server-side only — imports Prisma. Use in API routes, not in components.

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import type { HotelAlertPriority, HotelAlertStatus } from "./types";

// ─── Input types ──────────────────────────────────────────────────────────────

export type CreateAlertInput = {
  propertyId:   string;
  source:       string;
  type:         string;
  department?:  string;
  priority?:    HotelAlertPriority;
  title:        string;
  description?: string;
  roomNumber?:  string;
  metadata?:    Record<string, unknown>;
  actorId?:     string;
};

// ─── Deduplication ────────────────────────────────────────────────────────────
// Prevent the same source+type+room combination from creating duplicate active
// alerts within a 24-hour window.

async function findActiveDedup(
  propertyId: string,
  source:     string,
  type:       string,
  roomNumber: string | undefined,
) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.hotelAlert.findFirst({
    where: {
      propertyId,
      source,
      type,
      roomNumber:  roomNumber ?? null,
      status:      { notIn: ["RESOLVED", "DISMISSED"] },
      createdAt:   { gte: since },
    },
  });
}

// ─── Priority → TaskPriority mapping ─────────────────────────────────────────

function toTaskPriority(p: HotelAlertPriority): "URGENT" | "HIGH" | "MEDIUM" | "LOW" {
  if (p === "CRITICAL") return "URGENT";
  if (p === "HIGH")     return "HIGH";
  if (p === "MEDIUM")   return "MEDIUM";
  return "LOW";
}

// ─── Notify assignee (non-blocking) ──────────────────────────────────────────

async function notifyAssignee(
  userId:   string,
  alertId:  string,
  title:    string,
  priority: HotelAlertPriority,
) {
  try {
    await createNotification({
      userId,
      type:     "HOTEL_ALERT",
      title:    priority === "CRITICAL" ? `🚨 Critical alert: ${title}` : `Alert assigned: ${title}`,
      body:     `A ${priority.toLowerCase()} priority hotel alert requires your attention.`,
      link:     `/hospitality/alerts/${alertId}`,
      metadata: { alertId, priority },
    });
  } catch {
    // Notification failure must never break the primary operation.
  }
}

// ─── CRUD operations ──────────────────────────────────────────────────────────

export async function createHotelAlert(input: CreateAlertInput) {
  // Dedup check — return existing active alert rather than creating a duplicate.
  const existing = await findActiveDedup(
    input.propertyId, input.source, input.type, input.roomNumber,
  );
  if (existing) return { alert: existing, isDuplicate: true };

  const alert = await prisma.hotelAlert.create({
    data: {
      propertyId:  input.propertyId,
      source:      input.source,
      type:        input.type,
      department:  input.department ?? null,
      priority:    (input.priority ?? "MEDIUM") as HotelAlertPriority,
      title:       input.title,
      description: input.description ?? null,
      roomNumber:  input.roomNumber ?? null,
      metadata:    (input.metadata ?? {}) as Prisma.InputJsonValue,
      status:      "OPEN",
    },
  });

  await logAudit({
    actorId:    input.actorId ?? null,
    action:     "HOTEL_ALERT_CREATED",
    targetType: "hotel_alert",
    targetId:   alert.id,
    metadata:   { title: alert.title, priority: alert.priority, source: alert.source },
  });

  // Notify for CRITICAL and HIGH alerts if assigned.
  if (
    (alert.priority === "CRITICAL" || alert.priority === "HIGH") &&
    alert.assignedToId
  ) {
    notifyAssignee(alert.assignedToId, alert.id, alert.title, alert.priority);
  }

  return { alert, isDuplicate: false };
}

export async function resolveHotelAlert(alertId: string, actorId: string) {
  const alert = await prisma.hotelAlert.update({
    where: { id: alertId },
    data:  { status: "RESOLVED", resolvedAt: new Date() },
  });

  await logAudit({
    actorId,
    action:     "HOTEL_ALERT_RESOLVED",
    targetType: "hotel_alert",
    targetId:   alertId,
    metadata:   { title: alert.title },
  });

  return alert;
}

export async function dismissHotelAlert(alertId: string, actorId: string) {
  const alert = await prisma.hotelAlert.update({
    where: { id: alertId },
    data:  { status: "DISMISSED" },
  });

  await logAudit({
    actorId,
    action:     "HOTEL_ALERT_DISMISSED",
    targetType: "hotel_alert",
    targetId:   alertId,
    metadata:   { title: alert.title },
  });

  return alert;
}

export async function assignHotelAlert(
  alertId:      string,
  assignedToId: string,
  actorId:      string,
) {
  const alert = await prisma.hotelAlert.update({
    where: { id: alertId },
    data:  { assignedToId, status: "IN_PROGRESS" },
  });

  await logAudit({
    actorId,
    action:     "HOTEL_ALERT_ASSIGNED",
    targetType: "hotel_alert",
    targetId:   alertId,
    metadata:   { assignedToId },
  });

  notifyAssignee(assignedToId, alertId, alert.title, alert.priority);

  return alert;
}

export async function changeAlertPriority(
  alertId:  string,
  priority: HotelAlertPriority,
  actorId:  string,
) {
  const prev  = await prisma.hotelAlert.findUnique({ where: { id: alertId }, select: { priority: true } });
  const alert = await prisma.hotelAlert.update({
    where: { id: alertId },
    data:  { priority },
  });

  await logAudit({
    actorId,
    action:     "HOTEL_ALERT_PRIORITY_CHANGED",
    targetType: "hotel_alert",
    targetId:   alertId,
    metadata:   { from: prev?.priority, to: priority },
  });

  return alert;
}

export async function changeAlertStatus(
  alertId: string,
  status:  HotelAlertStatus,
  actorId: string,
) {
  const data: Record<string, unknown> = { status };
  if (status === "RESOLVED")  data.resolvedAt = new Date();
  if (status === "DISMISSED") data.resolvedAt = null;

  const alert = await prisma.hotelAlert.update({
    where: { id: alertId },
    data: data as Prisma.HotelAlertUpdateInput,
  });

  await logAudit({
    actorId,
    action:     status === "RESOLVED"  ? "HOTEL_ALERT_RESOLVED"
              : status === "DISMISSED" ? "HOTEL_ALERT_DISMISSED"
              : "HOTEL_ALERT_STATUS_CHANGED",
    targetType: "hotel_alert",
    targetId:   alertId,
    metadata:   { status },
  });

  return alert;
}

// ─── Task creation ────────────────────────────────────────────────────────────

export async function createTaskFromHotelAlert(
  alertId:     string,
  actorId:     string,
  assigneeId?: string,
) {
  const alert = await prisma.hotelAlert.findUnique({
    where: { id: alertId },
    select: {
      id: true, title: true, description: true,
      priority: true, status: true, taskId: true,
      roomNumber: true, department: true,
    },
  });

  if (!alert) throw new Error("Alert not found");
  if (alert.taskId) throw new Error("Task already exists for this alert");

  const contextLines: string[] = [];
  if (alert.roomNumber)  contextLines.push(`Room: ${alert.roomNumber}`);
  if (alert.department)  contextLines.push(`Department: ${alert.department.replace("_", " ")}`);
  if (alert.description) contextLines.push(`\n${alert.description}`);

  const task = await prisma.task.create({
    data: {
      title:        `[HOTEL ALERT] ${alert.title}`,
      description:  contextLines.join("\n") || null,
      priority:     toTaskPriority(alert.priority as HotelAlertPriority),
      status:       "TODO",
      sourceType:   "hotel_alert",
      sourceId:     alertId,
      createdById:  actorId,
      assignees:    assigneeId
        ? { create: { userId: assigneeId } }
        : undefined,
    },
  });

  // Link task back to alert and move to IN_PROGRESS.
  await prisma.hotelAlert.update({
    where: { id: alertId },
    data:  { taskId: task.id, status: "IN_PROGRESS" },
  });

  await logAudit({
    actorId,
    action:     "HOTEL_ALERT_TASK_CREATED",
    targetType: "hotel_alert",
    targetId:   alertId,
    metadata:   { taskId: task.id, title: task.title },
  });

  return { task, alertId };
}

// ─── UI color tokens (Atrium) ─────────────────────────────────────────────────
// Client-safe — plain string records, no server imports.

export const PRIORITY_ORDER: Record<HotelAlertPriority, number> = {
  CRITICAL: 0,
  HIGH:     1,
  MEDIUM:   2,
  LOW:      3,
};

export const STATUS_COLORS: Record<HotelAlertStatus, { bg: string; text: string; border: string }> = {
  OPEN:        { bg: "bg-crit-soft",  text: "text-crit",   border: "border-crit/25" },
  IN_PROGRESS: { bg: "bg-warn-soft",  text: "text-warn",   border: "border-warn/25" },
  RESOLVED:    { bg: "bg-ok-soft",    text: "text-ok",     border: "border-ok/25" },
  DISMISSED:   { bg: "bg-hover",      text: "text-muted",  border: "border-border" },
};

export const PRIORITY_COLORS: Record<HotelAlertPriority, { bg: string; text: string; border: string }> = {
  CRITICAL: { bg: "bg-crit-soft",   text: "text-crit",         border: "border-crit/25" },
  HIGH:     { bg: "bg-warn-soft",   text: "text-warn",         border: "border-warn/25" },
  MEDIUM:   { bg: "bg-accent-soft", text: "text-accent-strong", border: "border-accent/25" },
  LOW:      { bg: "bg-hover",       text: "text-muted",        border: "border-border" },
};
