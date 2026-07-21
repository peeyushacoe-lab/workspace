/**
 * One-off migration: Redis-backed /api/tasks prototype -> Postgres (RFC-002).
 *
 * Scans `tasks:*` Redis hashes (one hash per creating user), creates a
 * personal TaskList for each owner found, and inserts a Task row per entry.
 * `assignedTo` was a free-text string in the old model — this tries to
 * resolve it against User.fullName / User.email (case-insensitive, trimmed);
 * unmatched names are left unassigned and logged for manual follow-up.
 *
 * Safe to re-run: uses the old Redis task id as a stable Task.id so a second
 * run just upserts instead of duplicating.
 *
 * Old Redis keys are NOT deleted here. Run `scripts/cleanup-old-task-keys.ts`
 * (create when ready) after a soak period once the new UI is confirmed good.
 *
 * Usage: npx tsx scripts/migrate-tasks-redis-to-pg.ts
 */
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { redis } from "../src/lib/redis";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type OldTaskStatus = "todo" | "in_progress" | "done";
type OldTaskPriority = "low" | "medium" | "high" | "urgent";

type OldTask = {
  id: string;
  title: string;
  description?: string;
  status: OldTaskStatus;
  priority: OldTaskPriority;
  assignedTo?: string;
  dueDate?: string;
  createdBy: string;
  createdAt: string;
  labels: string[];
};

const STATUS_MAP: Record<OldTaskStatus, "TODO" | "IN_PROGRESS" | "DONE"> = {
  todo: "TODO",
  in_progress: "IN_PROGRESS",
  done: "DONE",
};

const PRIORITY_MAP: Record<OldTaskPriority, "LOW" | "MEDIUM" | "HIGH" | "URGENT"> = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  urgent: "URGENT",
};

async function main() {
  console.log("--- Migrating tasks: Redis -> Postgres ---");

  const allUsers = await prisma.user.findMany({ select: { id: true, fullName: true, email: true } });
  const byNameOrEmail = new Map<string, string>(); // lowercased name/email -> userId
  for (const u of allUsers) {
    byNameOrEmail.set(u.fullName.trim().toLowerCase(), u.id);
    byNameOrEmail.set(u.email.trim().toLowerCase(), u.id);
  }

  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, found] = await redis.scan(cursor, "MATCH", "tasks:*", "COUNT", 200);
    cursor = next;
    keys.push(...found);
  } while (cursor !== "0");

  console.log(`Found ${keys.length} Redis task hash(es).`);

  let migrated = 0;
  let unmatched = 0;
  const unmatchedNames = new Set<string>();

  for (const key of keys) {
    const ownerId = key.replace(/^tasks:/, "");
    const owner = allUsers.find((u) => u.id === ownerId);
    if (!owner) {
      console.warn(`  Skipping ${key}: owner user ${ownerId} no longer exists`);
      continue;
    }

    const entries = await redis.hgetall(key);
    const tasks = Object.values(entries)
      .map((v) => {
        try {
          return JSON.parse(v) as OldTask;
        } catch {
          return null;
        }
      })
      .filter((t): t is OldTask => t !== null);

    if (tasks.length === 0) continue;

    const list = await prisma.taskList.upsert({
      where: { id: `migrated-${ownerId}` },
      update: {},
      create: {
        id: `migrated-${ownerId}`,
        name: "My Tasks",
        ownerId,
        isTeamList: false,
      },
    });

    for (const t of tasks) {
      let assigneeId: string | null = null;
      if (t.assignedTo) {
        const resolved = byNameOrEmail.get(t.assignedTo.trim().toLowerCase());
        if (resolved) {
          assigneeId = resolved;
        } else {
          unmatched++;
          unmatchedNames.add(t.assignedTo);
        }
      }

      await prisma.task.upsert({
        where: { id: t.id },
        update: {},
        create: {
          id: t.id,
          listId: list.id,
          title: t.title,
          description: t.description ?? null,
          status: STATUS_MAP[t.status] ?? "TODO",
          priority: PRIORITY_MAP[t.priority] ?? "MEDIUM",
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
          createdById: t.createdBy || ownerId,
          labels: t.labels ?? [],
          createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
          assignees: assigneeId
            ? { create: [{ userId: assigneeId }] }
            : undefined,
        },
      });
      migrated++;
    }
  }

  console.log(`\nMigrated ${migrated} task(s).`);
  if (unmatched > 0) {
    console.log(`${unmatched} assignment(s) could not be resolved to a user and were left unassigned:`);
    for (const n of unmatchedNames) console.log(`  - "${n}"`);
  }
  console.log("\nDone. Old Redis keys were left in place — clean up manually once verified.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
    redis.disconnect();
  });
