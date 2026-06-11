"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, X, Search, Columns, List, Calendar,
  Flag, User, Tag, ChevronDown, Loader2, Pencil, Trash2,
  CheckCircle2, Circle, Timer,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Shell";

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskStatus = "todo" | "in_progress" | "done";
type TaskPriority = "low" | "medium" | "high" | "urgent";

type Task = {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo?: string;
  dueDate?: string;
  createdBy: string;
  createdAt: string;
  labels: string[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  todo:        { label: "To Do",       color: "text-[#5c6b72]",  bg: "bg-[#5c6b72]/10",  border: "border-[#5c6b72]/30",  icon: Circle },
  in_progress: { label: "In Progress", color: "text-[#00d2ff]",  bg: "bg-[#00d2ff]/10",  border: "border-[#00d2ff]/30",  icon: Timer },
  done:        { label: "Done",        color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/30", icon: CheckCircle2 },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bg: string; border: string; dot: string }> = {
  low:    { label: "Low",    color: "text-[#5c6b72]",  bg: "bg-[#5c6b72]/10",  border: "border-[#5c6b72]/30",  dot: "bg-[#5c6b72]" },
  medium: { label: "Medium", color: "text-[#00d2ff]",  bg: "bg-[#00d2ff]/10",  border: "border-[#00d2ff]/30",  dot: "bg-[#00d2ff]" },
  high:   { label: "High",   color: "text-amber-400",  bg: "bg-amber-400/10",  border: "border-amber-400/30",  dot: "bg-amber-400" },
  urgent: { label: "Urgent", color: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/30",    dot: "bg-red-400" },
};

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];
const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isDue(iso?: string) {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// ─── Priority Badge ───────────────────────────────────────────────────────────

function PriorityBadge({ priority, size = "sm" }: { priority: TaskPriority; size?: "xs" | "sm" }) {
  const cfg = PRIORITY_CONFIG[priority];
  const textSize = size === "xs" ? "text-[9px]" : "text-[10px]";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ${textSize} ${cfg.color} ${cfg.bg} border ${cfg.border}`}>
      <span className={`w-1 h-1 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TaskStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${cfg.color} ${cfg.bg} border ${cfg.border}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

// ─── Label Chip ───────────────────────────────────────────────────────────────

function LabelChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-[#262939] text-[#bbc9cf] border border-[rgba(0,255,255,0.08)]">
      <Tag className="w-2 h-2 text-[#5c6b72]" />
      {label}
    </span>
  );
}

// ─── Task Modal ───────────────────────────────────────────────────────────────

type ModalMode = "create" | "edit";

function TaskModal({
  mode,
  initial,
  onClose,
  onSave,
}: {
  mode: ModalMode;
  initial?: Partial<Task>;
  onClose: () => void;
  onSave: (data: Partial<Task>) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? "todo");
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(initial?.dueDate ? initial.dueDate.slice(0, 10) : "");
  const [labelsRaw, setLabelsRaw] = useState(initial?.labels?.join(", ") ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const labels = labelsRaw
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);
      await onSave({
        title: title.trim(),
        description: description || undefined,
        status,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        labels,
      });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full px-3 py-2 bg-[#0f1321] border border-[rgba(0,255,255,0.12)] rounded-lg text-sm text-[#dfe1f6] placeholder-[#3c4f5a] focus:outline-none focus:border-[#00d2ff]/50 transition-colors";
  const labelCls = "block text-[10px] font-semibold uppercase tracking-widest text-[#5c6b72] mb-1.5";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#1b1f2e] border border-[rgba(0,255,255,0.12)] rounded-xl shadow-2xl w-full max-w-lg flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[rgba(0,255,255,0.08)]">
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#dfe1f6]">
              {mode === "create" ? "New Task" : "Edit Task"}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-[#5c6b72] hover:text-[#bbc9cf] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Title */}
          <div>
            <label className={labelCls}>Title <span className="text-red-400">*</span></label>
            <input
              className={inputCls}
              placeholder="Task title…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              className={`${inputCls} resize-none h-20`}
              placeholder="Optional description…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Status</label>
              <div className="relative">
                <select
                  className={`${inputCls} appearance-none pr-8 cursor-pointer`}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#5c6b72] pointer-events-none" />
              </div>
            </div>

            <div>
              <label className={labelCls}>Priority</label>
              <div className="relative">
                <select
                  className={`${inputCls} appearance-none pr-8 cursor-pointer`}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#5c6b72] pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className={labelCls}>Due Date</label>
            <input
              type="date"
              className={inputCls}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          {/* Labels */}
          <div>
            <label className={labelCls}>Labels <span className="text-[#3c4f5a] normal-case font-normal">(comma-separated)</span></label>
            <input
              className={inputCls}
              placeholder="e.g. frontend, bug, v2…"
              value={labelsRaw}
              onChange={(e) => setLabelsRaw(e.target.value)}
            />
            {labelsRaw && (
              <div className="flex flex-wrap gap-1 mt-2">
                {labelsRaw.split(",").map((l) => l.trim()).filter(Boolean).map((l) => (
                  <LabelChip key={l} label={l} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-[rgba(0,255,255,0.08)]">
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#00d2ff]/10 text-[#00d2ff] border border-[#00d2ff]/20 hover:bg-[#00d2ff]/20 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {mode === "create" ? "Create Task" : "Save Changes"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-[#5c6b72] hover:text-[#bbc9cf] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────

function KanbanCard({ task, onEdit, onDelete }: { task: Task; onEdit: () => void; onDelete: () => void }) {
  const overdue = isDue(task.dueDate) && task.status !== "done";
  return (
    <div
      className="bg-[#0f1321] border border-[rgba(0,255,255,0.08)] rounded-xl p-3.5 cursor-pointer hover:border-[rgba(0,255,255,0.2)] hover:shadow-lg hover:shadow-[#00d2ff]/5 transition-all group"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-[#dfe1f6] leading-snug flex-1">{task.title}</p>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-[#5c6b72] hover:text-red-400 transition-all flex-shrink-0"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {task.description && (
        <p className="text-xs text-[#5c6b72] mb-2.5 line-clamp-2">{task.description}</p>
      )}

      <div className="flex items-center flex-wrap gap-1.5 mb-2">
        <PriorityBadge priority={task.priority} size="xs" />
        {task.labels.slice(0, 2).map((l) => <LabelChip key={l} label={l} />)}
        {task.labels.length > 2 && (
          <span className="text-[9px] text-[#5c6b72]">+{task.labels.length - 2}</span>
        )}
      </div>

      <div className="flex items-center gap-2 mt-auto pt-1.5 border-t border-[rgba(0,255,255,0.05)]">
        {task.dueDate && (
          <span className={`flex items-center gap-1 text-[10px] ${overdue ? "text-red-400" : "text-[#5c6b72]"}`}>
            <Calendar className="w-2.5 h-2.5" />
            {formatDate(task.dueDate)}
          </span>
        )}
        <div className="flex-1" />
        {task.assignedTo && (
          <div className="w-5 h-5 rounded-full bg-[#00d2ff]/20 border border-[#00d2ff]/30 flex items-center justify-center">
            <span className="text-[7px] font-bold text-[#00d2ff]">{getInitials(task.assignedTo)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({
  status,
  tasks,
  onEdit,
  onDelete,
}: {
  status: TaskStatus;
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <div className="flex flex-col min-w-0 flex-1">
      {/* Column header */}
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3 ${cfg.bg} border ${cfg.border}`}>
        <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
        <span className={`text-xs font-semibold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
        <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold ${cfg.color} ${cfg.bg} border ${cfg.border}`}>
          {tasks.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2">
        {tasks.length === 0 ? (
          <div className="border-2 border-dashed border-[rgba(0,255,255,0.06)] rounded-xl p-6 text-center">
            <p className="text-xs text-[#3c4f5a]">No tasks here</p>
          </div>
        ) : (
          tasks.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              onEdit={() => onEdit(task)}
              onDelete={() => onDelete(task)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({
  tasks,
  onEdit,
  onDelete,
}: {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  return (
    <div className="bg-[#1b1f2e] border border-[rgba(0,255,255,0.08)] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgba(0,255,255,0.05)] text-[#5c6b72] text-xs">
              <th className="text-left px-4 py-3 font-medium">Title</th>
              <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Status</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Priority</th>
              <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Assignee</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Due Date</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-[#5c6b72] text-sm">
                  No tasks found
                </td>
              </tr>
            ) : (
              tasks.map((task) => {
                const overdue = isDue(task.dueDate) && task.status !== "done";
                return (
                  <tr
                    key={task.id}
                    className="border-b border-[rgba(0,255,255,0.03)] hover:bg-[#262939]/30 cursor-pointer"
                    onClick={() => onEdit(task)}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-[#dfe1f6] font-medium text-sm leading-snug">{task.title}</p>
                        {task.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {task.labels.slice(0, 3).map((l) => <LabelChip key={l} label={l} />)}
                            {task.labels.length > 3 && (
                              <span className="text-[9px] text-[#5c6b72]">+{task.labels.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <PriorityBadge priority={task.priority} />
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {task.assignedTo ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-[#00d2ff]/20 border border-[#00d2ff]/30 flex items-center justify-center flex-shrink-0">
                            <span className="text-[7px] font-bold text-[#00d2ff]">{getInitials(task.assignedTo)}</span>
                          </div>
                          <span className="text-xs text-[#bbc9cf] truncate max-w-[100px]">{task.assignedTo}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-[#3c4f5a]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {task.dueDate ? (
                        <span className={`flex items-center gap-1 text-xs ${overdue ? "text-red-400" : "text-[#5c6b72]"}`}>
                          <Calendar className="w-3 h-3" />
                          {formatDate(task.dueDate)}
                        </span>
                      ) : (
                        <span className="text-xs text-[#3c4f5a]">—</span>
                      )}
                    </td>
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onEdit(task)}
                          className="p-1.5 text-[#5c6b72] hover:text-[#00d2ff] hover:bg-[#262939] rounded transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete(task)}
                          className="p-1.5 text-[#5c6b72] hover:text-red-400 hover:bg-[#262939] rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({
  search,
  onSearch,
  statusFilter,
  onStatusFilter,
  priorityFilter,
  onPriorityFilter,
  viewMode,
  onViewMode,
}: {
  search: string;
  onSearch: (v: string) => void;
  statusFilter: TaskStatus | "all";
  onStatusFilter: (v: TaskStatus | "all") => void;
  priorityFilter: TaskPriority | "all";
  onPriorityFilter: (v: TaskPriority | "all") => void;
  viewMode: "kanban" | "list";
  onViewMode: (v: "kanban" | "list") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-[rgba(0,255,255,0.08)] bg-[#0f1321]">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#5c6b72]" />
        <input
          className="pl-8 pr-3 py-1.5 bg-[#1b1f2e] border border-[rgba(0,255,255,0.08)] rounded-lg text-xs text-[#dfe1f6] placeholder-[#3c4f5a] focus:outline-none focus:border-[#00d2ff]/40 transition-colors w-48"
          placeholder="Search tasks…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      {/* Status pills */}
      <div className="flex items-center gap-1">
        {(["all", ...STATUSES] as (TaskStatus | "all")[]).map((s) => {
          const active = statusFilter === s;
          const label = s === "all" ? "All" : STATUS_CONFIG[s].label;
          return (
            <button
              key={s}
              onClick={() => onStatusFilter(s)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                active
                  ? "bg-[#00d2ff]/15 text-[#00d2ff] border border-[#00d2ff]/30"
                  : "text-[#5c6b72] border border-transparent hover:text-[#bbc9cf] hover:bg-[#1b1f2e]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Priority filter */}
      <div className="relative ml-auto sm:ml-0">
        <Flag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#5c6b72] pointer-events-none" />
        <select
          value={priorityFilter}
          onChange={(e) => onPriorityFilter(e.target.value as TaskPriority | "all")}
          className="pl-7 pr-7 py-1.5 bg-[#1b1f2e] border border-[rgba(0,255,255,0.08)] rounded-lg text-xs text-[#dfe1f6] focus:outline-none focus:border-[#00d2ff]/40 appearance-none cursor-pointer"
        >
          <option value="all">All Priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#5c6b72] pointer-events-none" />
      </div>

      {/* View toggle */}
      <div className="flex items-center bg-[#1b1f2e] border border-[rgba(0,255,255,0.08)] rounded-lg p-0.5 ml-auto">
        <button
          onClick={() => onViewMode("kanban")}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
            viewMode === "kanban"
              ? "bg-[#00d2ff]/15 text-[#00d2ff]"
              : "text-[#5c6b72] hover:text-[#bbc9cf]"
          }`}
        >
          <Columns className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Kanban</span>
        </button>
        <button
          onClick={() => onViewMode("list")}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
            viewMode === "list"
              ? "bg-[#00d2ff]/15 text-[#00d2ff]"
              : "text-[#5c6b72] hover:text-[#bbc9cf]"
          }`}
        >
          <List className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">List</span>
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [modal, setModal] = useState<{ mode: ModalMode; task?: Task } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks?view=mine");
      if (res.ok) {
        const data = await res.json() as { tasks: Task[] };
        setTasks(data.tasks);
      } else {
        toast.error("Failed to load tasks");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async (data: Partial<Task>) => {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const { task } = await res.json() as { task: Task };
      setTasks((prev) => [task, ...prev]);
      toast.success("Task created");
      setModal(null);
    } else {
      toast.error("Failed to create task");
    }
  };

  const handleUpdate = async (data: Partial<Task>) => {
    if (!modal?.task) return;
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: modal.task.id, ...data }),
    });
    if (res.ok) {
      const { task } = await res.json() as { task: Task };
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      toast.success("Task updated");
      setModal(null);
    } else {
      toast.error("Failed to update task");
    }
  };

  const handleDelete = async (task: Task) => {
    if (!confirm(`Delete "${task.title}"?`)) return;
    const res = await fetch(`/api/tasks?id=${task.id}`, { method: "DELETE" });
    if (res.ok) {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      toast.success("Task deleted");
    } else {
      toast.error("Failed to delete task");
    }
  };

  // Filtered + searched tasks
  const filtered = tasks.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !t.title.toLowerCase().includes(q) &&
        !t.description?.toLowerCase().includes(q) &&
        !t.labels.some((l) => l.toLowerCase().includes(q))
      ) {
        return false;
      }
    }
    return true;
  });

  const byStatus = (s: TaskStatus) => filtered.filter((t) => t.status === s);

  return (
    <div className="min-h-screen bg-[#0f1321] text-[#dfe1f6] flex flex-col">
      {/* Modal */}
      {modal && (
        <TaskModal
          mode={modal.mode}
          initial={modal.task}
          onClose={() => setModal(null)}
          onSave={modal.mode === "create" ? handleCreate : handleUpdate}
        />
      )}

      {/* Header */}
      <PageHeader
        eyebrow="Workspace"
        title="Tasks"
        description="Manage and track your team's work items."
        action={
          <button
            onClick={() => setModal({ mode: "create" })}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#00d2ff]/10 text-[#00d2ff] border border-[#00d2ff]/20 hover:bg-[#00d2ff]/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Task
          </button>
        }
      />

      {/* Filter Bar */}
      <FilterBar
        search={search}
        onSearch={setSearch}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        priorityFilter={priorityFilter}
        onPriorityFilter={setPriorityFilter}
        viewMode={viewMode}
        onViewMode={setViewMode}
      />

      {/* Content */}
      <div className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-[#5c6b72]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading tasks…</span>
          </div>
        ) : viewMode === "kanban" ? (
          /* Kanban */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            {STATUSES.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                tasks={byStatus(status)}
                onEdit={(task) => setModal({ mode: "edit", task })}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          /* List */
          <ListView
            tasks={filtered}
            onEdit={(task) => setModal({ mode: "edit", task })}
            onDelete={handleDelete}
          />
        )}
      </div>

      {/* Empty state */}
      {!loading && tasks.length === 0 && (
        <div className="flex flex-col items-center justify-center pb-20 gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#1b1f2e] border border-[rgba(0,255,255,0.08)] flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-[#5c6b72]" />
          </div>
          <div className="text-center">
            <p className="text-[#dfe1f6] font-medium text-sm">No tasks yet</p>
            <p className="text-[#5c6b72] text-xs mt-1">Create your first task to get started</p>
          </div>
          <button
            onClick={() => setModal({ mode: "create" })}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#00d2ff]/10 text-[#00d2ff] border border-[#00d2ff]/20 hover:bg-[#00d2ff]/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Task
          </button>
        </div>
      )}

      {/* Stats bar at bottom */}
      {!loading && tasks.length > 0 && (
        <div className="px-6 py-3 border-t border-[rgba(0,255,255,0.08)] flex flex-wrap items-center gap-4">
          {STATUSES.map((s) => {
            const count = tasks.filter((t) => t.status === s).length;
            const cfg = STATUS_CONFIG[s];
            const Icon = cfg.icon;
            return (
              <div key={s} className="flex items-center gap-1.5">
                <Icon className={`w-3 h-3 ${cfg.color}`} />
                <span className="text-xs text-[#5c6b72]">{cfg.label}</span>
                <span className={`text-xs font-semibold ${cfg.color}`}>{count}</span>
              </div>
            );
          })}
          <div className="ml-auto flex items-center gap-1.5">
            <User className="w-3 h-3 text-[#5c6b72]" />
            <span className="text-xs text-[#5c6b72]">Total: <span className="text-[#dfe1f6] font-medium">{tasks.length}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}
