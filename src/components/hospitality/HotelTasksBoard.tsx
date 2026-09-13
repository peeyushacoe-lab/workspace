"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, ListChecks, Trash2, Play, CircleCheck, RotateCcw, BellRing } from "lucide-react";
import { iconSize } from "@/components/icons";
import { HOTEL_DEPARTMENTS, labelOf } from "@/lib/hospitality/catalog";
import {
  HospPage, Modal, Field, EmptyState, LoadingRows, api, readQuery, relTime,
  inputCls, primaryBtn, outlineBtn, ghostBtn, chipCls,
} from "./ui";
import { useHotelTeam } from "./useHotelTeam";

type Status = "TODO" | "IN_PROGRESS" | "DONE";
type Task = {
  id: string; title: string; description: string | null; status: Status;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; dueDate: string | null; createdAt: string;
  fromAlert: boolean; department: string | null; roomNumber: string | null;
  createdByName: string; assignees: { id: string; fullName: string }[];
};

const PRIORITY_CHIP: Record<Task["priority"], string> = {
  URGENT: "bg-crit-soft text-crit border-crit/25",
  HIGH: "bg-warn-soft text-warn border-warn/25",
  MEDIUM: "bg-accent-soft text-accent-strong border-accent/25",
  LOW: "bg-hover text-muted border-border",
};

const COLUMNS: { status: Status; title: string }[] = [
  { status: "TODO", title: "To do" },
  { status: "IN_PROGRESS", title: "In progress" },
  { status: "DONE", title: "Done" },
];

