# RFC-001 — Dynamic RBAC + Organisation Management (Phase 1)

> **Status:** Draft for review
> **Author:** Nexus platform
> **Date:** 2026-07-15
> **Scope:** Phase 1 of the platform hardening roadmap — replace hardcoded role logic with a dynamic, data-driven permission system, and build the organisation management layer on top of it.
> **Target:** Do not start coding until this is approved. Estimated effort: 3–4 focused weeks.

---

## 1. Why this RFC exists

The roadmap asks for a hierarchy of `Organisation → Departments → Teams → Roles → Permissions` so that enterprise customers can model their own structure instead of inheriting Cybersage's 16 hardcoded roles.

Before designing anything new, this RFC documents **what already exists** in the codebase, because the honest finding is: about 40% of the primitives are already there but disconnected. The main work is *unifying and wiring*, not greenfield building. Designing as if from scratch would create a second parallel system and make things worse.

---

## 2. Current state (audited, not assumed)

### 2.1 What exists today

| Piece | Location | State |
|---|---|---|
| `UserRole` enum (16 roles) | `prisma/schema.prisma:40` | Hardcoded. `User.role` defaults to `ADMIN`. |
| Static path gating | `src/lib/auth.ts` — `pathAccess[]`, `canAccessPath()` | Route → allowed-roles array. Longest-prefix match, default-deny. |
| Static nav | `src/lib/auth.ts` — `portalNavItems[]` | Nav item → allowed-roles array. |
| Edge middleware | `src/middleware.ts` | Verifies HMAC cookie, calls `canAccessPath()`. **Runs in Edge runtime — no Prisma access.** |
| Per-user permissions | `Permission` model (`schema.prisma:1423`) + `src/lib/permissions.ts` `can()` | `(userId, resource, action, granted)`. Explicit rows override a hardcoded `ROLE_DEFAULTS` map. `SUPER_ROLES = {ADMIN, CEO}` bypass everything. |
| Custom roles | `CustomRole` model (`schema.prisma:196`) + `/api/admin/roles` | Has `name/description/isSingleton/color` only. **No permissions attached. Not linked to any user.** Effectively dead. |
| `User.customRole` (String?) | `schema.prisma:73` | Free-text, largely unused. |
| Organisation | `Organization` model (`schema.prisma:1380`) | `name/slug/domain/plan/maxUsers/settings(JSON)`. Users FK to it. |
| Org roles | `User.orgRole` (String) | Free string: `OWNER/ADMIN/MEMBER/GUEST`. Not enforced anywhere meaningful. |
| Org invites | `OrganizationInvite` model | Exists, functional. |
| Teams | `DEFAULT_TEAMS[]` in `src/app/api/teams/route.ts` | **Static array, no DB model.** Membership resolved dynamically from `User.role`. 11 fixed teams. |
| Departments | `User.department` (String?) | Free-text label only. No model, no hierarchy. |

### 2.2 The core problems

1. **Three overlapping-but-disconnected permission mechanisms** (`pathAccess` role arrays, the `Permission` table, the `ROLE_DEFAULTS` map). A change to access has to be made in up to three places, and they can disagree.
2. **`CustomRole` is a shell** — you can create a role but it grants nothing and no user can hold it.
3. **Permissions are attached to *users*, not *roles*.** That is backwards for RBAC — onboarding a user means replaying a defaults map instead of assigning a role.
4. **Teams and departments are not real entities** — they can't own resources, have managers, or carry policy.
5. **The Edge-middleware constraint is the hidden hard part.** `middleware.ts` cannot query the database. All dynamic permission data must either be embedded in the signed cookie or checked in a layer that *can* reach Prisma (server components / route handlers). Any RBAC design that ignores this will break the gate.

---

## 3. Goals & non-goals

### Goals
- One permission model: `Role → Permissions`, `User → Role(s)`, checked through a single `can()` function.
- A fixed **permission catalog** (`email.read`, `drive.delete`, `hr.manage`, …) that is the single source of truth.
- Real `Department` and `Team` entities under `Organisation`, with managers and membership.
- Admin org-management surface: create org, manage users/departments/teams, assign managers, configure policies, manage domains, view analytics.
- **Zero-downtime migration** — the 16 existing `UserRole`s keep working throughout; they become seeded system roles, not a parallel system.

