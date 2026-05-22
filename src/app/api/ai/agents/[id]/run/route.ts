import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAIClient, AI_MODEL } from "@/lib/ai";
import { Prisma } from "@/generated/prisma/client";

type Params = { params: Promise<{ id: string }> };

const AGENT_PROMPTS: Record<string, string> = {
  INBOX_TRIAGE:  "You are an email triage agent. Analyze the provided emails and categorize them by priority (URGENT/HIGH/NORMAL/LOW), suggest labels, and identify action items. Respond as JSON: {\"triaged\": [{\"id\": \"...\", \"priority\": \"...\", \"label\": \"...\", \"action\": \"...\"}]}",
  SCHEDULING:    "You are a scheduling assistant. Analyze the request and suggest optimal meeting times, draft calendar invites, and identify conflicts. Respond as JSON: {\"suggestions\": [{\"time\": \"...\", \"duration\": ..., \"title\": \"...\"}]}",
  KNOWLEDGE:     "You are a knowledge base agent. Search the provided context and answer questions with citations. Respond as JSON: {\"answer\": \"...\", \"sources\": [\"...\"]}",
  COMPLIANCE:    "You are a compliance monitoring agent. Review the provided content for policy violations, data sensitivity issues, and regulatory concerns. Respond as JSON: {\"violations\": [{\"type\": \"...\", \"severity\": \"...\", \"detail\": \"...\"}], \"clean\": boolean}",
};

/**
 * POST /api/ai/agents/:id/run
 * Execute an AI agent with the provided input.
 */
export async function POST(request: Request, { params }: Params) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const agent = await prisma.aIAgent.findFirst({ where: { id, isActive: true } });
  if (!agent) return NextResponse.json({ error: "Agent not found or inactive" }, { status: 404 });

  const body = await request.json() as { input: Record<string, unknown> };
  if (!body.input) return NextResponse.json({ error: "input is required" }, { status: 400 });

  // Create a run record
  const run = await prisma.aIAgentRun.create({
    data: {
      agentId: agent.id,
      userId:  user.id,
      input:   body.input as Prisma.InputJsonValue,
      status:  "RUNNING",
    },
  });

  try {
    const ai = getAIClient();
    const systemPrompt = AGENT_PROMPTS[agent.type] ?? "You are a helpful AI agent. Process the input and respond with a JSON result.";
    const inputText = JSON.stringify(body.input);

    const response = await ai.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 1000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Input:\n${inputText}` },
      ],
    });

    const text = response.choices[0]?.message.content ?? "{}";
    let output: Record<string, unknown>;
    try {
      output = JSON.parse(text.replace(/```json\n?|\n?```/g, "").trim()) as Record<string, unknown>;
    } catch {
      output = { result: text };
    }

    const completed = await prisma.aIAgentRun.update({
      where: { id: run.id },
      data: {
        status:  "DONE",
        output:  output as Prisma.InputJsonValue,
        endedAt: new Date(),
      },
    });

    return NextResponse.json(completed);
  } catch (err) {
    await prisma.aIAgentRun.update({
      where: { id: run.id },
      data: {
        status:  "FAILED",
        error:   err instanceof Error ? err.message : "Unknown error",
        endedAt: new Date(),
      },
    });
    return NextResponse.json({ error: "Agent execution failed" }, { status: 500 });
  }
}
