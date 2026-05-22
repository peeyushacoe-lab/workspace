import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? undefined;
  const agentId = searchParams.get("agentId") ?? undefined;

  const tasks = await prisma.agentTask.findMany({
    where: {
      userId: user.id,
      ...(status ? { status: status as never } : {}),
      ...(agentId ? { agentId } : {}),
      parentTaskId: null, // top-level only
    },
    include: { _count: { select: { children: true } } },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(tasks);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    title: string;
    description?: string;
    agentId?: string;
    priority?: number;
    input?: Record<string, unknown>;
    parentTaskId?: string;
  };

  if (!body.title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const task = await prisma.agentTask.create({
    data: {
      userId: user.id,
      agentId: body.agentId ?? null,
      title: body.title,
      description: body.description ?? null,
      priority: body.priority ?? 5,
      input: (body.input ?? undefined) as never,
      parentTaskId: body.parentTaskId ?? null,
    },
  });

  // If agentId provided, immediately queue execution
  if (body.agentId) {
    runAgentTask(task.id, user.id).catch(() => {});
  }

  return NextResponse.json(task, { status: 201 });
}

async function runAgentTask(taskId: string, userId: string): Promise<void> {
  const task = await prisma.agentTask.findUnique({ where: { id: taskId } });
  if (!task) return;

  await prisma.agentTask.update({ where: { id: taskId }, data: { status: "RUNNING", startedAt: new Date() } });

  try {
    const { getAIClient } = await import("@/lib/ai");
    const client = getAIClient();

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an autonomous AI agent. Execute the given task and provide structured output with steps taken and result." },
        { role: "user", content: `Task: ${task.title}\n\nDescription: ${task.description ?? "N/A"}\n\nInput: ${JSON.stringify(task.input)}` },
      ],
      max_tokens: 1000,
    });

    const text = response.choices[0].message.content ?? "";
    const steps = [{ step: "AI Processing", result: text, ts: new Date().toISOString() }];

    await prisma.agentTask.update({
      where: { id: taskId },
      data: { status: "COMPLETED", output: { result: text } as never, steps: steps as never, completedAt: new Date() },
    });

    // Notify user
    await prisma.notification.create({
      data: {
        userId,
        type: "SYSTEM",
        title: "Agent Task Completed",
        body: `Task "${task.title}" has been completed`,
        link: "/brain",
      },
    }).catch(() => {});
  } catch (err) {
    await prisma.agentTask.update({
      where: { id: taskId },
      data: { status: "FAILED", error: err instanceof Error ? err.message : "Unknown error", completedAt: new Date() },
    });
  }
}
