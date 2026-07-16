// ─── RBAC Permission Catalog (RFC-001) ────────────────────────────────────────
// Single source of truth for every permission in Nexus. Seeded into the
// `PermissionDef` table by prisma/seed-rbac.ts. Keeping the catalog in code means
// the app can never reference a permission key that isn't defined, and gives us a
// compile-time `PermissionKey` union type.
//
// Convention: key = `${resource}.${action}`. Adding a permission here + seeding is
// all that's needed to make it grantable in the admin UI.

export type PermissionCategory =
  | "Workspace"
  | "People"
  | "Security"
  | "Admin";

export type PermissionEntry = {
  key: string;
  resource: string;
  action: string;
  label: string;
  description: string;
  category: PermissionCategory;
  isDangerous?: boolean;
};

export const PERMISSION_CATALOG = [
  // ── Workspace ──────────────────────────────────────────────────────────────
  { key: "email.read",     resource: "email",    action: "read",   label: "Read email",        description: "View inbox threads and messages.",              category: "Workspace" },
  { key: "email.send",     resource: "email",    action: "send",   label: "Send email",        description: "Compose and send outbound email.",              category: "Workspace" },
  { key: "email.delete",   resource: "email",    action: "delete", label: "Delete email",      description: "Trash threads and permanently delete mail.",    category: "Workspace", isDangerous: true },
  { key: "chat.read",      resource: "chat",     action: "read",   label: "Read chat",         description: "View channels and direct messages.",            category: "Workspace" },
  { key: "chat.create",    resource: "chat",     action: "create", label: "Create channels",   description: "Start channels and send chat messages.",        category: "Workspace" },
  { key: "meet.join",      resource: "meet",     action: "join",   label: "Join meetings",     description: "Join video meetings.",                          category: "Workspace" },
  { key: "meet.host",      resource: "meet",     action: "host",   label: "Host meetings",     description: "Create and host video meetings.",               category: "Workspace" },
  { key: "calendar.read",  resource: "calendar", action: "read",   label: "View calendar",     description: "See events and schedules.",                     category: "Workspace" },
  { key: "calendar.write", resource: "calendar", action: "write",  label: "Manage calendar",   description: "Create and edit calendar events.",              category: "Workspace" },
  { key: "drive.read",     resource: "drive",    action: "read",   label: "View Drive",        description: "Browse and download files.",                    category: "Workspace" },
  { key: "drive.upload",   resource: "drive",    action: "upload", label: "Upload files",      description: "Upload files and create folders.",              category: "Workspace" },
  { key: "drive.delete",   resource: "drive",    action: "delete", label: "Delete files",      description: "Delete files and folders in Drive.",            category: "Workspace", isDangerous: true },
  { key: "drive.share",    resource: "drive",    action: "share",  label: "Share files",       description: "Share Drive files with others.",                category: "Workspace" },
  { key: "docs.read",      resource: "docs",     action: "read",   label: "Read documents",    description: "View docs, notes and whiteboards.",             category: "Workspace" },
  { key: "docs.edit",      resource: "docs",     action: "edit",   label: "Edit documents",    description: "Create and edit docs, notes and whiteboards.",  category: "Workspace" },
  { key: "docs.delete",    resource: "docs",     action: "delete", label: "Delete documents",  description: "Delete docs and notes.",                        category: "Workspace", isDangerous: true },
  { key: "tasks.read",     resource: "tasks",    action: "read",   label: "View tasks",        description: "See the task board.",                           category: "Workspace" },
  { key: "tasks.write",    resource: "tasks",    action: "write",  label: "Manage tasks",      description: "Create, edit and move tasks.",                  category: "Workspace" },
  { key: "teams.read",     resource: "teams",    action: "read",   label: "View team spaces",  description: "Access team spaces and the apps marketplace.",  category: "Workspace" },
  { key: "apps.use",       resource: "apps",     action: "use",    label: "Use apps",          description: "Open the apps marketplace and installed apps.", category: "Workspace" },
  { key: "ai.use",         resource: "ai",       action: "use",    label: "Use AI assistant",  description: "Access AI compose, summarise and chat.",        category: "Workspace" },

  // ── People ─────────────────────────────────────────────────────────────────
  { key: "people.read",    resource: "people",   action: "read",   label: "View directory",    description: "See the team directory and profiles.",          category: "People" },
  { key: "hr.read",        resource: "hr",       action: "read",   label: "View own HR",       description: "Access personal HR: leave, documents, onboarding.", category: "People" },
  { key: "hr.manage",      resource: "hr",       action: "manage", label: "Manage HR",         description: "Manage people, leave approvals and HR records.", category: "People", isDangerous: true },
  { key: "internship.view",resource: "internship",action: "view",  label: "Internship hub",    description: "Access the internship hub and attendance (interns & their mentors).", category: "People" },
  { key: "mentor.manage",  resource: "mentor",   action: "manage", label: "Mentor workspace",  description: "Manage interns, attendance and mentor HR.",      category: "People" },

  // ── Security ───────────────────────────────────────────────────────────────
  { key: "sentinel.view",  resource: "sentinel", action: "view",   label: "View Sentinel",     description: "See security alerts and threat intelligence.",  category: "Security" },
  { key: "sentinel.manage",resource: "sentinel", action: "manage", label: "Manage Sentinel",   description: "Edit detection rules and resolve alerts.",       category: "Security", isDangerous: true },
  { key: "soc.view",       resource: "soc",      action: "view",   label: "View SOC",          description: "See the SOC incident tracker.",                 category: "Security" },
  { key: "soc.manage",     resource: "soc",      action: "manage", label: "Manage SOC",        description: "Create and resolve security incidents.",         category: "Security", isDangerous: true },
  { key: "dlp.manage",     resource: "dlp",      action: "manage", label: "Manage DLP",        description: "Configure data-loss-prevention policies.",       category: "Security", isDangerous: true },
  { key: "compliance.view",resource: "compliance",action: "view",  label: "View compliance",   description: "Access audit logs, GDPR tools and legal holds.", category: "Security" },

  // ── Admin ──────────────────────────────────────────────────────────────────
  { key: "dashboard.view", resource: "dashboard",action: "view",   label: "View dashboard",    description: "Access the executive dashboard.",                category: "Admin" },
  { key: "contacts.read",  resource: "contacts", action: "read",   label: "View contacts",     description: "Access the shared recipient address book.",      category: "Admin" },
  { key: "users.manage",   resource: "users",    action: "manage", label: "Manage users",      description: "Create, edit and deactivate user accounts.",     category: "Admin", isDangerous: true },
  { key: "admin.manage",   resource: "admin",    action: "manage", label: "System admin",      description: "Access the admin console, queues and health.",   category: "Admin", isDangerous: true },
  { key: "org.manage",     resource: "org",      action: "manage", label: "Manage organisation",description: "Departments, teams, domains, policies, analytics.", category: "Admin", isDangerous: true },
  { key: "rbac.manage",    resource: "rbac",     action: "manage", label: "Manage roles",      description: "Create roles and assign permissions.",           category: "Admin", isDangerous: true },
  { key: "billing.manage", resource: "billing",  action: "manage", label: "Manage billing",    description: "View and change plans and billing.",             category: "Admin", isDangerous: true },
] as const satisfies readonly PermissionEntry[];

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]["key"];

/** Set of every valid key — for runtime validation of incoming permission keys. */
export const PERMISSION_KEYS: ReadonlySet<string> = new Set(
  PERMISSION_CATALOG.map((p) => p.key),
);

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_KEYS.has(value);
}

/** Catalog grouped by category — convenient for the admin UI. */
export function catalogByCategory(): Record<PermissionCategory, PermissionEntry[]> {
  const out = { Workspace: [], People: [], Security: [], Admin: [] } as Record<
    PermissionCategory,
    PermissionEntry[]
  >;
  for (const p of PERMISSION_CATALOG) out[p.category].push(p);
  return out;
}
