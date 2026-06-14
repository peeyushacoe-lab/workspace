/**
 * GitHub Integration API
 * GET  — returns connection status + data (repos, PRs, issues)
 * POST { token } — save personal access token
 * DELETE — disconnect
 */
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { redis } from "@/lib/redis";

function tokenKey(userId: string) {
  return `integration:github:token:${userId}`;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = await redis.get(tokenKey(user.id));
  if (!token) return NextResponse.json({ connected: false });

  try {
    // Fetch user + repos + open PRs and issues
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };

    const [meRes, reposRes] = await Promise.all([
      fetch("https://api.github.com/user", { headers }),
      fetch("https://api.github.com/user/repos?sort=updated&per_page=10&type=all", { headers }),
    ]);

    if (!meRes.ok) {
      // Token invalid — clear it
      await redis.del(tokenKey(user.id));
      return NextResponse.json({ connected: false, error: "Token invalid or expired" });
    }

    const ghUser = await meRes.json() as {
      login: string; name: string; avatar_url: string; public_repos: number; followers: number;
    };
    const repos = reposRes.ok ? (await reposRes.json() as Array<{
      id: number; name: string; full_name: string; description: string | null;
      stargazers_count: number; language: string | null; private: boolean;
      open_issues_count: number; html_url: string; updated_at: string;
    }>) : [];

    // Fetch open PRs and issues across all repos (search API)
    const [prsRes, issuesRes] = await Promise.all([
      fetch(`https://api.github.com/search/issues?q=author:${ghUser.login}+type:pr+state:open&per_page=10`, { headers }),
      fetch(`https://api.github.com/search/issues?q=assignee:${ghUser.login}+type:issue+state:open&per_page=10`, { headers }),
    ]);

    const prs = prsRes.ok ? ((await prsRes.json() as { items: unknown[] }).items) : [];
    const issues = issuesRes.ok ? ((await issuesRes.json() as { items: unknown[] }).items) : [];

    return NextResponse.json({
      connected: true,
      user: ghUser,
      repos,
      prs,
      issues,
    });
  } catch (err) {
    console.error("[GitHub integration]", err);
    return NextResponse.json({ connected: false, error: "Failed to fetch GitHub data" });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { token?: string };
  if (!body.token?.trim()) return NextResponse.json({ error: "Token required" }, { status: 400 });

  // Validate token against GitHub
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${body.token.trim()}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!res.ok) return NextResponse.json({ error: "Invalid GitHub token" }, { status: 400 });
  const ghUser = await res.json() as { login: string; name: string };

  await redis.set(tokenKey(user.id), body.token.trim(), "EX", 60 * 60 * 24 * 90); // 90 days

  return NextResponse.json({ ok: true, login: ghUser.login, name: ghUser.name });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await redis.del(tokenKey(user.id));
  return NextResponse.json({ ok: true });
}