### Non-goals (explicitly deferred)
- Per-record ACLs beyond what Drive already has (`DrivePermission`). Resource-level sharing stays as-is.
- Attribute-based (ABAC) or policy-language rules. Catalog-based RBAC only.
- SSO/SCIM role mapping (Phase 6+), though the model will leave room for it.
- Removing the `UserRole` enum. It stays as a stable seed identity; see §7.

---

## 4. Proposed data model

New/changed Prisma models. All FKs are org-scoped so a role in one org can never leak to another.

```prisma
// ─── RBAC core ───────────────────────────────────────────────

model Role {
  id             String   @id @default(cuid())
  organizationId String?              // null = global/system role template
  key            String               // stable slug, e.g. "developer", "ciso"
  name           String               // display name
  description    String?
  color          String?
  isSystem       Boolean  @default(false)  // seeded, cannot be deleted
  isSingleton    Boolean  @default(false)  // only one holder (CEO, CISO…)
  rank           Int      @default(100)    // for "can't manage a higher role" checks
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization   Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  permissions    RolePermission[]
  assignments    UserRoleAssignment[]

  @@unique([organizationId, key])
  @@index([organizationId])
}

model Permission {                     // REPLACES the current per-user Permission model
  id          String   @id @default(cuid())
  key         String   @unique         // "email.read", "drive.delete", "hr.manage"
  resource    String                   // "email", "drive", "hr"
  action      String                   // "read", "delete", "manage"
  label       String                   // human label for the admin UI
  description String?
  category    String                   // grouping in the UI: "Workspace", "Security", "Admin"
  isDangerous Boolean  @default(false) // require extra confirmation to grant
}

model RolePermission {
  roleId       String
  permissionId String
  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([roleId, permissionId])
  @@index([permissionId])
}

model UserRoleAssignment {
  id        String   @id @default(cuid())
  userId    String
  roleId    String
  scopeType String?  // null = org-wide; "department" | "team" for scoped roles (future)
  scopeId   String?
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  role      Role     @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([userId, roleId, scopeType, scopeId])
  @@index([userId])
  @@index([roleId])
}

// Optional per-user override on top of roles (keeps the one feature the old
// Permission table had: grant/deny a single capability to one person).
model UserPermissionOverride {
  id           String   @id @default(cuid())
  userId       String
  permissionId String
  granted      Boolean            // true = extra grant, false = explicit deny
  grantedBy    String?
  reason       String?
  createdAt    DateTime @default(now())

  @@unique([userId, permissionId])
  @@index([userId])
}

// ─── Org hierarchy ──────────────────────────────────────────

model Department {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  slug           String
  managerId      String?          // a User who heads the department
  parentId       String?          // optional nesting (Security > SOC)
  createdAt      DateTime @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  parent         Department?  @relation("DeptTree", fields: [parentId], references: [id])
  children       Department[] @relation("DeptTree")
  teams          Team[]

  @@unique([organizationId, slug])
  @@index([organizationId])
}

model Team {
  id             String   @id @default(cuid())
  organizationId String
  departmentId   String?
  name           String
  slug           String
  icon           String?
  color          String?
  managerId      String?
  isSystem       Boolean  @default(false)  // seeded from DEFAULT_TEAMS
  createdAt      DateTime @default(now())

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  department     Department?  @relation(fields: [departmentId], references: [id], onDelete: SetNull)
  members        TeamMember[]

  @@unique([organizationId, slug])
  @@index([organizationId])
}

model TeamMember {
  teamId   String
  userId   String
  isLead   Boolean  @default(false)
  joinedAt DateTime @default(now())
  team     Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user     User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([teamId, userId])
  @@index([userId])
}
```

**Changes to existing models**
- `User`: add `roleAssignments UserRoleAssignment[]`, `teamMemberships TeamMember[]`, `permissionOverrides UserPermissionOverride[]`, and a `permEpoch Int @default(0)` (cookie-invalidation counter, see §6).
- `Organization`: add `roles Role[]`, `departments Department[]`, `teams Team[]`, and `permEpoch Int @default(0)`.
- Keep `User.role` (`UserRole` enum) as-is — it becomes the *seed identity* that maps to a system `Role.key`. See §7 for why we don't drop it.
- The **old** `Permission` model (per-user `userId/resource/action`) is renamed conceptually — its data migrates into `UserPermissionOverride`, then the old table is dropped in a later migration once nothing reads it.

