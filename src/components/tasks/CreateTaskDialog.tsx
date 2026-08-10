"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { TaskSourceType } from "@/lib/task-source";

/**
 * Quick "create task from here" dialog, shared by mail, chat and docs.
 *
 * The point of this component is that it does NOT navigate. Turning an email into
 * a task by being sent to /tasks and losing the email is the context switch the
 * whole round-trip effort exists to remove — so this opens over whatever the user
 * is looking at, takes one confirm, and hands them back.
 *
 * It always records `sourceType`/`sourceId`, which is what lets the task show a
 * backlink to this email/message/document later. Those two columns already
 * existed and were written by exactly one screen; every entry point now feeds
 * them, so provenance is the rule rather than an accident.
 */

type Member = { id: string; fullName: string; email: string };
type TaskList = { id: string; name: string };

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
type Priority = (typeof PRIORITIES)[number];

const INPUT_CLASS =
  "w-full px-3 py-2 bg-surface-sunken border border-border rounded-lg " +
  "text-sm text-foreground placeholder:text-subtle " +
  "focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors";

const LABEL_CLASS = "block text-xs font-medium text-muted mb-1.5";

export function CreateTaskDialog({
  open,
  onClose,
  sourceType,
  sourceId,
  /** Prefills the title — the email subject, message text, or document name. */
  defaultTitle,
  /** Optional prefilled description, e.g. a quoted snippet. */
  defaultDescription,
  /** Human name of the source, shown so the user can see what they're linking. */
  sourceTitle,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  sourceType: TaskSourceType;
  sourceId: string;
  defaultTitle?: string;
  defaultDescription?: string;
  sourceTitle?: string;
  onCreated?: (taskId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [listId, setListId] = useState("");
  const [saving, setSaving] = useState(false);

  const [members, setMembers] = useState<Member[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);

  // Reset on each open rather than on mount: the dialog instance is kept alive by
  // its parent, so without this the second email you triage would open holding the
  // first one's title.
  useEffect(() => {
    if (!open) return;
    // Titles are truncated because an email subject is usually a fine task title
    // but a chat message can be a paragraph — and the user can edit it anyway.
    setTitle((defaultTitle ?? "").trim().slice(0, 160));
    setDescription(defaultDescription ?? "");
    setPriority("MEDIUM");
    setDueDate("");
    setAssigneeId("");
    setListId("");
    setSaving(false);
  }, [open, defaultTitle, defaultDescription]);

  // Fetched only while open, so a dialog mounted on every inbox row doesn't cost
  // two requests per row.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      const [memberRes, listRes] = await Promise.allSettled([
        fetch("/api/workspace/members"),
        fetch("/api/tasks/lists"),
      ]);

      // Note the shape difference: /api/workspace/members returns a bare array,
      // /api/tasks/lists returns { lists }. Easy to get wrong, silent when you do.
      if (!cancelled && memberRes.status === "fulfilled" && memberRes.value.ok) {
        setMembers((await memberRes.value.json()) as Member[]);
      }
      if (!cancelled && listRes.status === "fulfilled" && listRes.value.ok) {
        const body = (await listRes.value.json()) as { lists?: TaskList[] };
        setLists(body.lists ?? []);
      }
    })();

    return () => { cancelled = true; };
  }, [open]);

  const submit = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Give the task a title");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmed,
          description: description.trim() || undefined,
          priority,
          // <input type="date"> gives YYYY-MM-DD; the API does `new Date(...)`,
          // which reads that as UTC midnight — correct for a date-only deadline.
          dueDate: dueDate || undefined,
          assigneeIds: assigneeId ? [assigneeId] : undefined,
          listId: listId || undefined,
          sourceType,
          sourceId,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to create task");
      }

      // 201 with { task }, not the task at the top level.
      const body = (await res.json()) as { task?: { id: string } };
      toast.success("Task created");
      if (body.task?.id) onCreated?.(body.task.id);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSaving(false);
    }
  }, [title, description, priority, dueDate, assigneeId, listId, sourceType, sourceId, onCreated, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create task"
      description={sourceTitle ? `Linked to: ${sourceTitle}` : undefined}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 text-[13px] font-medium rounded-md text-muted hover:text-foreground hover:bg-hover transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !title.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Create task
          </button>
        </div>
      }
    >
      {/* Enter submits from any single-line field; the textarea keeps Enter for newlines. */}
      <form
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="task-title" className={LABEL_CLASS}>Title</label>
          <input
            id="task-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label htmlFor="task-description" className={LABEL_CLASS}>
            Notes <span className="text-subtle font-normal">(optional)</span>
          </label>
          <textarea
            id="task-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Any detail worth keeping with the task"
            className={`${INPUT_CLASS} resize-y`}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="task-priority" className={LABEL_CLASS}>Priority</label>
            <select
              id="task-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className={INPUT_CLASS}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="task-due" className={LABEL_CLASS}>Due</label>
            <input
              id="task-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="task-assignee" className={LABEL_CLASS}>Assign to</label>
            <select
              id="task-assignee"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className={INPUT_CLASS}
            >
              {/* Unassigned is valid: the task still belongs to its creator. */}
              <option value="">Nobody yet</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.fullName}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="task-list" className={LABEL_CLASS}>List</label>
            <select
              id="task-list"
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">No list</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Submit lives in the modal footer; this keeps Enter working in the form. */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
