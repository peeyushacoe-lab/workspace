/**
 * Jira Integration API
 * GET  — returns connection status + projects/issues
 * POST { email, apiToken, baseUrl } — save credentials
 * DELETE — disconnect
 */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { redis } from "@/lib/redis";

type JiraCreds = { email: string; apiToken: string; baseUrl: string };

function credsKey(userId: string) {
  return `integration:jira:creds:${userId}`;
}

function makeHeaders(email: string, apiToken: string) {
  const encoded = Buffer.from(`${email}:${apiToken}`).toString("base64");
  return {
    Authorization: `Basic ${encoded}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export async function GET() {
  const cookieStore = await cookies();
  const user = await getCurrentUser(cookieStore);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await redis.get(credsKey(user.id));
  if (!raw) return NextResponse.json({ connected: false });

  let creds: JiraCreds;
  try { creds = JSON.parse(raw) as JiraCreds; } catch { return NextResponse.json({ connected: false }); }

  const base = creds.baseUrl.replace(/\/$/, "");
  const headers = makeHeaders(creds.email, creds.apiToken);

  try {
    const [myselfRes, projectsRes] = await Promise.all([
      fetch(`${base}/rest/api/3/myself`, { headers }),
      fetch(`${base}/rest/api/3/project?maxResults=20`, { headers }),
    ]);

    if (!myselfRes.ok) {
      await redis.del(credsKey(user.id));
      return NextResponse.json({ connected: false, error: "Invalid Jira credentials" });
    }

    const myself = await myselfRes.json() as {
      displayName: string; emailAddress: string; avatarUrls: Record<string, string>;
    };
    const projects = projectsRes.ok ? (await projectsRes.json() as Array<{
      id: string; key: string; name: string; projectTypeKey: string; avatarUrls: Record<string, string>;
    }>) : [];

    // Fetch issues assigned to user
    const issuesRes = await fetch(
      `${base}/rest/api/3/search?jql=assignee=currentUser()+AND+statusCategory!=Done+ORDER+BY+updated+DESC&maxResults=15&fields=summary,status,priority,project,updated,issuetype`,
      { headers }
    );
    const issuesData = issuesRes.ok ? (await issuesRes.json() as {
      issues: Array<{
        id: string; key: string;
        fields: {
          summary: string;
          status: { name: string; statusCategory: { colorName: string } };
          priority: { name: string; iconUrl: string } | null;
          project: { key: string; name: string };
          updated: string;
          issuetype: { name: string; iconUrl: string };
        };
      }>;
      total: number;
    }) : { issues: [], total: 0 };

    return NextResponse.json({
      connected: true,
      user: { ...myself, baseUrl: base },
      projects,
      issues: issuesData.issues,
      total: issuesData.total,
    });
  } catch (err) {
    console.error("[Jira integration]", err);
    return NextResponse.json({ connected: false, error: "Failed to reach Jira" });
  }
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const user = await getCurrentUser(cookieStore);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Partial<JiraCreds>;
  if (!body.email || !body.apiToken || !body.baseUrl) {
    return NextResponse.json({ error: "email, apiToken, and baseUrl are required" }, { status: 400 });
  }

  const base = body.baseUrl.replace(/\/$/, "");
  const headers = makeHeaders(body.email, body.apiToken);
  const res = await fetch(`${base}/rest/api/3/myself`, { headers });
  if (!res.ok) return NextResponse.json({ error: "Invalid Jira credentials" }, { status: 400 });

  const myself = await res.json() as { displayName: string };
  const creds: JiraCreds = { email: body.email, apiToken: body.apiToken, baseUrl: base };
  await redis.set(credsKey(user.id), JSON.stringify(creds), "EX", 60 * 60 * 24 * 90);

  return NextResponse.json({ ok: true, displayName: myself.displayName });
}

export async function DELETE() {
  const cookieStore = await cookies();
  const user = await getCurrentUser(cookieStore);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await redis.del(credsKey(user.id));
  return NextResponse.json({ ok: true });
}