export function HotelTasksBoard() {
  const team = useHotelTeam();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [dept, setDept] = useState("all");
  const [mine, setMine] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ tasks: Task[] }>("/api/hospitality/tasks");
      setTasks(d.tasks);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load tasks.");
      setTasks([]);
    }
  }, []);

  useEffect(() => {
    load();
    if (readQuery("new")) setCreating(true);
  }, [load]);

  const visible = useMemo(
    () =>
      (tasks ?? []).filter(
        (t) => (dept === "all" || t.department === dept) && (!mine || t.assignees.some((a) => a.id === team?.meId)),
      ),
    [tasks, dept, mine, team?.meId],
  );

  const patch = async (task: Task, body: Record<string, unknown>, message: string) => {
    try {
      await api(`/api/hospitality/tasks/${task.id}`, { method: "PATCH", json: body });
      toast.success(message);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the task.");
    }
  };

  const remove = async (task: Task) => {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    try {
      await api(`/api/hospitality/tasks/${task.id}`, { method: "DELETE" });
      toast.success("Task deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete the task.");
    }
  };

  const members = (team?.members ?? []).filter((m) => m.isActive);

  return (
    <HospPage
      title="Tasks"
      description="Work across departments — maintenance jobs, guest requests, follow-ups."
      action={
        <button onClick={() => setCreating(true)} className={primaryBtn}>
          <Plus className={iconSize("sm")} /> New task
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="all">All departments</option>
          {HOTEL_DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
        <button
          onClick={() => setMine((v) => !v)}
          aria-pressed={mine}
          className={`${outlineBtn} ${mine ? "border-accent/40 bg-accent-soft text-accent-strong" : ""}`}
        >
          Assigned to me
        </button>
      </div>

      <div className="mt-4">
        {tasks === null ? (
          <LoadingRows />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="No tasks yet"
            body="Raise a task for a broken fitting, a guest request or anything that needs following up."
            action={<button onClick={() => setCreating(true)} className={primaryBtn}><Plus className={iconSize("sm")} /> New task</button>}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {COLUMNS.map((col) => {
              const list = visible.filter((t) => t.status === col.status);
              return (
                <section key={col.status} className="flex flex-col rounded-xl border border-border bg-surface-sunken">
                  <div className="flex items-center justify-between px-4 py-3">
                    <h2 className="text-[13.5px] font-semibold tracking-tight text-foreground">{col.title}</h2>
                    <span className="text-[12px] font-semibold tabular-nums text-muted">{list.length}</span>
                  </div>
                  <div className="flex-1 space-y-2 px-3 pb-3">
                    {list.length === 0 && <p className="py-6 text-center text-[12.5px] text-subtle">Nothing here.</p>}
                    {list.map((t) => {
                      const overdue = t.dueDate && t.status !== "DONE" && new Date(t.dueDate) < new Date();
                      return (
                        <article key={t.id} className="rounded-lg border border-border bg-surface p-3 shadow-sm">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`${chipCls} ${PRIORITY_CHIP[t.priority]}`}>{t.priority.toLowerCase()}</span>
                            {t.department && <span className={`${chipCls} border-border bg-surface-sunken text-muted`}>{labelOf(HOTEL_DEPARTMENTS, t.department)}</span>}
                            {t.roomNumber && <span className={`${chipCls} border-border bg-surface-sunken text-muted`}>Room {t.roomNumber}</span>}
                            {t.fromAlert && <BellRing className={`${iconSize("xs")} text-warn`} aria-label="Created from an alert" />}
                          </div>
                          <p className={`mt-2 text-[13px] font-medium ${t.status === "DONE" ? "text-muted line-through" : "text-foreground"}`}>{t.title}</p>
                          {t.description && <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{t.description}</p>}
                          <div className="mt-2.5 flex items-center gap-2">
                            <select
                              aria-label={`Assignee for ${t.title}`}
                              value={t.assignees[0]?.id ?? ""}
                              onChange={(e) => {
                                const name = members.find((m) => m.id === e.target.value)?.fullName;
                                patch(t, { assigneeId: e.target.value || null }, name ? `Assigned to ${name}` : "Unassigned");
                              }}
                              className={`${inputCls} flex-1 py-1 text-[12px]`}
                            >
                              <option value="">Unassigned</option>
                              {members.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
                            </select>
                            {t.status === "TODO" && (
                              <button onClick={() => patch(t, { status: "IN_PROGRESS" }, "Started")} className={ghostBtn} title="Start" aria-label={`Start ${t.title}`}>
                                <Play className={iconSize("sm")} />
                              </button>
                            )}
                            {t.status !== "DONE" ? (
                              <button onClick={() => patch(t, { status: "DONE" }, "Completed")} className={`${ghostBtn} hover:text-ok`} title="Complete" aria-label={`Complete ${t.title}`}>
                                <CircleCheck className={iconSize("sm")} />
                              </button>
                            ) : (
                              <button onClick={() => patch(t, { status: "TODO" }, "Reopened")} className={ghostBtn} title="Reopen" aria-label={`Reopen ${t.title}`}>
                                <RotateCcw className={iconSize("sm")} />
                              </button>
                            )}
                            <button onClick={() => remove(t)} className={`${ghostBtn} hover:text-crit`} title="Delete" aria-label={`Delete ${t.title}`}>
                              <Trash2 className={iconSize("sm")} />
                            </button>
                          </div>
                          <p className={`mt-2 text-[11px] ${overdue ? "font-medium text-crit" : "text-subtle"}`}>
                            {t.dueDate ? `Due ${new Date(t.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : `Raised ${relTime(t.createdAt)}`}
                            {` · by ${t.createdByName}`}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {creating && (
        <NewTaskModal
          members={members}
          onClose={() => setCreating(false)}
          onCreated={async () => { setCreating(false); await load(); }}
        />
      )}
    </HospPage>
  );
}

function NewTaskModal({
  members, onClose, onCreated,
}: {
  members: { id: string; fullName: string }[]; onClose: () => void; onCreated: () => Promise<void>;
}) {
  const [form, setForm] = useState({ title: "", description: "", department: "", roomNumber: "", priority: "MEDIUM", dueDate: "", assigneeId: "" });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/hospitality/tasks", { method: "POST", json: form });
      toast.success("Task created");
      await onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the task.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="New task"
      footer={
        <>
          <button onClick={onClose} className={outlineBtn}>Cancel</button>
          <button form="task-form" type="submit" disabled={saving} className={primaryBtn}>{saving ? "Creating…" : "Create task"}</button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="What needs doing?" htmlFor="task-title">
            <input id="task-title" value={form.title} onChange={set("title")} placeholder="e.g. Replace shower head in 214" className={inputCls} required />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Details (optional)" htmlFor="task-desc">
            <textarea id="task-desc" rows={3} value={form.description} onChange={set("description")} className={inputCls} />
          </Field>
        </div>
        <Field label="Department" htmlFor="task-dept">
          <select id="task-dept" value={form.department} onChange={set("department")} className={inputCls}>
            <option value="">No department</option>
            {HOTEL_DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </Field>
        <Field label="Room (optional)" htmlFor="task-room">
          <input id="task-room" value={form.roomNumber} onChange={set("roomNumber")} className={inputCls} />
        </Field>
        <Field label="Priority" htmlFor="task-priority">
          <select id="task-priority" value={form.priority} onChange={set("priority")} className={inputCls}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </Field>
        <Field label="Due (optional)" htmlFor="task-due">
          <input id="task-due" type="date" value={form.dueDate} onChange={set("dueDate")} className={inputCls} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Assign to" htmlFor="task-assignee">
            <select id="task-assignee" value={form.assigneeId} onChange={set("assigneeId")} className={inputCls}>
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
            </select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}
