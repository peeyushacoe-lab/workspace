"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, AlertCircle, CheckCircle2, Clock, X,
  Users, Wrench, Coffee, Layers, Building2, ChevronLeft,
  RefreshCw, ListTodo, UserCheck, Flag, Circle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Shell";
import type { HotelAlertPriority, HotelAlertStatus } from "@/lib/hospitality/types";

// ─── Color maps (client-safe — no server imports) ─────────────────────────────

const PRIORITY_CHIP: Record<HotelAlertPriority, string> = {
  CRITICAL: "bg-crit-soft text-crit border-crit/25",
  HIGH:     "bg-warn-soft text-warn border-warn/25",
  MEDIUM:   "bg-accent-soft text-accent-strong border-accent/25",
  LOW:      "bg-hover text-muted border-border",
};

const STATUS_CHIP: Record<HotelAlertStatus, string> = {
  OPEN:        "bg-crit-soft text-crit border-crit/25",
  IN_PROGRESS: "bg-warn-soft text-warn border-warn/25",
  RESOLVED:    "bg-ok-soft text-ok border-ok/25",
  DISMISSED:   "bg-hover text-muted border-border",
};

const STATUS_ICON: Record<HotelAlertStatus, React.ComponentType<{ className?: string }>> = {
  OPEN:        AlertCircle,
  IN_PROGRESS: Clock,
  RESOLVED:    CheckCircle2,
  DISMISSED:   X,
};

const DEPT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  front_office: Users,
  housekeeping: Layers,
  engineering:  Wrench,
  f_and_b:      Coffee,
};

const DEPT_LABELS: Record<string, string> = {
  front_office: "Front Office",
  housekeeping: "Housekeeping",
  engineering:  "Engineering",
  f_and_b:      "Food & Beverage",
};

const PRIORITY_ORDER: HotelAlertPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

// ─── Types (lightweight — avoid importing Prisma types into client) ────────────

type AssignedTo = { id: string; fullName: string; avatarUrl: string | null; email: string } | null;
type LinkedTask  = { id: string; title: string; status: string; priority: string } | null;
type AuditEntry  = { id: string; action: string; metadata: unknown; createdAt: string; actor: { id: string; fullName: string } | null };

type AlertFull = {
  id: string;
  propertyId: string;
  source: string;
  type: string;
  department: string | null;
  priority: HotelAlertPriority;
  title: string;
  description: string | null;
  roomNumber: string | null;
  status: HotelAlertStatus;
  assignedToId: string | null;
  assignedTo: AssignedTo;
  taskId: string | null;
  metadata: unknown;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  property: { id: string; name: string; city: string | null; currency: string };
};

type DetailResponse = {
  alert: AlertFull;
  auditHistory: AuditEntry[];
  linkedTask: LinkedTask;
  isDemo: boolean;
};

// ─── Small helpers ────────────────────────────────────────────────────────────

