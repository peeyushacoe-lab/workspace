import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// DELETE: ADMIN only — interns/mentors cannot delete so their record stays intact.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only an admin can delete discussions" }, { status: 403 });
  }

  const { id } = await params;
  const msg = await prisma.internDiscussion.findUnique({ where: { id }, select: { id: true } });
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.internDiscussion.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
