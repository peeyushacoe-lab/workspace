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
    error = err instanceof Error ? err.message : "Unknown error";
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error, endedAt: new Date() },
    });
  }

  return NextResponse.json({ runId: run.id, status: error ? "FAILED" : "SUCCESS", results, error });
}
