import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAIClient } from "@/lib/ai";

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? undefined;

  const orchestrations = await prisma.agentOrchestration.findMany({
    where: { userId: user.id, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(orchestrations);
}

export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    name: string;
    objective: string;
    description?: string;
    agentIds?: string[];
  };

  if (!body.name || !body.objective) {
    return NextResponse.json({ error: "name and objective required" }, { status: 400 });
  }

  const orchestration = await prisma.agentOrchestration.create({
    data: {
      name: body.name,
      objective: body.objective,
      description: body.description ?? null,
      agentIds: body.agentIds ?? [],
      userId: user.id,
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  // Plan and execute asynchronously
  executeOrchestration(orchestration.id, body.objective, user.id).catch(() => {});

  return NextResponse.json(orchestration, { status: 201 });
}

async function executeOrchestration(id: string, objective: string, userId: string): Promise<void> {
  try {
    const client = getAIClient();

    // Step 1: Generate execution plan
    const planRes = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a multi-agent orchestrator. Given an objective, create a concise execution plan with 3-5 steps. Return JSON: { steps: [{id, title, description, agentType}] }" },
        { role: "user", content: `Objective: ${objective}` },
      ],
      response_format: { type: "json_object" },
      max_tokens: 600,
    });

    let plan: { steps: Array<{ id: string; title: string; description: string; agentType: string }> } = { steps: [] };
    try { plan = JSON.parse(planRes.choices[0].message.content ?? "{}"); } catch { /* use empty plan */ }

    await prisma.agentOrchestration.update({ where: { id }, data: { plan: plan as never } });

    // Step 2: Execute each step
    const results: Record<string, unknown>[] = [];
    for (const step of plan.steps ?? []) {
      const stepRes = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: `You are a ${step.agentType ?? "specialist"} agent.` },
          { role: "user", content: `Objective: ${objective}\n\nYour task: ${step.title}\n\n${step.description}` },
        ],
        max_tokens: 400,
      });
      results.push({ step: step.title, result: stepRes.choices[0].message.content });
    }

    await prisma.agentOrchestration.update({
      where: { id },
      data: { status: "COMPLETED", results: { steps: results } as never, completedAt: new Date() },
    });

    await prisma.notification.create({
      data: {
        userId,
        type: "SYSTEM",
        title: "Orchestration Complete",
        body: `Multi-agent task "${objective.slice(0, 60)}" has finished`,
        link: "/brain",
      },
    }).catch(() => {});
  } catch (err) {
    await prisma.agentOrchestration.update({
      where: { id },
      data: { status: "FAILED", results: { error: err instanceof Error ? err.message : "Unknown" } as never, completedAt: new Date() },
    }).catch(() => {});
  }
}
