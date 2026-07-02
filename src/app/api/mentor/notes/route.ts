import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;

function isMentor(role: string) {
  return (MENTOR_ROLES as readonly string[]).includes(role);
}

// GET /api/mentor/notes?internId=...
// Mentors see all notes for the intern; interns see only their own non-private notes.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  let internId = searchParams.get("internId");
  let where: { internId: string; isPrivate?: boolean };

  if (user.role === "INTERNSHIP") {
    internId = user.id;
    where = { internId, isPrivate: false };
  } else if (isMentor(user.role)) {
    if (!internId) return NextResponse.json({ error: "internId required" }, { status: 400 });
    where = { internId };
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const notes = await prisma.mentorNote.findMany({
    where,
    include: { mentor: { select: { id: true, fullName: true, avatarUrl: true } } },
    orderBy: { meetingDate: "desc" },
  });
  return NextResponse.json({ notes });
}

// POST /api/mentor/notes — { internId, note, actionItems?, meetingDate?, isPrivate? }
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isMentor(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body?.internId || !body?.note) return NextResponse.json({ error: "internId and note required" }, { status: 400 });

  const created = await prisma.mentorNote.create({
    data: {
      mentorId: user.id,
      internId: body.internId,
      note: String(body.note).slice(0, 5000),
      actionItems: typeof body.actionItems === "string" ? body.actionItems.slice(0, 2000) : null,
      meetingDate: body.meetingDate ? new Date(body.meetingDate) : new Date(),
      isPrivate: body.isPrivate !== false, // default private
    },
    include: { mentor: { select: { id: true, fullName: true, avatarUrl: true } } },
  });
  return NextResponse.json(created, { status: 201 });
}

// DELETE /api/mentor/notes?id=... — author or ADMIN
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isMentor(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const note = await prisma.mentorNote.findUnique({ where: { id } });
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (note.mentorId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.mentorNote.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
