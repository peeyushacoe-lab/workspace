import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { createNotification } from "@/lib/notifications";

const INTERN_ROLES = ["INTERNSHIP"] as const;
const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;
const HUB_ROLES = [...INTERN_ROLES, ...MENTOR_ROLES] as const;

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const announcements = await prisma.internAnnouncement.findMany({
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    include: {
      author: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
      reactions: { include: { user: { select: { id: true, fullName: true } } } },
      comments: {
        include: { author: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json(announcements);
}

const createSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  isPinned: z.boolean().optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !MENTOR_ROLES.includes(user.role as typeof MENTOR_ROLES[number])) {
    return NextResponse.json({ error: "Only mentors can post announcements" }, { status: 403 });
  }

  const body = await request.json();
  const data = createSchema.parse(body);

  const ann = await prisma.internAnnouncement.create({
    data: { ...data, authorId: user.id },
    include: {
      author: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
      reactions: true,
      comments: true,
    },
  });

  // Notify all interns of the new announcement
  const interns = await prisma.user.findMany({
    where: { role: "INTERNSHIP", isActive: true },
    select: { id: true },
  });
  await Promise.all(
    interns.map(intern =>
      createNotification({
        userId: intern.id,
        type: "SYSTEM",
        title: `📣 New Announcement: ${data.title}`,
        body: data.body.slice(0, 120) + (data.body.length > 120 ? "…" : ""),
        link: "/internship",
      }).catch(() => {}),
    ),
  );

  return NextResponse.json(ann, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user || !MENTOR_ROLES.includes(user.role as typeof MENTOR_ROLES[number])) {
    return NextResponse.json({ error: "Only mentors can delete announcements" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const ann = await prisma.internAnnouncement.findUnique({ where: { id }, select: { authorId: true } });
  if (!ann) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.internAnnouncement.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
