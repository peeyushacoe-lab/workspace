import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { redis } from "@/lib/redis";

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type Task = {
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

function taskKey(userId: string) {
  return `tasks:${userId}`;
}

// GET /api/tasks?view=mine|all&status=todo|in_progress|done
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") ?? "mine";
  const statusFilter = searchParams.get("status") ?? null;

  let rawEntries: Record<string, string> = {};

  if (view === "all") {
    // Scan all task hashes in Redis
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [next, found] = await redis.scan(cursor, "MATCH", "tasks:*", "COUNT", 200);
      cursor = next;
      keys.push(...found);
    } while (cursor !== "0");

    for (const key of keys) {
      const entries = await redis.hgetall(key);
      Object.assign(rawEntries, entries);
    }
  } else {
    rawEntries = await redis.hgetall(taskKey(user.id)) ?? {};
  }

  let tasks: Task[] = Object.values(rawEntries)
    .map((v) => {
      try { return JSON.parse(v) as Task; } catch { return null; }
    })
    .filter((t): t is Task => t !== null);

  if (statusFilter) {
    tasks = tasks.filter((t) => t.status === statusFilter);
  }

  // Sort newest first
  tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({ tasks });
}

// POST /api/tasks — create
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Partial<Task>;

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const task: Task = {
    id: crypto.randomUUID(),
    title: body.title.trim(),
    description: body.description ?? undefined,
    status: (body.status as TaskStatus) ?? "todo",
    priority: (body.priority as TaskPriority) ?? "medium",
    assignedTo: body.assignedTo ?? undefined,
    dueDate: body.dueDate ?? undefined,
    createdBy: user.id,
    createdAt: new Date().toISOString(),
    labels: Array.isArray(body.labels) ? body.labels : [],
  };

  await redis.hset(taskKey(user.id), task.id, JSON.stringify(task));

  return NextResponse.json({ task }, { status: 201 });
}

// PATCH /api/tasks — update
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Partial<Task> & { id: string };

  if (!body.id) {
    return NextResponse.json({ error: "Task id is required" }, { status: 400 });
  }

  // Find which user's hash contains this task id
  // Try the current user's hash first (fast path), then scan all (admin / assigned)
  let ownerKey: string | null = null;
  let existingRaw = await redis.hget(taskKey(user.id), body.id);

  if (existingRaw) {
    ownerKey = taskKey(user.id);
  } else {
    // scan all
    let cursor = "0";
    outer: do {
      const [next, found] = await redis.scan(cursor, "MATCH", "tasks:*", "COUNT", 200);
      cursor = next;
      for (const key of found) {
        const raw = await redis.hget(key, body.id);
        if (raw) {
          existingRaw = raw;
          ownerKey = key;
          break outer;
        }
      }
    } while (cursor !== "0");
  }

  if (!existingRaw || !ownerKey) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const existing = JSON.parse(existingRaw) as Task;
  const updated: Task = {
    ...existing,
    ...(body.title !== undefined && { title: body.title.trim() }),
    ...(body.description !== undefined && { description: body.description }),
    ...(body.status !== undefined && { status: body.status as TaskStatus }),
    ...(body.priority !== undefined && { priority: body.priority as TaskPriority }),
    ...(body.assignedTo !== undefined && { assignedTo: body.assignedTo }),
    ...(body.dueDate !== undefined && { dueDate: body.dueDate }),
    ...(body.labels !== undefined && { labels: body.labels }),
  };

  await redis.hset(ownerKey, updated.id, JSON.stringify(updated));

  return NextResponse.json({ task: updated });
}

// DELETE /api/tasks?id=taskId
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Task id is required" }, { status: 400 });

  // Try current user's hash first
  const exists = await redis.hexists(taskKey(user.id), id);
  if (exists) {
    await redis.hdel(taskKey(user.id), id);
    return NextResponse.json({ ok: true });
  }

  // Scan all hashes (task may belong to another user but admin can delete)
  let cursor = "0";
  do {
    const [next, found] = await redis.scan(cursor, "MATCH", "tasks:*", "COUNT", 200);
    cursor = next;
    for (const key of found) {
      const raw = await redis.hget(key, id);
      if (raw) {
        await redis.hdel(key, id);
        return NextResponse.json({ ok: true });
      }
    }
  } while (cursor !== "0");

  return NextResponse.json({ error: "Task not found" }, { status: 404 });
}
