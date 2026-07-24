import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const responder = await prisma.vacationResponder.findUnique({ where: { userId: user.id } });
  return NextResponse.json(
    responder ?? { isEnabled: false, subject: "Automatic reply", message: "", startDate: null, endDate: null },
  );
}

export async function PUT(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    isEnabled?: boolean;
    subject?: string;
    message?: string;
    startDate?: string | null;
    endDate?: string | null;
  };

  const responder = await prisma.vacationResponder.upsert({
    where: { userId: user.id },
    update: {
      ...(body.isEnabled !== undefined ? { isEnabled: body.isEnabled } : {}),
      ...(body.subject !== undefined ? { subject: body.subject } : {}),
      ...(body.message !== undefined ? { message: body.message } : {}),
      ...(body.startDate !== undefined ? { startDate: body.startDate ? new Date(body.startDate) : null } : {}),
      ...(body.endDate !== undefined ? { endDate: body.endDate ? new Date(body.endDate) : null } : {}),
    },
    create: {
      userId: user.id,
      isEnabled: body.isEnabled ?? false,
      subject: body.subject ?? "Automatic reply",
      message: body.message ?? "",
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
    },
  });

  return NextResponse.json(responder);
}
