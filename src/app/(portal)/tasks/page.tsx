"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, X, Search, Columns, List, Calendar,
  Flag, User, Tag, ChevronDown, Loader2, Trash2,
  CheckCircle2, Circle, Timer, MessageSquare, Paperclip,
  Repeat, Users as UsersIcon, Send, Download,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/Shell";

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

type UserLite = { id: string; fullName: string; avatarUrl?: string | null; email?: string };

type TaskComment = { id: string; body: string; createdAt: string; author: UserLite };
type TaskAttachment = { id: string; fileName: string; size: number; createdAt: string; uploadedBy: UserLite };

type Task = {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  labels: string[];
  recurrence?: string | null;
  listId?: string | null;
  createdBy: UserLite;
  assignees: { user: UserLite }[];
  comments?: TaskComment[];
  attachments?: TaskAttachment[];
  _count?: { comments: number; attachments: number; subTasks: number };
};

type TaskList = { id: string; name: string; isTeamList: boolean; _count?: { tasks: number } };

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  TODO:        { label: "To Do",       color: "text-[#5A6275]",   bg: "bg-[#5d6579]/10",   border: "border-[#5d6579]/30",   icon: Circle },
  IN_PROGRESS: { label: "In Progress", color: "text-[#00C2FF]",   bg: "bg-[#00C2FF]/10",   border: "border-[#00C2FF]/30",   icon: Timer },
  DONE:        { label: "Done",        color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/30", icon: CheckCircle2 },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bg: string; border: string; dot: string }> = {
  LOW:    { label: "Low",    color: "text-[#5A6275]",  bg: "bg-[#5d6579]/10", border: "border-[#5d6579]/30", dot: "bg-[#5d6579]" },
  MEDIUM: { label: "Medium", color: "text-[#00C2FF]",  bg: "bg-[#00C2FF]/10", border: "border-[#00C2FF]/30", dot: "bg-[#00C2FF]" },
  HIGH:   { label: "High",   color: "text-amber-400",  bg: "bg-amber-400/10", border: "border-amber-400/30", dot: "bg-amber-400" },
  URGENT: { label: "Urgent", color: "text-red-400",    bg: "bg-red-400/10",   border: "border-red-400/30",   dot: "bg-red-400" },
};

const STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];
const PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isDue(iso?: string | null) {
  if (!iso) return false;
  return new Date(iso) < new Date();
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function PriorityBadge({ priority, size = "sm" }: { priority: TaskPriority; size?: "xs" | "sm" }) {
  const cfg = PRIORITY_CONFIG[priority];
  const textSize = size === "xs" ? "text-[9px]" : "text-[10px]";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-semibold ${textSize} ${cfg.color} ${cfg.bg} border ${cfg.border}`}>
      <span className={`w-1 h-1 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color} ${cfg.bg} border ${cfg.border}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

function LabelChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-[#1B1F2A] text-[#8A92A6] border border-[#262A35]">
      <Tag className="w-2 h-2 text-[#5A6275]" />
      {label}
    </span>
  );
}

function AssigneeAvatars({ assignees, max = 3 }: { assignees: { user: UserLite }[]; max?: number }) {
  if (assignees.length === 0) return null;
  const shown = assignees.slice(0, max);
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map(({ user }) => (
        <div
          key={user.id}
          title={user.fullName}
          className="w-5 h-5 rounded-full bg-[#00C2FF]/20 border border-[#12151D] flex items-center justify-center"
        >
          <span className="text-[7px] font-semibold text-[#00C2FF]">{getInitials(user.fullName)}</span>
        </div>
      ))}
      {assignees.length > max && (
        <div className="w-5 h-5 rounded-full bg-[#1B1F2A] border border-[#12151D] flex items-center justify-center">
          <span className="text-[7px] font-semibold text-[#8A92A6]">+{assignees.length - max}</span>
        </div>
      )}
    </div>
  );
}

// ─── Assignee Picker ──────────────────────────────────────────────────────────

