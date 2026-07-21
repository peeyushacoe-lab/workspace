# RFC-002 — Tasks & Work Management

## Current state (audited 2026-07-21)

`/tasks` (`src/app/(portal)/tasks/page.tsx`) + `/api/tasks` (`src/app/api/tasks/route.ts`) already provide:

- Redis-backed CRUD (`tasks:{userId}` hash per user, scanned cross-user for `view=all`)
- Kanban (todo / in_progress / done) and list views
- Priority (low/medium/high/urgent), due date, free-text labels, free-text `assignedTo` string
- Search + status/priority filters, per-status counts

Real completion is closer to **30%**, not the 10% in the original gap analysis. What's missing is everything that makes it a *work management* system rather than a personal Redis-backed to-do list:

- No real user assignment (`assignedTo` is a free string — no `User` relation, no notification on assign)
- No comments or attachments on a task
- No recurring tasks
- No calendar integration (due dates don't appear on `/calendar`)
- No chat integration (can't turn a message into a task)
- No AI integration (meeting action items don't create tasks — see gap analysis item "Tasks inside Meetings")
- No team/project grouping — every task is a flat list under one Redis key
- Storage is Redis, not Postgres — no audit trail, no relations, harder to query ("all overdue tasks assigned to me across teams"), inconsistent with every other entity in the app (`AuditLog`, RBAC, etc. all assume Postgres)
- **Bug**: the page still uses dark-theme hex values (`#12151D`, `#00C2FF`, etc.) — this predates the June 2026 light-theme redesign and was missed. Needs migrating to the light palette regardless of scope here.

## Proposal

### 1. Migrate storage: Redis → Postgres

New Prisma models:

```prisma
model TaskList {
  id             String   @id @default(cuid())
  name           String
  ownerId        String
  organizationId String?
  isTeamList     Boolean  @default(false)
  createdAt      DateTime @default(now())
  tasks          Task[]
  owner          User     @relation(fields: [ownerId], references: [id])
}

model Task {
  id            String       @id @default(cuid())
  listId        String?
  list          TaskList?    @relation(fields: [listId], references: [id])
  title         String
  description   String?
  status        TaskStatus   @default(TODO)
  priority      TaskPriority @default(MEDIUM)
  dueDate       DateTime?
  createdById   String
  createdBy     User         @relation("TaskCreator", fields: [createdById], references: [id])
  assignees     TaskAssignee[]
  labels        String[]
  recurrence    String?      // RRULE string, null = one-off
  parentTaskId  String?      // subtasks
  sourceType    String?      // "meeting" | "chat" | "email" | null
  sourceId      String?      // id of the Meeting/ChatMessage/InboxThread that spawned it
  comments      TaskComment[]
  attachments   TaskAttachment[]
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
}

model TaskAssignee {
  taskId String
  userId String
  task   Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  user   User @relation(fields: [userId], references: [id])
  @@id([taskId, userId])
}

model TaskComment {
  id        String   @id @default(cuid())
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  authorId  String
  author    User     @relation(fields: [authorId], references: [id])
  body      String
  createdAt DateTime @default(now())
}

model TaskAttachment {
  id        String   @id @default(cuid())
  taskId    String
  task      Task     @relation(fields: [taskId], references: [id], onDelete: Cascade)
  fileName  String
  storageKey String  // R2 key, same pattern as DriveFile
  size      Int
  uploadedById String
  createdAt DateTime @default(now())
}

enum TaskStatus { TODO IN_PROGRESS DONE }
enum TaskPriority { LOW MEDIUM HIGH URGENT }
```

Migration path: write a one-off script (`scripts/migrate-tasks-redis-to-pg.ts`) that scans `tasks:*` Redis hashes, creates a personal `TaskList` per existing owner, and inserts `Task` rows with `assignees` resolved by matching `assignedTo` string against `User.name`/`email` (falling back to leaving unassigned + logging unmatched names for manual fixup). Old Redis keys kept for 30 days as a safety net, then a cleanup script removes them.

### 2. API surface (`/api/tasks/*`)

- `GET /api/tasks` — list with filters (`listId`, `assigneeId`, `status`, `priority`, `dueBefore`, `search`), replacing the Redis scan
- `POST /api/tasks` — create; real `assigneeIds: string[]`, fires `Notification` + push to each assignee
- `PATCH /api/tasks/[id]`, `DELETE /api/tasks/[id]`
- `POST /api/tasks/[id]/comments`
- `POST /api/tasks/[id]/attachments` (reuses R2 upload pattern from Drive)
- `GET /api/tasks/lists`, `POST /api/tasks/lists` — personal vs team lists
- Recurrence handled by a new `task-recurrence.worker.ts` BullMQ job (daily) that clones completed recurring tasks per their RRULE, following the existing 10-queue pattern

### 3. Integration points

- **Calendar**: tasks with a `dueDate` appear on `/calendar` as a lightweight event type (read-only chip, click-through to the task)
- **Chat**: message hover menu gets "Create task from this message" → prefills title/description, sets `sourceType: "chat"`
- **AI meeting intelligence**: when `/ai/meeting-intelligence` extracts an action item with an owner, add a "Create task" button next to it that posts to `/api/tasks` with `sourceType: "meeting"`
- **Notifications**: assignment, due-soon (24h before, via a scheduled check in `cleanup.worker.ts`), and comment-mention all use the existing `Notification` model + push pipeline

### 4. UI scope

- Rebuild `/tasks` on the light palette (per CLAUDE.md design system — this also fixes the pre-existing dark-theme bug)
- Add a list/team switcher (My Tasks / Team Lists / All)
- Task detail drawer (replacing the modal) with comments + attachments tabs
- Real assignee picker (searches `User`, shows avatar) instead of free text

### Out of scope for this pass (defer to later roadmap items)

- Full Gantt/roadmap view
- Cross-task dependencies
- Time tracking

### Rollout

Same activation pattern as RBAC: `npm run prisma:migrate && npm run prisma:generate` locally (user-run, per project convention), then `npm run migrate:tasks-redis-to-pg`, then deploy. No feature flag needed — old Redis data is additive-migrated, not destructive, until the 30-day cleanup.