---

## 5. Permission catalog

A hardcoded TypeScript array (`src/lib/rbac/catalog.ts`) that is the source of truth, seeded into the `Permission` table on deploy. Keeping it in code means the app never has a permission key that isn't defined, and TypeScript can offer a `PermissionKey` union type for compile-time safety.

```ts
export const PERMISSION_CATALOG = [
  // Workspace
  { key: "email.read",    resource: "email", action: "read",   category: "Workspace" },
  { key: "email.send",    resource: "email", action: "send",   category: "Workspace" },
  { key: "email.delete",  resource: "email", action: "delete", category: "Workspace", isDangerous: true },
  { key: "chat.create",   resource: "chat",  action: "create", category: "Workspace" },
  { key: "drive.upload",  resource: "drive", action: "upload", category: "Workspace" },
  { key: "drive.delete",  resource: "drive", action: "delete", category: "Workspace", isDangerous: true },
  { key: "docs.edit",     resource: "docs",  action: "edit",   category: "Workspace" },
  { key: "meet.host",     resource: "meet",  action: "host",   category: "Workspace" },
  // Security
  { key: "sentinel.view", resource: "sentinel", action: "view",   category: "Security" },
  { key: "soc.manage",    resource: "soc",      action: "manage", category: "Security", isDangerous: true },
  { key: "dlp.manage",    resource: "dlp",      action: "manage", category: "Security", isDangerous: true },
  // People / HR
  { key: "hr.manage",     resource: "hr",    action: "manage", category: "People", isDangerous: true },
  // Admin
  { key: "admin.manage",  resource: "admin", action: "manage", category: "Admin", isDangerous: true },
  { key: "org.manage",    resource: "org",   action: "manage", category: "Admin", isDangerous: true },
  { key: "rbac.manage",   resource: "rbac",  action: "manage", category: "Admin", isDangerous: true },
  // …extend as features are gated
] as const;

export type PermissionKey = typeof PERMISSION_CATALOG[number]["key"];
```

Every page and API route is annotated with the *one* permission key it requires (see §8). This replaces the `pathAccess` role arrays.

---

## 6. Enforcement architecture (the hard part)

There are three enforcement points and the Edge-runtime constraint governs all of them.

### 6.1 The constraint
`middleware.ts` runs in the Edge runtime and **cannot call Prisma**. Today it only needs `role` (embedded in the cookie) plus a static map. A dynamic system must get the user's *effective permissions* to the Edge without a DB call.

### 6.2 Recommended design — embed a compact permission set in the signed cookie

At login (and on any role/permission change), compute the user's effective permission keys and store them in the existing HMAC-signed `cybersage_user` cookie, alongside a `permEpoch`:

```jsonc
{
  "id": "...", "email": "...", "fullName": "...",
  "role": "DEVELOPER",              // kept for back-compat + display
  "perms": ["email.read","email.send","chat.create","drive.upload","docs.edit"],
  "permEpoch": 7                    // copied from User.permEpoch at issue time
}
```

- **Middleware** verifies the cookie (already does), then checks the route's required permission against `perms[]`. No DB call. Longest-prefix route→permission map replaces `pathAccess`.
- **Cookie size:** ~15–40 keys × ~15 chars ≈ under 1 KB signed; well within the 4 KB cookie limit. If it ever grows, switch `perms` to a bitmask index into the catalog (catalog order is stable) — noted as the scale fallback, not needed at launch.

### 6.3 Invalidation — the `permEpoch` counter
When an admin changes a role's permissions or a user's role, bump `User.permEpoch` for every affected user (and `Organization.permEpoch` for org-wide role edits). On the next request, a lightweight server check (in the portal layout, which *can* reach Prisma) compares the cookie's `permEpoch` to the DB value; if stale, it silently re-issues the cookie with fresh perms. This gives near-real-time revocation without forcing re-login and without a DB hit in middleware.

### 6.4 Fine-grained checks stay server-side
Middleware only does **coarse page gating**. Inside route handlers and server components, keep calling a rewritten `can()`:

```ts
// src/lib/rbac/can.ts  — replaces src/lib/permissions.ts
export async function can(userId: string, permission: PermissionKey): Promise<boolean>
export async function requirePermission(permission: PermissionKey): Promise<SessionUser> // throws 403
```

