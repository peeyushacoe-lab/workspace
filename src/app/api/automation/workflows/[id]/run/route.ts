import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAIClient } from "@/lib/ai";

type Params = { params: Promise<{ id: string }> };

type WorkflowAction = {
  type: string;
  config?: Record<string, unknown>;
};

const MGMT_ROLES = ["ADMIN", "CEO", "OPS_MANAGER", "COO"] as const;
type MgmtRole = (typeof MGMT_ROLES)[number];

// Blocks SSRF via workflow-configured webhook URLs — rejects loopback, private,
// link-local, and other internal/metadata hosts.
function isPrivateOrInternalHost(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return true; // Unparseable URL — treat as unsafe
  }

  if (hostname === "localhost" || hostname === "::1" || hostname === "0.0.0.0") return true;

  // IPv4 literal checks
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [parseInt(ipv4[1], 10), parseInt(ipv4[2], 10)];
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local/metadata
    if (a === 0) return true;
    return false;
  }

  // IPv6 unique-local / link-local
  if (hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80")) return true;

  return false;
}

async function executeAction(
  action: WorkflowAction,
  triggerData: Record<string, unknown>,
  userId: string,
): Promise<Record<string, unknown>> {
  switch (action.type) {
    case "NOTIFY":
      await prisma.notification.create({
        data: {
          userId,
          type: "SYSTEM",
          title: String(action.config?.title ?? "Workflow notification"),
          body: String(action.config?.body ?? "A workflow was triggered"),
          link: action.config?.link ? String(action.config.link) : null,
        },
      });
      return { action: "NOTIFY", status: "sent" };

    case "AI_PROCESS": {
      const client = getAIClient();
      const prompt = String(action.config?.prompt ?? "Summarize the following: " + JSON.stringify(triggerData));
      const res = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
      });
      return { action: "AI_PROCESS", result: res.choices[0].message.content };
    }

    case "WEBHOOK": {
      const url = String(action.config?.url ?? "");
      if (!url) return { action: "WEBHOOK", status: "skipped", reason: "no url" };
      if (isPrivateOrInternalHost(url)) {
        return { action: "WEBHOOK", status: "failed", reason: "target host is not allowed" };
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: triggerData, config: action.config }),
        signal: AbortSignal.timeout(10_000),
      });
      return { action: "WEBHOOK", status: res.ok ? "delivered" : "failed", statusCode: res.status };
    }

    case "CREATE_TASK":
      await prisma.agentTask.create({
        data: {
          userId,
          title: String(action.config?.title ?? "Automated task"),
          description: action.config?.description ? String(action.config.description) : null,
          input: triggerData as never,
          priority: Number(action.config?.priority ?? 5),
        },
      });
      return { action: "CREATE_TASK", status: "created" };

    default:
      return { action: action.type, status: "skipped", reason: "unknown action type" };
  }
}

export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const workflow = await prisma.workflow.findUnique({ where: { id } });
  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = workflow.createdById === user.id;
  const isMgmt = MGMT_ROLES.includes(user.role as MgmtRole);
  if (!isOwner && !isMgmt) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (workflow.status !== "ACTIVE" && workflow.status !== "DRAFT") {
    return NextResponse.json({ error: "Workflow is not active" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;

  const run = await prisma.workflowRun.create({
    data: { workflowId: id, status: "RUNNING", triggerData: body as never },
  });

  // Execute actions asynchronously
  const actions = (workflow.actions as WorkflowAction[]) ?? [];
  const results: Record<string, unknown>[] = [];
  let error: string | null = null;

  try {
    for (const action of actions) {
      const result = await executeAction(action, body, user.id);
      results.push(result);
    }

    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", results: results as never, endedAt: new Date() },
    });
    await prisma.workflow.update({
      where: { id },
      data: { runCount: { increment: 1 }, lastRunAt: new Date() },
    });
  } catch (err) {
    console.error(`Workflow run ${run.id} failed:`, err);
    error = "Workflow run failed. Please try again.";
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error, endedAt: new Date() },
    });
  }

  return NextResponse.json({ runId: run.id, status: error ? "FAILED" : "SUCCESS", results, error });
}
