# RFC-001 Implementation Plan — Dynamic RBAC + Organisation Management

> Companion to `rfc-001-dynamic-rbac-and-org.md`. This is the build order: 9 pull requests, each independently deployable and reversible, sequenced so the app is never broken between merges. The three open questions are resolved (see RFC §12).
>
> **Golden rule (per CLAUDE.md):** every PR ends with `npm run prisma:generate` and `npm run build` at exit 0 before push. Migrations run with `npm run prisma:migrate`.

---

## Locked decisions

- Custom roles are **org-scoped only**.
- Role assignment is **org-wide only** in Phase 1 (`scopeType/scopeId` columns ship nullable, unused).
- A neutral **`MEMBER`** value is added to the `UserRole` enum for custom-role-only users.

---

## Sequencing at a glance

```
PR1  Schema + migration (additive)        ← no behaviour change, safe
PR2  Permission catalog + seed script     ← data only
PR3  Backfill script (users→roles)        ← data only, idempotent
PR4  New can() + requirePermission()       ← new lib, old one untouched
PR5  permissions.ts shim                    ← old signature → new engine
PR6  Cookie carries perms[] + permEpoch    ← login + layout refresh
PR7  Middleware cutover (shadow → enforce) ← the risky one, flagged
PR8  Admin UI (/org tabs)                   ← user-facing
PR9  Migrate call sites, drop old table    ← cleanup
```

Hard dependency chain: PR1 → PR2 → PR3 → PR4 → PR5, then PR6 and PR8 can proceed in parallel, PR7 needs PR6, PR9 is last.

---

## PR1 — Schema & additive migration

**Files:** `prisma/schema.prisma`

- Add models: `Role`, `RolePermission`, `UserRoleAssignment`, `UserPermissionOverride`, `Department`, `Team`, `TeamMember` (full definitions in RFC §4).
- Add `MEMBER` to `enum UserRole` (place after `INTERNSHIP`; enum additions are non-breaking).
- Add `permEpoch Int @default(0)` to `User` and `Organization`.
- Add back-relations on `User` and `Organization`.
- **Do not** touch or drop the existing `Permission` model yet — the new per-role permission entity is a *separate* model (`RolePermission` links `Role`↔a renamed catalog). To avoid a name clash: name the catalog model `Permission` only after the old one is dropped in PR9. **For PR1–PR8 name the catalog model `PermissionDef`** and rename it to `Permission` in PR9. (This sidesteps a Prisma model-name collision.)

**Verify:** `prisma:migrate` produces a purely additive migration (no `DROP`/`ALTER TYPE ... DROP`). `prisma:generate` + `build` green.

**Rollback:** drop the new tables; nothing read them yet.

---

## PR2 — Permission catalog + seed

**Files:** `src/lib/rbac/catalog.ts` (new), `prisma/seed-rbac.ts` (new), `package.json` (add `seed:rbac` script).

- `catalog.ts` exports `PERMISSION_CATALOG` (RFC §5) and the `PermissionKey` union type.
- `seed-rbac.ts`:
  1. Upsert every catalog entry into `PermissionDef`.
  2. Create 16 system `Role` rows (`isSystem: true`, `organizationId: null`) with `key` = lowercased enum value.
  3. Attach permissions to each system role by translating **both** `ROLE_DEFAULTS` (`src/lib/permissions.ts`) **and** the `pathAccess` arrays (`src/lib/auth.ts`) into permission keys.
- **Deliverable for review:** a `docs/rbac-role-mapping.md` table showing, per system role, exactly which permission keys it gets and which old rule each came from. This table is the thing to scrutinise in review — it defines everyone's access.

**Verify:** run seed against a scratch DB; assert 16 roles + full catalog exist; spot-check that e.g. `DEVELOPER` has `drive.upload` but not `admin.manage`.

**Rollback:** delete seeded rows (idempotent seed makes re-runs safe).

---

## PR3 — Backfill existing data

**Files:** `prisma/backfill-rbac.ts` (new).

- For each `User`: create a `UserRoleAssignment` to the system role matching `User.role`. Idempotent (`@@unique([userId, roleId, scopeType, scopeId])`).
- Migrate each old `Permission` row → `UserPermissionOverride` (`granted` copied through).
- Seed `Department` rows from distinct non-null `User.department` strings (best-effort; managers left null).
- Seed `Team` + `TeamMember` from `DEFAULT_TEAMS` and current role→team resolution.

**Verify:** counts match — `UserRoleAssignment` count ≥ user count; every old `Permission` has a corresponding override. Run twice, confirm no duplicates.

**Rollback:** truncate the three populated tables; source data untouched.

---

## PR4 — New permission engine

**Files:** `src/lib/rbac/can.ts` (new). Old `src/lib/permissions.ts` untouched this PR.

- `can(userId, permission: PermissionKey): Promise<boolean>` — resolution order: system super-role (`ADMIN`, `CEO`) bypass → `UserPermissionOverride` (deny wins) → union of assigned roles' permissions.
- `requirePermission(permission): Promise<SessionUser>` — throws a 403 helper for route handlers.
- `getEffectivePermissions(userId): Promise<PermissionKey[]>` — used by PR6 to fill the cookie.
- Request-scoped memoisation (React `cache()`), so a handler checking several permissions makes one DB round-trip.

**Verify:** unit truth-table test (RFC §11) — super-role, override-deny, role-union, unknown-key→false.

**Rollback:** delete the file; nothing imports it yet.

