import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// Strip script/iframe/event-handler tags from user-supplied signature HTML.
// Full DOM sanitization happens client-side; this is a server-side backstop.
function stripDangerousHtml(html: string): string {
  return html
    .replace(/<(script|iframe|object|embed|form|meta|base|link)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|iframe|object|embed|form|meta|base|link)[^>]*\/?>/gi, "")
    .replace(/\s+on\w+\s*=\s*(['"])[^'"]*\1/gi, "")
    .replace(/\s+on\w+\s*=\s*[^\s>]*/gi, "")
    .replace(/javascript\s*:/gi, "");
}

const signatureSchema = z.object({
  fullName: z.string().trim().min(1),
  title: z.string().trim().min(1),
  phone: z.string().trim().optional(),
  linkedinUrl: z.string().trim().optional(),
  website: z.string().trim().optional(),
  html: z.string().trim().optional(),
  plainText: z.string().trim().optional(),
});

export async function GET() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    include: { signature: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user.signature ? [user.signature] : [], {
    headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=600" },
  });
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = signatureSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { error: "Invalid data", details: payload.error.issues },
      { status: 400 }
    );
  }

  const { html, ...rest } = payload.data;
  const safeHtml = html ? stripDangerousHtml(html) : "";

  const signature = await prisma.signature.upsert({
    where: { userId: currentUser.id },
    update: { ...rest, html: safeHtml },
    create: { userId: currentUser.id, ...rest, html: safeHtml },
  });

  return NextResponse.json(signature);
}