function relTime(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1)    return "just now";
  if (mins < 60)   return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function auditLabel(action: string) {
  return action
    .replace("HOTEL_ALERT_", "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, c => c.toUpperCase());
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({
  label, icon: Icon, onClick, loading, variant = "default",
}: {
  label:    string;
  icon:     React.ComponentType<{ className?: string }>;
  onClick:  () => void;
  loading?: boolean;
  variant?: "default" | "danger" | "ok";
}) {
  const base = "flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-50";
  const cls =
    variant === "danger" ? `${base} bg-crit-soft text-crit border border-crit/20 hover:bg-crit/10` :
    variant === "ok"     ? `${base} bg-ok-soft text-ok border border-ok/20 hover:bg-ok/10` :
    `${base} bg-surface-sunken text-muted border border-border hover:bg-hover hover:text-foreground`;

  return (
    <button onClick={onClick} disabled={loading} className={cls}>
      {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AlertDetail({ alertId }: { alertId: string }) {
  const [data,    setData]    = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/hospitality/alerts/${alertId}`);
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
    } catch {
      toast.error("Failed to load alert");
    } finally {
      setLoading(false);
    }
  }, [alertId]);

  useEffect(() => { load(); }, [load]);

  async function doAction(action: string, extra?: Record<string, unknown>) {
    setActing(action);
    try {
      const res = await fetch(`/api/hospitality/alerts/${alertId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Alert updated");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActing(null);
    }
  }

  async function createTask() {
    setActing("task");
    try {
      const res = await fetch(`/api/hospitality/alerts/${alertId}/task`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    "{}",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      toast.success("Task created");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader eyebrow="Hospitality · Alerts" title="Loading…" description="" />
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 text-muted animate-spin" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader eyebrow="Hospitality · Alerts" title="Alert not found" description="" />
      </div>
    );
  }

  const { alert, auditHistory, linkedTask, isDemo } = data;
  const DeptIcon   = alert.department ? (DEPT_ICON[alert.department] ?? Building2) : Building2;
  const StatusIcon = STATUS_ICON[alert.status];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <PageHeader
        eyebrow="Hospitality · Alerts"
        title={alert.title}
        description={`${alert.property.name}${alert.roomNumber ? ` · Room ${alert.roomNumber}` : ""}`}
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/hospitality/alerts"
              className="flex items-center gap-1 text-[12px] text-muted hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> All alerts
            </Link>
            {isDemo && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent-soft text-accent-strong border border-accent/20">
                DEMO
              </span>
            )}
          </div>
        }
      />

      <div className="flex-1 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: details + actions */}
          <div className="lg:col-span-2 space-y-5">

            {/* Status + priority badges */}
            <div className="flex flex-wrap gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold border ${STATUS_CHIP[alert.status]}`}>
                <StatusIcon className="w-3 h-3" />
                {alert.status.replace("_", " ")}
              </span>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-[12px] font-semibold border ${PRIORITY_CHIP[alert.priority]}`}>
                {alert.priority}
              </span>
              {alert.department && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] border bg-surface-sunken text-muted border-border">
                  <DeptIcon className="w-3 h-3" />
                  {DEPT_LABELS[alert.department] ?? alert.department}
                </span>
              )}
            </div>

            {/* Description */}
            {alert.description && (
              <div className="bg-surface border border-border rounded-xl p-4">
                <p className="text-[11px] font-medium text-subtle tracking-wide mb-2">DESCRIPTION</p>
                <p className="text-[13px] text-muted leading-relaxed">{alert.description}</p>
              </div>
            )}

            {/* Metadata grid */}
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-[11px] font-medium text-subtle tracking-wide mb-3">DETAILS</p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
                {[
                  ["Source",      alert.source],
                  ["Type",        alert.type.replace(/_/g, " ")],
                  ["Room",        alert.roomNumber ?? "—"],
                  ["Created",     new Date(alert.createdAt).toLocaleString()],
                  ["Updated",     relTime(alert.updatedAt)],
                  ["Resolved",    alert.resolvedAt ? new Date(alert.resolvedAt).toLocaleString() : "—"],
                  ["Property",    alert.property.name],
                ].map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-[11px] text-subtle col-span-1">{k}</dt>
                    <dd className="text-[12px] text-foreground font-medium col-span-1">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Linked task */}
            {linkedTask && (
              <div className="bg-surface border border-border rounded-xl p-4">
                <p className="text-[11px] font-medium text-subtle tracking-wide mb-2">LINKED TASK</p>
                <div className="flex items-center gap-3">
                  <ListTodo className="w-4 h-4 text-muted" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{linkedTask.title}</p>
                    <p className="text-[11px] text-muted">{linkedTask.status} · {linkedTask.priority}</p>
                  </div>
                  <a
                    href="/tasks"
                    className="text-[12px] text-accent hover:underline"
                  >
                    View in Tasks →
                  </a>
                </div>
              </div>
            )}

            {/* Actions */}
            {!isDemo && (
              <div className="bg-surface border border-border rounded-xl p-4">
                <p className="text-[11px] font-medium text-subtle tracking-wide mb-3">ACTIONS</p>
                <div className="flex flex-wrap gap-2">
                  {alert.status !== "RESOLVED" && alert.status !== "DISMISSED" && (
                    <>
                      <ActionBtn
                        label="Resolve"
                        icon={CheckCircle2}
                        variant="ok"
                        loading={acting === "resolve"}
                        onClick={() => doAction("resolve")}
                      />
                      <ActionBtn
                        label="Dismiss"
                        icon={X}
                        variant="danger"
                        loading={acting === "dismiss"}
                        onClick={() => doAction("dismiss")}
                      />
                      {alert.status === "OPEN" && (
                        <ActionBtn
                          label="Mark In Progress"
                          icon={Clock}
                          loading={acting === "status"}
                          onClick={() => doAction("status", { status: "IN_PROGRESS" })}
                        />
                      )}
                      {!linkedTask && (
                        <ActionBtn
                          label="Create Task"
                          icon={ListTodo}
                          loading={acting === "task"}
                          onClick={createTask}
                        />
                      )}
                    </>
                  )}
                  {alert.status === "RESOLVED" && (
                    <ActionBtn
                      label="Re-open"
                      icon={AlertTriangle}
                      loading={acting === "status"}
                      onClick={() => doAction("status", { status: "OPEN" })}
                    />
                  )}
                </div>

                {/* Priority change */}
                <div className="mt-3 pt-3 border-t border-border-soft">
                  <p className="text-[11px] text-subtle mb-2 flex items-center gap-1">
                    <Flag className="w-3 h-3" /> Change priority
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {PRIORITY_ORDER.map(p => (
                      <button
                        key={p}
                        disabled={alert.priority === p || !!acting}
                        onClick={() => doAction("priority", { priority: p })}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${PRIORITY_CHIP[p]} ${alert.priority === p ? "ring-2 ring-offset-1 ring-current" : "opacity-70 hover:opacity-100"}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {isDemo && (
              <div className="flex items-start gap-2 bg-accent-soft border border-accent/20 rounded-xl p-3">
                <Building2 className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-accent-strong">
                  This is a demo alert. Actions are disabled. Create a real property and connect your systems to manage live alerts.
                </p>
              </div>
            )}
          </div>

          {/* Right: assignee + audit trail */}
          <div className="space-y-5">

            {/* Assignee */}
            <div className="bg-surface border border-border rounded-xl p-4">
              <p className="text-[11px] font-medium text-subtle tracking-wide mb-3 flex items-center gap-1">
                <UserCheck className="w-3 h-3" /> ASSIGNED TO
              </p>
              {alert.assignedTo ? (
                <div className="flex items-center gap-2">
                  {alert.assignedTo.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={alert.assignedTo.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-accent-soft flex items-center justify-center">
                      <span className="text-[12px] font-semibold text-accent-strong">
                        {alert.assignedTo.fullName.charAt(0)}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="text-[13px] font-medium text-foreground">{alert.assignedTo.fullName}</p>
                    <p className="text-[11px] text-muted">{alert.assignedTo.email}</p>
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-subtle flex items-center gap-1">
                  <Circle className="w-3 h-3" /> Unassigned
                </p>
              )}
            </div>

            {/* Audit timeline */}
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border-soft">
                <p className="text-[11px] font-medium text-subtle tracking-wide">ACTIVITY</p>
              </div>
              {auditHistory.length === 0 ? (
                <p className="text-[12px] text-subtle px-4 py-4">No activity recorded yet</p>
              ) : (
                <div className="divide-y divide-border-soft">
                  {auditHistory.map(entry => (
                    <div key={entry.id} className="flex gap-3 px-4 py-3">
                      <div className="w-5 h-5 rounded-full bg-surface-sunken flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Clock className="w-2.5 h-2.5 text-subtle" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-foreground font-medium">{auditLabel(entry.action)}</p>
                        {entry.actor && (
                          <p className="text-[11px] text-subtle">{entry.actor.fullName}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-subtle flex-shrink-0">{relTime(entry.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