---

## PR5 — Compatibility shim

**Files:** `src/lib/permissions.ts` (rewrite body, keep exports).

- Re-implement the old `can(userId, role, resource, action)` as a thin wrapper that maps to `` `${resource}.${action}` `` and delegates to `src/lib/rbac/can.ts`. Keep `seedDefaultPermissions` as a no-op stub (roles now carry defaults).
- Existing call sites keep compiling and now read from the new engine.

**Verify:** grep every importer of `permissions.ts` still builds; run the seed-parity test (below) in report-only mode.

**Rollback:** revert file to git HEAD.

---

## PR6 — Cookie carries permissions

**Files:** `src/lib/auth.ts` (`SessionUser` type + parse), login route, portal layout (`src/app/(portal)/layout.tsx`).

- `SessionUser` gains `perms: string[]` and `permEpoch: number`.
- Login route calls `getEffectivePermissions()` and embeds `perms` + `permEpoch` (from `User.permEpoch`) into the signed cookie.
- Portal layout (server component, can reach Prisma) compares cookie `permEpoch` to DB; if stale, silently re-issues the cookie. This is the near-real-time revocation path.
- Add a helper to bump `permEpoch` for affected users — called later by PR8 mutations.

**Verify:** cookie size < 4 KB for the widest role; epoch-refresh integration test (change a role's perms → next request refreshes cookie).

**Rollback:** revert; middleware still uses role-based `canAccessPath` until PR7.

---

## PR7 — Middleware cutover (the risky one)

**Files:** `src/middleware.ts`, `src/lib/auth.ts` (route→permission map).

- Replace `pathAccess` role arrays with a `routePermission` map: longest-prefix route → required `PermissionKey`.
- Middleware checks the required permission against cookie `perms[]`.
- **Shadow mode first:** ship behind `RBAC_ENFORCE` env flag. When off, keep enforcing the old role logic but *log* any case where new and old decisions differ. Run in production for a few days; the log should be empty. Only then flip `RBAC_ENFORCE=true`.
- **Gate:** the seed-parity test must pass — for all 16 system roles, new decision == old decision on every route in `pathAccess`. This is the go/no-go.

**Verify:** seed-parity test green; shadow-mode diff log empty; E2E — custom role with only `drive.upload` can upload, can't reach `/admin`.

**Rollback:** set `RBAC_ENFORCE=false` — instant revert to role gating, no redeploy.

---

## PR8 — Admin UI

**Files:** `src/app/(portal)/org/*`, `src/app/api/admin/rbac/*`, `src/app/api/org/*`.

- Build the API surface (RFC §8) — RBAC role/permission/assignment endpoints and org department/team/domain/analytics endpoints. Every mutation writes an `AuditLog` row and bumps `permEpoch`.
- Fold existing `/api/admin/roles` into `/api/admin/rbac/roles` (alias old path for one release).
- Extend `/org` into tabs (RFC §9): Overview, Departments, Teams, Roles & Permissions, Domains, Policies. Light design system only.
- Migrate `/teams` page off static `DEFAULT_TEAMS` to the `Team`/`TeamMember` tables.

**Verify:** create custom role → assign → confirm access changes within one request (epoch refresh); audit rows written; `build` green.

**Rollback:** revert routes/pages; data model and gating unaffected.

---

## PR9 — Cleanup

**Files:** `prisma/schema.prisma`, `src/lib/permissions.ts` (delete), all remaining shim importers.

- Migrate every remaining call site from the shim to `rbac/can.ts` directly.
- Drop the old per-user `Permission` model; rename `PermissionDef` → `Permission` (now free).
- Delete `src/lib/permissions.ts` and `ROLE_DEFAULTS`.
- Remove the `pathAccess` array and `RBAC_ENFORCE` flag (enforcement is now the only path).
- Update `CLAUDE.md`: document the RBAC model, the enum-as-seed-identity decision, and the Edge-cookie permission mechanism.

**Verify:** no imports of the deleted file; full `build` green; seed-parity test retired or converted to a permanent regression test.

**Rollback:** this PR is the point of no return — merge only after PR7 has been enforcing cleanly in production for a week.

---

## Test assets to build alongside

| Test | Introduced in | Purpose |
|---|---|---|
| `can()` truth table (unit) | PR4 | Engine correctness. |
| Seed-parity (integration) | PR5 | New decision == old decision for all 16 roles × all routes. **Gates PR7.** |
| Cookie size + epoch refresh | PR6 | No cookie bloat; revocation works. |
| Custom-role E2E | PR8 | End-to-end grant/deny of a single permission. |

---

## Effort estimate

| PR | Rough size |
|---|---|
| PR1 schema | 0.5 day |
| PR2 catalog + seed + mapping table | 1.5 days (the mapping review is the real cost) |
| PR3 backfill | 1 day |
| PR4 engine | 1 day |
| PR5 shim | 0.5 day |
| PR6 cookie | 1.5 days |
| PR7 middleware + shadow mode | 2 days + soak time |
| PR8 admin UI | 4–5 days |
| PR9 cleanup | 1 day |

~3–4 focused weeks including the production soak between PR7 shadow and enforce.

---

## Suggested starting point

PR1 is pure additive schema and carries near-zero risk — it's the natural first commit and unblocks everything else. When you're ready to build, say the word and I'll start there: write the schema changes, generate the migration, and confirm `prisma:generate` + a scoped type-check before you run the full `npm run build` locally.
