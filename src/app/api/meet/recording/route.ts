/**
 * Meeting Recording — Phase 24 Voice & Meeting
 * POST starts a recording session, PATCH completes it with a storage URL.
 * The actual recording blob is uploaded from the client to cloud storage
 * (S3/R2); this endpoint only tracks metadata and triggers AI transcription.
 */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { claudeComplete } from "@/lib/claude";

export async function POST(request: NextRequest) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { meetingId: string };
  if (!body.meetingId)
    return NextResponse.json({ error: "meetingId is required" }, { status: 400 });

  const meeting = await prisma.meeting.findUnique({
    where: { id: body.meetingId },
    select: { id: true, organizerId: true, isRecordingEnabled: true },
  });
  if (!meeting) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  if (meeting.organizerId !== user.id)
    return NextResponse.json({ error: "Only the organizer can start recording" }, { status: 403 });

  await prisma.meeting.update({
    where: { id: body.meetingId },
    data: { isRecordingEnabled: true },
  });

  return NextResponse.json({ ok: true, recording: true });
}

export async function PATCH(request: NextRequest) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    meetingId: string;
    recordingUrl: string;
    transcript?: string;
  };

  const meeting = await prisma.meeting.findUnique({
    where: { id: body.meetingId },
    select: { id: true, organizerId: true, title: true },
  });
  if (!meeting) return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  if (meeting.organizerId !== user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Generate AI summary from transcript if available
  let aiSummary: string | null = null;
  let actionItems: string[] = [];
  if (body.transcript) {
    const summaryRaw = await claudeComplete(
      "You summarize meeting transcripts. Return JSON: {\"summary\": \"...\", \"actionItems\": [\"...\", \"...\"]}",
      `Meeting: ${meeting.title}\n\nTranscript:\n${body.transcript.slice(0, 6000)}`,
      600,
    );
    if (summaryRaw) {
      try {
        const parsed = JSON.parse(summaryRaw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as {
          summary?: string; actionItems?: string[];
        };
        aiSummary = parsed.summary ?? null;
        actionItems = parsed.actionItems ?? [];
      } catch { /* ignore */ }
    }
  }

  const updated = await prisma.meeting.update({
    where: { id: body.meetingId },
    data: {
      recordingUrl: body.recordingUrl,
      transcriptUrl: body.transcript ? body.recordingUrl.replace(/\.webm$/, ".txt") : undefined,
      aiSummary,
      actionItems,
      status: "ENDED",
      endedAt: new Date(),
    },
    select: { id: true, recordingUrl: true, aiSummary: true, actionItems: true },
  });

  return NextResponse.json(updated);
}