function AssigneePicker({
  people,
  selected,
  onChange,
}: {
  people: UserLite[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = people.filter((p) => p.fullName.toLowerCase().includes(q.toLowerCase()));
  const selectedPeople = people.filter((p) => selected.includes(p.id));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#12151D] border border-[#262A35] rounded-lg text-sm text-[#E6E9F0] hover:border-[#2E333F] transition-colors"
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          {selectedPeople.length === 0 ? (
            <span className="text-[#454e63]">Unassigned</span>
          ) : (
            selectedPeople.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-[#00C2FF]/10 text-[#00C2FF] border border-[#00C2FF]/20">
                {p.fullName}
              </span>
            ))
          )}
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-[#5A6275] flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-[#12151D] border border-[#262A35] rounded-lg shadow-2xl max-h-64 overflow-y-auto">
          <div className="p-2 sticky top-0 bg-[#12151D] border-b border-[#262A35]">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people…"
              className="w-full px-2 py-1.5 bg-[#1B1F2A] border border-[#262A35] rounded text-xs text-[#E6E9F0] placeholder-[#454e63] focus:outline-none"
            />
          </div>
          {filtered.map((p) => {
            const isSel = selected.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange(isSel ? selected.filter((id) => id !== p.id) : [...selected, p.id])}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#1B1F2A] text-left transition-colors"
              >
                <div className="w-5 h-5 rounded-full bg-[#00C2FF]/20 border border-[#00C2FF]/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-[7px] font-semibold text-[#00C2FF]">{getInitials(p.fullName)}</span>
                </div>
                <span className="text-xs text-[#E6E9F0] flex-1">{p.fullName}</span>
                {isSel && <CheckCircle2 className="w-3.5 h-3.5 text-[#00C2FF]" />}
              </button>
            );
          })}
          {filtered.length === 0 && <p className="px-3 py-3 text-xs text-[#5A6275]">No matches</p>}
        </div>
      )}
    </div>
  );
}

// ─── Task Detail Drawer ───────────────────────────────────────────────────────

type DrawerTab = "details" | "comments" | "attachments";

