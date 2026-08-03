# Premortem — Nexus / Cybersage Mail

*It's three months from now. Something about this launch went badly wrong. Working backward from that failure, here's what most likely caused it — ranked by likelihood × impact, each grounded in what's actually in the repo today (2026-08-03).*

## 1. Schema/migration drift breaks production on deploy

`prisma/schema.prisma` has 137 models, but `prisma/migrations/` has only 7 folders, and none is dated between `20260626_add_passkey_model` and `20260801_office_suite_versions_tags_recent`. That five-week gap covers two schema-heavy builds: **RBAC** (`Role`, `PermissionDef`, `RolePermission`, `UserRoleAssignment`, `UserPermissionOverride`, `Department`, `Team`, `TeamMember`) and **Tasks** (`TaskList`, `Task`, `TaskAssignee`, `TaskComment`, `TaskAttachment`). Every handoff for both features says "user must run `prisma:migrate` locally" — but there's no migration file to show it happened. If it didn't, production Postgres is missing tables that live code already queries. First hit to `/org`, `/tasks`, or any RBAC-gated route throws a raw DB error instead of a clean 403.

**Do first:** confirm against the actual prod DB (not just schema.prisma) that `Role`, `TaskList`, and their siblings exist as tables. If not, run migrate/generate/seed/backfill before anything else in this document matters.

## 2. No CI — the only build gate is a person remembering to run one command

The single GitHub Actions workflow is `electron-release.yml`. Nothing runs `npm run build`, `tsc`, `eslint`, or the nine `test:*` scripts on push or PR. Every feature landed in the last month was verified by "user runs `npm run build` locally" — a manual, skippable step, on a project where the agent writing the code can't run that command itself (no network to the Prisma engine in the sandbox). The gap between "written" and "confirmed compiling" is entirely one person's memory.

**Do first:** a GitHub Action that runs `prisma generate` + `tsc --noEmit` + `next build` on every push to `main`, even just as a red/green signal — no need for full deploy automation yet.

## 3. Commits land directly on `main`, no PR/review step

`git log` shows the Atrium redesign, RBAC, Tasks, and Office Suite all merged straight to `main`. Combined with #2, a broken build can reach Vercel before anyone looks at it twice.

## 4. Zero real tests protecting the security-critical paths

`npm test` chains custom `tsx` scripts (`office-io`, `formulas`, `goal-seek`, `custom-fn`, `advanced-charts`, `subdomains`, `home-preview`, `a11y`, `cross-app`) — decent smoke coverage for the office suite. But there is no `*.test.ts`/`*.spec.ts` anywhere, and nothing continuously covers `can()`, the `pathAccess`/`routePermission` maps, DLP, or the 355 API routes. In an app that markets itself on cybersecurity, the access-control logic has exactly one verification mechanism — `test:rbac-parity` — and it only runs when someone remembers to type it.

## 5. Uncommitted editor changes are sitting on `main` right now

`git status` currently shows modified `DocsView.tsx`, `SheetsEditor.tsx`, `SlidesEditor.tsx`, plus an untracked `EditorMenuBar.tsx` — live, unbuilt, unreviewed changes to three editors. One careless `git checkout`/`stash`/machine restart away from being lost.

## 6. The `RBAC_ENFORCE` flip is a silent, easy-to-botch switch

Shadow mode logs `[rbac-shadow]` diffs to Vercel — but nothing describes anyone watching those logs on a defined schedule before flipping `RBAC_ENFORCE=true`. Two equally bad outcomes are both plausible: someone flips it on a "looks fine" glance without real observation, or nobody flips it at all and the whole RBAC rebuild sits inert in prod indefinitely while the team believes it's live.

## 7. Feature scope has outrun the verification loop

137 models and 355 API routes for a project that started as an email client. Roughly nine "mega-features" (Tasks, Office Suite, RBAC/Org, and more queued behind them) shipped in under a month, deliberately built one-at-a-time because landing them together would be "unreviewable." That instinct was right — but the release process didn't scale with it. Every feature still funnels through the same single gate: one person, one local `npm run build`, no staging environment mentioned anywhere in CLAUDE.md or memory.

## 8. `.env.example` appears to contain a real credential

The checked-in `DATABASE_URL` example is a fully-formed Neon connection string with what looks like a live username/password, not a placeholder. If this file is or becomes public, that's a credential leak. Worth rotating and replacing with an obvious placeholder regardless of whether it's actually live.

## 9. No staging environment or rollback runbook

Deploys go `main` → Vercel production directly. Workers run as a separate long-lived process, off Vercel — so a schema rollback also has to coordinate worker restarts, not just a `git revert`. Nothing documents what "roll back" actually means here when a bad migration ships.

## 10. Optional env vars degrade silently instead of failing loudly

VAPID keys, Meilisearch, and `JWT_SECRET` are all optional — push notifications, fast search, and mobile auth quietly no-op if unset rather than erroring. "It worked when I tested it" doesn't guarantee those subsystems are actually configured in the environment that matters.

---

### If only three things get fixed before the next real push

1. Verify RBAC/Tasks tables actually exist in the prod DB — this is the one that causes a hard outage, not a degraded feature.
2. Stand up even a minimal CI build check on `main`.
3. Commit or stash the current editor changes so they can't be silently lost.
