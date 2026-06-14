/**
 * App Marketplace API
 * GET  — returns the app registry with enabled states from Redis
 * PATCH { appId, enabled } — admin only, toggle app enabled state
 */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { redis } from "@/lib/redis";

const REDIS_KEY = "apps:config";

export type AppStatus = "available" | "coming_soon";

export type AppEntry = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  status: AppStatus;
  enabled: boolean;
};

const APP_REGISTRY: Omit<AppEntry, "enabled">[] = [
  // ── Built-in productivity apps ──────────────────────────────────────────────
  { id: "sheets",      name: "Sheets",      description: "Create and collaborate on spreadsheets",         category: "Productivity",         icon: "file-spreadsheet", status: "available"  },
  { id: "slides",      name: "Slides",      description: "Build presentations with real-time collaboration",category: "Productivity",         icon: "presentation",    status: "available"   },
  { id: "docs",        name: "Docs",        description: "Write rich documents with live collaboration",    category: "Productivity",         icon: "file-text",       status: "available"   },
  { id: "notes",       name: "Notes",       description: "Personal notes with rich text formatting",        category: "Productivity",         icon: "notebook",        status: "available"   },
  // ── Integrations ───────────────────────────────────────────────────────────
  { id: "github",      name: "GitHub",      description: "Link pull requests and issues to messages",      category: "Developer",            icon: "github",          status: "available"   },
  { id: "linear",      name: "Linear",      description: "Track issues and projects from your inbox",      category: "Project Management",   icon: "layers",          status: "available"   },
  { id: "jira",        name: "Jira",        description: "Connect Jira tickets to email threads",          category: "Project Management",   icon: "trello",          status: "available"   },
  { id: "slack",       name: "Slack",       description: "Forward emails to Slack channels",               category: "Communication",        icon: "message-square",  status: "coming_soon" },
  { id: "salesforce",  name: "Salesforce",  description: "CRM contact enrichment for emails",             category: "CRM",                  icon: "briefcase",       status: "coming_soon" },
  { id: "zapier",      name: "Zapier",      description: "Connect Nexus to 5000+ apps",                   category: "Automation",           icon: "zap",             status: "available"   },
  { id: "webhook",     name: "Webhooks",    description: "Send real-time events to your endpoints",        category: "Developer",            icon: "link",            status: "available"   },
  { id: "api",         name: "REST API",    description: "Build custom integrations with the Nexus API",   category: "Developer",            icon: "code",            status: "available"   },
];

async function getEnabledSet(): Promise<Set<string>> {
  try {
    const raw = await redis.get(REDIS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return new Set(parsed as string[]);
  } catch {
    // Redis unavailable or bad JSON — degrade gracefully
  }
  return new Set();
}

async function saveEnabledSet(enabled: Set<string>): Promise<void> {
  await redis.set(REDIS_KEY, JSON.stringify([...enabled]));
}

export async function GET() {
  const enabledSet = await getEnabledSet();

  const apps: AppEntry[] = APP_REGISTRY.map((app) => ({
    ...app,
    enabled: enabledSet.has(app.id),
  }));

  return NextResponse.json({ apps });
}

export async function PATCH(request: NextRequest) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { appId, enabled } = body as { appId?: unknown; enabled?: unknown };

  if (typeof appId !== "string" || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "appId (string) and enabled (boolean) are required" }, { status: 400 });
  }

  const validIds = new Set(APP_REGISTRY.map((a) => a.id));
  if (!validIds.has(appId)) {
    return NextResponse.json({ error: "Unknown appId" }, { status: 404 });
  }

  const enabledSet = await getEnabledSet();

  if (enabled) {
    enabledSet.add(appId);
  } else {
    enabledSet.delete(appId);
  }

  await saveEnabledSet(enabledSet);

  return NextResponse.json({ ok: true, appId, enabled });
}
