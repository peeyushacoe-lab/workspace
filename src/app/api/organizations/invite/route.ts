import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(request: NextRequest) {
  const actor = getSessionUserFromCookieStore(await cookies());
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!actor.organizationId) return NextResponse.json({ error: "No organization" }, { status: 404 });
  if (actor.orgRole !== "OWNER" && actor.orgRole !== "ADMIN" && actor.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as { email?: string; orgRole?: string };
  if (!body.email || typeof body.email !== "string")
    return NextResponse.json({ error: "email is required" }, { status: 400 });

  const email = body.email.trim().toLowerCase();
  const orgRole = body.orgRole ?? "MEMBER";

  const org = await prisma.organization.findUnique({
    where: { id: actor.organizationId },
    select: { id: true, name: true },
  });
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const invite = await prisma.organizationInvite.upsert({
    where: { organizationId_email: { organizationId: org.id, email } },
    update: { orgRole, expiresAt, acceptedAt: null },
    create: { organizationId: org.id, email, orgRole, invitedById: actor.id, expiresAt },
  });

  if (resend) {
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/invite/${invite.token}`;
    resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "CyberSage <noreply@cybersage.uk>",
      to: email,
      subject: `You're invited to join ${org.name} on CyberSage`,
      html: `<p>You've been invited to join <strong>${org.name}</strong> on CyberSage Workspace.</p><p><a href="${inviteUrl}">Accept invitation</a></p><p>This link expires in 7 days.</p>`,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, token: invite.token });
}