function TaskDrawer({
  task,
  people,
  onClose,
  onSave,
  onDelete,
  onRefresh,
}: {
  task: Task | null; // null = create mode
  people: UserLite[];
  onClose: () => void;
  onSave: (id: string | null, data: Partial<Task> & { assigneeIds?: string[] }) => Promise<void>;
  onDelete: (task: Task) => void;
  onRefresh: (id: string) => Promise<void>;
}) {
  const isCreate = task === null;
  const [tab, setTab] = useState<DrawerTab>("details");
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "TODO");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "MEDIUM");
  const [dueDate, setDueDate] = useState(task?.dueDate ? task.dueDate.slice(0, 10) : "");
  const [labelsRaw, setLabelsRaw] = useState(task?.labels?.join(", ") ?? "");
  const [recurrence, setRecurrence] = useState(task?.recurrence ?? "");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task?.assignees.map((a) => a.user.id) ?? []);
  const [saving, setSaving] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const labels = labelsRaw.split(",").map((l) => l.trim()).filter(Boolean);
      await onSave(task?.id ?? null, {
        title: title.trim(),
        description: description || undefined,
        status,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        labels,
        recurrence: recurrence.trim() || null,
        assigneeIds,
      });
    } finally {
      setSaving(false);
    }
  };

  const postComment = async () => {
    if (!task || !commentBody.trim()) return;
    setPostingComment(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      if (res.ok) {
        setCommentBody("");
        await onRefresh(task.id);
      } else {
        toast.error("Failed to post comment");
      }
    } finally {
      setPostingComment(false);
    }
  };

  const uploadAttachment = async (file: File) => {
    if (!task) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/tasks/${task.id}/attachments`, { method: "POST", body: fd });
      if (res.ok) {
        await onRefresh(task.id);
        toast.success("Attachment added");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Failed to upload attachment");
      }
    } finally {
      setUploading(false);
    }
  };

  const inputCls = "w-full px-3 py-2 bg-[#12151D] border border-[#262A35] rounded-lg text-sm text-[#E6E9F0] placeholder-[#454e63] focus:outline-none focus:border-[#00C2FF]/50 transition-colors";
  const labelCls = "block text-[10px] font-semibold text-[#5A6275] mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/60" onClick={onClose}>
      <div
        className="bg-[#12151D] border-l border-[#262A35] shadow-2xl w-full max-w-lg flex flex-col h-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#262A35]">
          <p className="flex-1 text-sm font-semibold text-[#E6E9F0]">{isCreate ? "New Task" : "Task Details"}</p>
          {!isCreate && (
            <button onClick={() => task && onDelete(task)} className="p-1 text-[#5A6275] hover:text-red-400 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="p-1 text-[#5A6275] hover:text-[#8A92A6] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        {!isCreate && (
          <div className="flex items-center gap-1 px-5 py-2 border-b border-[#262A35]">
            {([
              { id: "details", label: "Details", icon: null },
              { id: "comments", label: `Comments${task?._count ? ` (${task._count.comments})` : ""}`, icon: MessageSquare },
              { id: "attachments", label: `Files${task?._count ? ` (${task._count.attachments})` : ""}`, icon: Paperclip },
            ] as { id: DrawerTab; label: string; icon: React.ElementType | null }[]).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  tab === t.id ? "bg-[#00C2FF]/15 text-[#00C2FF]" : "text-[#5A6275] hover:text-[#8A92A6]"
                }`}
              >
                {t.icon && <t.icon className="w-3.5 h-3.5" />}
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {(isCreate || tab === "details") && (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Title <span className="text-red-400">*</span></label>
                <input className={inputCls} placeholder="Task title…" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <textarea className={`${inputCls} resize-none h-20`} placeholder="Optional description…" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Status</label>
                  <select className={`${inputCls} appearance-none cursor-pointer`} value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Priority</label>
                  <select className={`${inputCls} appearance-none cursor-pointer`} value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Due Date</label>
                <input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}><UsersIcon className="w-2.5 h-2.5 inline mr-1" />Assignees</label>
                <AssigneePicker people={people} selected={assigneeIds} onChange={setAssigneeIds} />
              </div>
              <div>
                <label className={labelCls}><Repeat className="w-2.5 h-2.5 inline mr-1" />Recurrence <span className="text-[#5A6275] normal-case font-normal">(RRULE, optional)</span></label>
                <input className={inputCls} placeholder="e.g. FREQ=WEEKLY;BYDAY=MO" value={recurrence} onChange={(e) => setRecurrence(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Labels <span className="text-[#5A6275] normal-case font-normal">(comma-separated)</span></label>
                <input className={inputCls} placeholder="e.g. frontend, bug, v2…" value={labelsRaw} onChange={(e) => setLabelsRaw(e.target.value)} />
                {labelsRaw && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {labelsRaw.split(",").map((l) => l.trim()).filter(Boolean).map((l) => <LabelChip key={l} label={l} />)}
                  </div>
                )}
              </div>
            </div>
          )}

          {!isCreate && tab === "comments" && task && (
            <div className="flex flex-col h-full">
              <div className="flex-1 space-y-3 mb-3">
                {(task.comments ?? []).length === 0 ? (
                  <p className="text-xs text-[#5A6275] text-center py-8">No comments yet</p>
                ) : (
                  task.comments!.map((c) => (
                    <div key={c.id} className="flex gap-2">
                      <div className="w-6 h-6 rounded-full bg-[#00C2FF]/20 border border-[#00C2FF]/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[8px] font-semibold text-[#00C2FF]">{getInitials(c.author.fullName)}</span>
                      </div>
                      <div className="flex-1 bg-[#1B1F2A] rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-medium text-[#E6E9F0]">{c.author.fullName}</span>
                          <span className="text-[10px] text-[#5A6275]">{formatDate(c.createdAt)}</span>
                        </div>
                        <p className="text-xs text-[#8A92A6]">{c.body}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center gap-2 sticky bottom-0">
                <input
                  className={inputCls}
                  placeholder="Write a comment…"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void postComment(); }}
                />
                <button
                  onClick={() => void postComment()}
                  disabled={postingComment || !commentBody.trim()}
                  className="p-2 rounded-lg bg-[#00C2FF]/10 text-[#00C2FF] border border-[#00C2FF]/20 hover:bg-[#00C2FF]/20 transition-colors disabled:opacity-50"
                >
                  {postingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {!isCreate && tab === "attachments" && task && (
            <div className="space-y-3">
              <label className="flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-[#262A35] rounded-xl cursor-pointer hover:border-[#2E333F] transition-colors">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin text-[#5A6275]" /> : <Paperclip className="w-4 h-4 text-[#5A6275]" />}
                <span className="text-xs text-[#5A6275]">{uploading ? "Uploading…" : "Click to attach a file"}</span>
                <input type="file" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAttachment(f); e.target.value = ""; }} />
              </label>
              {(task.attachments ?? []).length === 0 ? (
                <p className="text-xs text-[#5A6275] text-center py-4">No attachments yet</p>
              ) : (
                task.attachments!.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 px-3 py-2 bg-[#1B1F2A] rounded-lg">
                    <Paperclip className="w-3.5 h-3.5 text-[#5A6275] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#E6E9F0] truncate">{a.fileName}</p>
                      <p className="text-[10px] text-[#5A6275]">{formatBytes(a.size)} · {a.uploadedBy.fullName}</p>
                    </div>
                    <a href={`/api/tasks/${task.id}/attachments/${a.id}`} target="_blank" rel="noreferrer" className="p-1 text-[#5A6275] hover:text-[#00C2FF] transition-colors">
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer (details tab only) */}
        {(isCreate || tab === "details") && (
          <div className="flex items-center gap-2 px-5 py-3 border-t border-[#262A35]">
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#00C2FF]/10 text-[#00C2FF] border border-[#00C2FF]/20 hover:bg-[#00C2FF]/20 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {isCreate ? "Create Task" : "Save Changes"}
            </button>
            <button onClick={onClose} className="px-4 py-2 text-xs text-[#5A6275] hover:text-[#8A92A6] transition-colors">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Kanban ───────────────────────────────────────────────────────────────────

function KanbanCard({ task, onEdit, onDelete }: { task: Task; onEdit: () => void; onDelete: () => void }) {
  const overdue = isDue(task.dueDate) && task.status !== "DONE";
  return (
    <div className="bg-[#12151D] border border-[#262A35] rounded-xl p-3.5 cursor-pointer hover:border-[#2E333F] hover:shadow-lg hover:shadow-[#00d2ff]/5 transition-all group" onClick={onEdit}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-[#E6E9F0] leading-snug flex-1">{task.title}</p>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="opacity-0 group-hover:opacity-100 p-0.5 text-[#5A6275] hover:text-red-400 transition-all flex-shrink-0">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {task.description && <p className="text-xs text-[#5A6275] mb-2.5 line-clamp-2">{task.description}</p>}
      <div className="flex items-center flex-wrap gap-1.5 mb-2">
        <PriorityBadge priority={task.priority} size="xs" />
        {task.recurrence && <span title={task.recurrence}><Repeat className="w-3 h-3 text-[#5A6275]" /></span>}
        {task.labels.slice(0, 2).map((l) => <LabelChip key={l} label={l} />)}
        {task.labels.length > 2 && <span className="text-[9px] text-[#5A6275]">+{task.labels.length - 2}</span>}
      </div>
      <div className="flex items-center gap-2 mt-auto pt-1.5 border-t border-[#1C1F28]">
        {task.dueDate && (
          <span className={`flex items-center gap-1 text-[10px] ${overdue ? "text-red-400" : "text-[#5A6275]"}`}>
            <Calendar className="w-2.5 h-2.5" />
            {formatDate(task.dueDate)}
          </span>
        )}
        {(task._count?.comments ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-[#5A6275]"><MessageSquare className="w-2.5 h-2.5" />{task._count!.comments}</span>
        )}
        {(task._count?.attachments ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-[#5A6275]"><Paperclip className="w-2.5 h-2.5" />{task._count!.attachments}</span>
        )}
        <div className="flex-1" />
        <AssigneeAvatars assignees={task.assignees} />
      </div>
    </div>
  );
}

function KanbanColumn({ status, tasks, onEdit, onDelete }: { status: TaskStatus; tasks: Task[]; onEdit: (t: Task) => void; onDelete: (t: Task) => void }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <div className="flex flex-col min-w-0 flex-1">
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3 ${cfg.bg} border ${cfg.border}`}>
        <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
        <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
        <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold ${cfg.color} ${cfg.bg} border ${cfg.border}`}>{tasks.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.length === 0 ? (
          <div className="border-2 border-dashed border-[#262A35] rounded-xl p-6 text-center">
            <p className="text-xs text-[#5A6275]">No tasks here</p>
          </div>
        ) : (
          tasks.map((task) => <KanbanCard key={task.id} task={task} onEdit={() => onEdit(task)} onDelete={() => onDelete(task)} />)
        )}
      </div>
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({ tasks, onEdit, onDelete }: { tasks: Task[]; onEdit: (t: Task) => void; onDelete: (t: Task) => void }) {
  return (
    <div className="bg-[#12151D] border border-[#262A35] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1C1F28] text-[#5A6275] text-xs">
              <th className="text-left px-4 py-3 font-medium">Title</th>
              <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Status</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Priority</th>
              <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Assignees</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Due Date</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-[#5A6275] text-sm">No tasks found</td></tr>
            ) : (
              tasks.map((task) => {
                const overdue = isDue(task.dueDate) && task.status !== "DONE";
                return (
                  <tr key={task.id} className="border-b border-[#1C1F28] hover:bg-[#1B1F2A]/30 cursor-pointer" onClick={() => onEdit(task)}>
                    <td className="px-4 py-3">
                      <p className="text-[#E6E9F0] font-medium text-sm leading-snug">{task.title}</p>
                      {task.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {task.labels.slice(0, 3).map((l) => <LabelChip key={l} label={l} />)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell"><StatusBadge status={task.status} /></td>
                    <td className="px-4 py-3 hidden md:table-cell"><PriorityBadge priority={task.priority} /></td>
                    <td className="px-4 py-3 hidden lg:table-cell"><AssigneeAvatars assignees={task.assignees} /></td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {task.dueDate ? (
                        <span className={`flex items-center gap-1 text-xs ${overdue ? "text-red-400" : "text-[#5A6275]"}`}>
                          <Calendar className="w-3 h-3" />{formatDate(task.dueDate)}
                        </span>
                      ) : <span className="text-xs text-[#5A6275]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => onDelete(task)} className="p-1.5 text-[#5A6275] hover:text-red-400 hover:bg-[#1B1F2A] rounded transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [people, setPeople] = useState<UserLite[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [scope, setScope] = useState<"mine" | "assigned" | "all">("mine");
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [drawer, setDrawer] = useState<{ open: boolean; task: Task | null } | null>(null);

  const load = useCallback(async (view: typeof scope) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks?view=${view}`);
      if (res.ok) {
        const data = (await res.json()) as { tasks: Task[] };
        setTasks(data.tasks);
      } else {
        toast.error("Failed to load tasks");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(scope); }, [scope, load]);

  useEffect(() => {
    fetch("/api/people")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { departments: Record<string, UserLite[]> } | null) => {
        if (!data) return;
        setPeople(Object.values(data.departments).flat());
      });
    fetch("/api/tasks/lists")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { lists: TaskList[] } | null) => { if (data) setLists(data.lists); });
  }, []);

  const refreshTask = useCallback(async (id: string) => {
    const res = await fetch(`/api/tasks/${id}`);
    if (!res.ok) return;
    const { task } = (await res.json()) as { task: Task };
    setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    setDrawer((d) => (d && d.task?.id === task.id ? { open: true, task } : d));
  }, []);

  const handleSave = async (id: string | null, data: Partial<Task> & { assigneeIds?: string[] }) => {
    const res = await fetch(id ? `/api/tasks/${id}` : "/api/tasks", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const { task } = (await res.json()) as { task: Task };
      setTasks((prev) => (id ? prev.map((t) => (t.id === task.id ? task : t)) : [task, ...prev]));
      toast.success(id ? "Task updated" : "Task created");
      setDrawer(null);
    } else {
      toast.error(id ? "Failed to update task" : "Failed to create task");
    }
  };

  const handleDelete = async (task: Task) => {
    if (!confirm(`Delete "${task.title}"?`)) return;
    const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    if (res.ok) {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      setDrawer(null);
      toast.success("Task deleted");
    } else {
      toast.error("Failed to delete task");
    }
  };

  const filtered = useMemo(() => tasks.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.title.toLowerCase().includes(q) && !t.description?.toLowerCase().includes(q) && !t.labels.some((l) => l.toLowerCase().includes(q))) {
        return false;
      }
    }
    return true;
  }), [tasks, statusFilter, priorityFilter, search]);

  const byStatus = (s: TaskStatus) => filtered.filter((t) => t.status === s);

  return (
    <div className="min-h-screen bg-[#12151D] text-[#E6E9F0] flex flex-col">
      {drawer?.open && (
        <TaskDrawer
          task={drawer.task}
          people={people}
          onClose={() => setDrawer(null)}
          onSave={handleSave}
          onDelete={handleDelete}
          onRefresh={refreshTask}
        />
      )}

      <PageHeader
        eyebrow="Workspace"
        title="Tasks"
        description="Manage and track your team's work items."
        action={
          <button onClick={() => setDrawer({ open: true, task: null })} className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#00C2FF]/10 text-[#00C2FF] border border-[#00C2FF]/20 hover:bg-[#00C2FF]/20 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            New Task
          </button>
        }
      />

      {/* Scope switcher */}
      <div className="flex items-center gap-1 px-6 pt-3">
        {([
          { id: "mine", label: "My Tasks" },
          { id: "assigned", label: "Assigned to Me" },
          { id: "all", label: `All${lists.some((l) => l.isTeamList) ? " (Team)" : ""}` },
        ] as { id: typeof scope; label: string }[]).map((s) => (
          <button
            key={s.id}
            onClick={() => setScope(s.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              scope === s.id ? "bg-[#00C2FF]/15 text-[#00C2FF] border border-[#00C2FF]/30" : "text-[#5A6275] border border-transparent hover:text-[#8A92A6] hover:bg-[#1B1F2A]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-[#262A35]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#5A6275]" />
          <input
            className="pl-8 pr-3 py-1.5 bg-[#12151D] border border-[#262A35] rounded-lg text-xs text-[#E6E9F0] placeholder-[#454e63] focus:outline-none focus:border-[#00C2FF]/40 transition-colors w-48"
            placeholder="Search tasks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          {(["all", ...STATUSES] as (TaskStatus | "all")[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${
                statusFilter === s ? "bg-[#00C2FF]/15 text-[#00C2FF] border border-[#00C2FF]/30" : "text-[#5A6275] border border-transparent hover:text-[#8A92A6] hover:bg-[#12151D]"
              }`}
            >
              {s === "all" ? "All" : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto sm:ml-0">
          <Flag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#5A6275] pointer-events-none" />
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | "all")}
            className="pl-7 pr-7 py-1.5 bg-[#12151D] border border-[#262A35] rounded-lg text-xs text-[#E6E9F0] focus:outline-none focus:border-[#00C2FF]/40 appearance-none cursor-pointer"
          >
            <option value="all">All Priorities</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>)}
          </select>
        </div>
        <div className="flex items-center bg-[#12151D] border border-[#262A35] rounded-lg p-0.5 ml-auto">
          <button onClick={() => setViewMode("kanban")} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === "kanban" ? "bg-[#00C2FF]/15 text-[#00C2FF]" : "text-[#5A6275] hover:text-[#8A92A6]"}`}>
            <Columns className="w-3.5 h-3.5" /><span className="hidden sm:inline">Kanban</span>
          </button>
          <button onClick={() => setViewMode("list")} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === "list" ? "bg-[#00C2FF]/15 text-[#00C2FF]" : "text-[#5A6275] hover:text-[#8A92A6]"}`}>
            <List className="w-3.5 h-3.5" /><span className="hidden sm:inline">List</span>
          </button>
        </div>
      </div>

      <div className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-[#5A6275]">
            <Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Loading tasks…</span>
          </div>
        ) : viewMode === "kanban" ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            {STATUSES.map((status) => (
              <KanbanColumn key={status} status={status} tasks={byStatus(status)} onEdit={(t) => setDrawer({ open: true, task: t })} onDelete={handleDelete} />
            ))}
          </div>
        ) : (
          <ListView tasks={filtered} onEdit={(t) => setDrawer({ open: true, task: t })} onDelete={handleDelete} />
        )}
      </div>

      {!loading && tasks.length === 0 && (
        <div className="flex flex-col items-center justify-center pb-20 gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#12151D] border border-[#262A35] flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-[#5A6275]" />
          </div>
          <div className="text-center">
            <p className="text-[#E6E9F0] font-medium text-sm">No tasks yet</p>
            <p className="text-[#5A6275] text-xs mt-1">Create your first task to get started</p>
          </div>
          <button onClick={() => setDrawer({ open: true, task: null })} className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#00C2FF]/10 text-[#00C2FF] border border-[#00C2FF]/20 hover:bg-[#00C2FF]/20 transition-colors">
            <Plus className="w-3.5 h-3.5" />Create Task
          </button>
        </div>
      )}

      {!loading && tasks.length > 0 && (
        <div className="px-6 py-3 border-t border-[#262A35] flex flex-wrap items-center gap-4">
          {STATUSES.map((s) => {
            const count = tasks.filter((t) => t.status === s).length;
            const cfg = STATUS_CONFIG[s];
            const Icon = cfg.icon;
            return (
              <div key={s} className="flex items-center gap-1.5">
                <Icon className={`w-3 h-3 ${cfg.color}`} />
                <span className="text-xs text-[#5A6275]">{cfg.label}</span>
                <span className={`text-xs font-mono font-semibold ${cfg.color}`}>{count}</span>
              </div>
            );
          })}
          <div className="ml-auto flex items-center gap-1.5">
            <User className="w-3 h-3 text-[#5A6275]" />
            <span className="text-xs text-[#5A6275]">Total: <span className="text-[#E6E9F0] font-mono font-medium">{tasks.length}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}
