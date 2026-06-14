/**
 * Linear Integration API
 * GET  — returns connection status + viewer/issues/teams
 * POST { apiKey } — save Linear personal API key
 * DELETE — disconnect
 */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { redis } from "@/lib/redis";

function tokenKey(userId: string) {
  return `integration:linear:token:${userId}`;
}

async function linearQuery(token: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Linear API error: ${res.status}`);
  return res.json() as Promise<{ data?: unknown; errors?: unknown[] }>;
}

const VIEWER_QUERY = `
  query {
    viewer {
      id name email avatarUrl
      teams { nodes { id name key color } }
    }
  }
`;

const ISSUES_QUERY = `
  query {
    viewer {
      assignedIssues(filter: { state: { type: { nin: ["completed", "cancelled"] } } }, first: 15, orderBy: updatedAt) {
        nodes {
          id identifier title priority state { name color type }
          team { name key }
          updatedAt
          url
          labels { nodes { name color } }
        }
      }
    }
  }
`;

export async function GET() {
  const cookieStore = await cookies();
  const user = await getCurrentUser(cookieStore);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = await redis.get(tokenKey(user.id));
  if (!token) return NextResponse.json({ connected: false });

  try {
    const [viewerData, issuesData] = await Promise.all([
      linearQuery(token as string, VIEWER_QUERY),
      linearQuery(token as string, ISSUES_QUERY),
    ]);

    if (!viewerData.data) {
      await redis.del(tokenKey(user.id));
      return NextResponse.json({ connected: false, error: "Invalid Linear API key" });
    }

    const d = viewerData.data as {
      viewer: {
        id: string; name: string; email: string; avatarUrl: string | null;
        teams: { nodes: Array<{ id: string; name: string; key: string; color: string }> };
      };
    };

    const id2 = issuesData.data as {
      viewer: {
        assignedIssues: {
          nodes: Array<{
            id: string; identifier: string; title: string; priority: number;
            state: { name: string; color: string; type: string };
            team: { name: string; key: string };
            updatedAt: string; url: string;
            labels: { nodes: Array<{ name: string; color: string }> };
          }>;
        };
      };
    };

    return NextResponse.json({
      connected: true,
      user: d.viewer,
      teams: d.viewer.teams.nodes,
      issues: id2?.viewer?.assignedIssues?.nodes ?? [],
    });
  } catch (err) {
    console.error("[Linear integration]", err);
    return NextResponse.json({ connected: false, error: "Failed to reach Linear" });
  }
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const user = await getCurrentUser(cookieStore);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { apiKey?: string };
  if (!body.apiKey?.trim()) return NextResponse.json({ error: "apiKey required" }, { status: 400 });

  // Validate key
  try {
    const data = await linearQuery(body.apiKey.trim(), VIEWER_QUERY);
    if (!data.data) return NextResponse.json({ error: "Invalid Linear API key" }, { status: 400 });

    const d = data.data as { viewer: { name: string } };
    await redis.set(tokenKey(user.id), body.apiKey.trim(), "EX", 60 * 60 * 24 * 90);

    return NextResponse.json({ ok: true, name: d.viewer.name });
  } catch {
    return NextResponse.json({ error: "Invalid Linear API key" }, { status: 400 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  const user = await getCurrentUser(cookieStore);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await redis.del(tokenKey(user.id));
  return NextResponse.json({ ok: true });
}