`can()` resolves: system super-role bypass → `UserPermissionOverride` (deny wins) → any assigned `Role`'s permissions. Result cached per-request (React `cache()` / a request-scoped memo) so a handler checking several permissions hits the DB once.

### 6.5 Migration shim
`src/lib/permissions.ts` currently exports `can(userId, role, resource, action)`. Keep that signature as a thin deprecated wrapper that maps `(resource, action) → "${resource}.${action}"` and calls the new `can()`, so existing call sites keep compiling while they're migrated one by one. Delete the shim at the end of the phase.

---

## 7. Why keep the `UserRole` enum

Dropping the enum would touch ~every file that imports `UserRole` (auth, teams, middleware, mobile, dozens of routes) and require a giant, risky migration. Instead:

- Seed 16 **system `Role` rows** whose `key` matches the enum values (`ADMIN`, `CEO`, … lowercased slug).
- `User.role` (enum) stays as a *default/primary* role identity and a fast display value.
- On user creation, create a `UserRoleAssignment` to the matching system role in addition to setting `User.role`.
- New customer-defined roles are org-scoped `Role` rows with `isSystem = false` and no enum equivalent — a user holding only a custom role keeps `User.role = MEMBER`-equivalent (add a neutral `MEMBER` enum value, or reuse the lowest-privilege existing role) while their real access comes from assignments.

This lets the two systems coexist during migration and indefinitely for the built-in roles, which is the safe path.

---

## 8. API surface

All under existing admin gating; every route also declares its required permission.

### RBAC
```
GET    /api/admin/rbac/permissions          # the seeded catalog (grouped by category)
GET    /api/admin/rbac/roles                 # list roles (system + org custom)   [rbac.manage]
POST   /api/admin/rbac/roles                 # create custom role                  [rbac.manage]
PATCH  /api/admin/rbac/roles/:id             # rename / recolor                    [rbac.manage]
DELETE /api/admin/rbac/roles/:id             # delete (blocked if isSystem)        [rbac.manage]
PUT    /api/admin/rbac/roles/:id/permissions # set the role's permission keys      [rbac.manage]
POST   /api/admin/rbac/users/:id/roles       # assign role(s) to a user            [rbac.manage]
DELETE /api/admin/rbac/users/:id/roles/:rid  # unassign                            [rbac.manage]
PUT    /api/admin/rbac/users/:id/overrides   # per-user grant/deny overrides       [rbac.manage]
```
The existing `/api/admin/roles` route is folded into `/api/admin/rbac/roles` (redirect/alias for one release).

### Organisation
```
GET    /api/org                              # current org profile + settings      [org.manage]
PATCH  /api/org                              # name, logo, brandColor, plan, policy [org.manage]
GET    /api/org/analytics                    # headcount, dept/team/role breakdown  [org.manage]
GET/POST/PATCH/DELETE /api/org/departments   # department CRUD + assign manager     [org.manage]
GET/POST/PATCH/DELETE /api/org/teams         # team CRUD + assign manager           [org.manage]
POST   /api/org/teams/:id/members            # add/remove members                   [org.manage]
GET/POST/DELETE /api/org/domains             # verified domains for the org         [org.manage]
```

Each mutation writes an `AuditLog` row (`RBAC_ROLE_UPDATED`, `ORG_DEPARTMENT_CREATED`, …) and bumps the relevant `permEpoch`.

---

## 9. Admin UI

Extend `/org` (already ADMIN-gated) into a tabbed console — reuse the tabbed pattern already used in `/admin/hr`:

- **Overview** — headcount, department/team/role counts, plan & seat usage (`Organization.maxUsers`).
- **Departments** — tree view, create/edit, assign manager.
- **Teams** — list, create/edit, assign manager & department, manage members. Migrates the current `/teams` page from static defs to these records.
- **Roles & Permissions** — role list; a role editor showing the catalog grouped by category with checkboxes; dangerous permissions flagged. Assign roles to users from the user detail drawer.
- **Domains** — verified domain management (feeds SSO/mail routing later).
- **Policies** — org-level toggles stored in `Organization.settings` JSON (password policy, session length, allowed email domains) — schema-light, no migration. **No MFA controls** — MFA enforcement was intentionally removed app-wide (see `src/middleware.ts`) and this phase does not reintroduce it.

