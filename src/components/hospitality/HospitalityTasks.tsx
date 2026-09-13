"use client";

import { useMemo } from "react";
import {
  CheckCircle2, Clock, Users, Wrench, Coffee,
  Layers, Building2, Plus, Circle,
} from "lucide-react";
import { PageHeader } from "@/components/Shell";
import { getDemoAlerts } from "@/lib/hospitality/demo-data";
import type { HotelAlertPriority } from "@/lib/hospitality/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type KanbanColumn = "open" | "in_progress" | "resolved";

type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  priority: HotelAlertPriority;
  department: string | null;
  roomNumber: string | null;
  assignedToName: string | null;
  column: KanbanColumn;
  createdAt: string;
};

// ─── Maps ─────────────────────────────────────────────────────────────────────

const PRIORITY_CHIP: Record<HotelAlertPriority, string> = {
  CRITICAL: "bg-crit-soft text-crit border-crit/25",
  HIGH:     "bg-warn-soft text-warn border-warn/25",
  MEDIUM:   "bg-accent-soft text-accent-strong border-accent/25",
  LOW:      "bg-hover text-muted border-border",
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
  f_and_b:      "F&B",
};

// ─── Task card ────────────────────────────────────────────────────────────────

function TaskCard({ task }: { task: TaskItem }) {
  const DeptIcon = task.department ? (DEPT_ICON[task.department] ?? Building2) : Building2;

  return (
    <div className="bg-surface border border-border rounded-xl p-3 shadow-sm hover:shadow-panel transition-shadow">
      <div className="flex items-start gap-2 mb-2">
        <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${PRIORITY_CHIP[task.priority]}`}>
          {task.priority}
        </span>
        {task.roomNumber && (
          <span className="text-[11px] text-subtle">Room {task.roomNumber}</span>
        )}
      </div>
      <p className="text-[13px] font-medium text-foreground leading-snug">{task.title}</p>
      {task.description && (
        <p className="text-[11px] text-muted mt-1 line-clamp-2">{task.description}</p>
      )}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border-soft">
        {task.department && (
          <span className="flex items-center gap-1 text-[11px] text-subtle">
            <DeptIcon className="w-3 h-3" />
            {DEPT_LABELS[task.department] ?? task.department}
          </span>
        )}
        {task.assignedToName && (
          <span className="flex items-center gap-1 text-[11px] text-subtle ml-auto">
            <Users className="w-3 h-3" />
            {task.assignedToName}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

const COLUMN_CONFIG = {
  open:        { label: "Open",        icon: Circle,        color: "text-crit" },
  in_progress: { label: "In Progress", icon: Clock,         color: "text-warn" },
  resolved:    { label: "Resolved",    icon: CheckCircle2,  color: "text-ok" },
};

function KanbanCol({
  column, tasks,
}: { column: KanbanColumn; tasks: TaskItem[] }) {
  const cfg = COLUMN_CONFIG[column];
  const Icon = cfg.icon;

  return (
    <div className="flex flex-col min-w-[260px] flex-1">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Icon className={`w-4 h-4 ${cfg.color}`} />
        <h3 className="text-[13px] font-semibold text-foreground">{cfg.label}</h3>
        <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-sunken text-muted border border-border">
          {tasks.length}
        </span>
      </div>
      <div className="flex flex-col gap-2 min-h-[120px]">
        {tasks.map(t => <TaskCard key={t.id} task={t} />)}
        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-20 bg-surface-sunken rounded-xl border border-dashed border-border">
            <p className="text-[11px] text-subtle">No tasks</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function HospitalityTasks() {
  const alerts = useMemo(() => getDemoAlerts(), []);

  const tasks: TaskItem[] = useMemo(() => alerts.map(a => ({
    id:             a.id,
    title:          a.title,
    description:    a.description,
    priority:       a.priority,
    department:     a.department,
    roomNumber:     a.roomNumber,
    assignedToName: a.assignedToName,
    column:         a.status === "RESOLVED" || a.status === "DISMISSED"
                      ? "resolved"
                      : a.status === "IN_PROGRESS"
                      ? "in_progress"
                      : "open",
    createdAt: a.createdAt,
  })), [alerts]);

  const columns: Record<KanbanColumn, TaskItem[]> = useMemo(() => ({
    open:        tasks.filter(t => t.column === "open"),
    in_progress: tasks.filter(t => t.column === "in_progress"),
    resolved:    tasks.filter(t => t.column === "resolved"),
  }), [tasks]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        eyebrow="Hospitality"
        title="Tasks"
        description="Operational tasks and work orders"
        action={
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover transition-colors">
            <Plus className="w-4 h-4" />
            New task
          </button>
        }
      />

      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 p-6 min-h-full" style={{ minWidth: "780px" }}>
          {(["open", "in_progress", "resolved"] as KanbanColumn[]).map(col => (
            <KanbanCol key={col} column={col} tasks={columns[col]} />
          ))}
        </div>
      </div>
    </div>
  );
}