All screens follow the light design system (`bg-white`, `#1a56db` accent, `PageHeader`), no dark panels.

---

## 10. Migration & backfill plan

Ordered, each step independently deployable and reversible.

1. **Add new models** (`Role`, `RolePermission`, `UserRoleAssignment`, `UserPermissionOverride`, `Department`, `Team`, `TeamMember`, `permEpoch` fields). Additive migration — no data touched. Ship.
2. **Seed script** (`prisma/seed-rbac.ts`): insert the permission catalog; create 16 system `Role`s from `UserRole`; attach permissions to each system role by translating the current `ROLE_DEFAULTS` map + `pathAccess` arrays into permission keys (this is the one careful translation — review the mapping table in a PR).
3. **Backfill**: for every existing user, create a `UserRoleAssignment` to their `User.role` system role; migrate existing `Permission` rows → `UserPermissionOverride`. Seed `Department`/`Team` records from `User.department` strings and `DEFAULT_TEAMS`.
4. **Rewrite `can()`** in `src/lib/rbac/can.ts`; make `src/lib/permissions.ts` a shim (§6.5).
5. **Cookie change**: login route computes and embeds `perms[]` + `permEpoch`; portal layout does the stale-epoch refresh. `SessionUser` type gains `perms`, `permEpoch`.
6. **Middleware**: replace `canAccessPath()` role logic with `perms[]` + route→permission map. Keep the old map behind a feature flag for one release to compare decisions in logs (shadow mode).
7. **Migrate call sites** off the shim, route by route, each verified.
8. **Build the admin UI** (§9).
9. **Drop** the old `Permission` model and the shim once nothing references them.

**Rollback:** steps 1–3 are additive and safe. Step 6 is the risky one — the shadow-mode flag lets us revert middleware to role-based gating instantly if the permission map is wrong.

---

## 11. Verification / test strategy

- **Unit**: `can()` truth table — super-role bypass, override-deny-wins, role union, unknown permission → false.
- **Seed-parity test**: assert that for all 16 system roles, the *new* permission decision for every current `pathAccess` route equals the *old* role decision. This is the safety net that proves the migration didn't silently change anyone's access. Must pass before step 6.
- **Cookie**: size check (<4 KB) with a user holding the widest role; epoch-refresh integration test.
- **E2E**: create a custom role, grant `drive.upload` only, assign to a test user, confirm they can upload but not delete and can't see `/admin`.
- **Build gate**: `npm run build` exit 0 (per CLAUDE.md), `prisma:migrate` + `prisma:generate` run before build.

---

## 12. Risks & open questions

| Risk | Mitigation |
|---|---|
| Migration changes someone's effective access silently | Seed-parity test (§11) gates the cutover; shadow-mode middleware flag. |
| Cookie bloat for users with many roles | Perms stay well under 4 KB at launch; bitmask fallback documented. |
| Edge middleware can't see instant permission changes | `permEpoch` refresh in the DB-capable layout layer gives near-real-time revocation. |
| Two role systems (enum + `Role` table) confuse future devs | Documented in §7 + CLAUDE.md update; enum explicitly framed as seed identity. |
| `CustomRole` model already exists and is referenced | Fold `/api/admin/roles` into new API; migrate or drop `CustomRole` in step 9. |

**Resolved decisions (2026-07-15):**
1. **Custom roles are org-scoped only** at launch. No global/cloneable templates — the `Role.organizationId` nullable column stays for system-role seeds only. Removes cross-org leak surface.
2. **Org-wide role assignment only** in Phase 1. Scoped assignments (a "Developer" role within one team) are deferred; `scopeType/scopeId` ship as nullable columns now so the feature needs no future migration, only UI.
3. **A neutral `MEMBER` value is added to the `UserRole` enum.** Custom-role-only users hold `User.role = MEMBER`; their real access comes from `UserRoleAssignment`. `MEMBER` grants nothing by itself.

---

## 13. What this unlocks for later phases

- **Phase 3 (Notifications)**: per-channel preferences can gate on permissions (e.g. only users with `soc.manage` get mandatory security alerts).
- **Phase 6 (Enterprise readiness)**: audit log already captures every RBAC change; SSO/SCIM can map external groups → `Role`s via the same assignment table.
- **Org analytics** (roadmap's org-management screen) falls out of the `Department`/`Team`/assignment tables directly.
