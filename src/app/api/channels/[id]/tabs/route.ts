import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Channel tabs — the surfaces pinned across the top of a channel.
 * See docs/rfc-003-teams-and-channels.md.
 *
 * Membership is the authorisation boundary. A channel's tabs reveal which
 * documents and boards a team is working on, which is exactly the sort of
 * metadata leak that matters in a security product — so every handler checks
 * the caller is actually in the channel before returning or mutating anything.
 */

const KINDS = ["FILES", "DOC", "SHEET", "SLIDE", "BOARD", "LINK"] as const;
type Kind = (typeof KINDS)[number];

/** Membership check shared by all three verbs. Returns null when allowed. */
async function denyIfNotMember(channelId: string, userId: string) {
  const member = await prisma.chatMember.findFirst({
    where: { channelId, userId },
    select: { channelId: true },
  });
  // 404 rather than 403: telling a stranger a channel exists is itself a leak.
  if (!member) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;
  const denied = await denyIfNotMember(channelId, user.id);
  if (denied) return denied;

  const tabs = await prisma.channelTab.findMany({
    where: { channelId },
    orderBy: { position: "asc" },
    select: { id: true, kind: true, label: true, target: true, position: true },
  });
  return NextResponse.json(tabs);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;
  const denied = await denyIfNotMember(channelId, user.id);
  if (denied) return denied;

  const body = (await request.json()) as { kind?: string; label?: string; target?: string | null };

  if (!body.kind || !KINDS.includes(body.kind as Kind)) {
    return NextResponse.json({ error: "Unknown tab kind" }, { status: 400 });
  }
  const kind = body.kind as Kind;

  const label = (body.label ?? "").trim().slice(0, 60);
  if (!label) return NextResponse.json({ error: "A tab needs a name" }, { status: 400 });

  // FILES points at the channel's own folder and therefore has no target;
  // everything else is meaningless without one.
  const target = kind === "FILES" ? null : (body.target ?? "").trim() || null;
  if (kind !== "FILES" && !target) {
    return NextResponse.json({ error: "That tab kind needs a target" }, { status: 400 });
  }

  // A LINK target is fetched into an iframe by the client, so it must be a
  // real http(s) URL — javascript: and data: URLs would execute in our origin.
  if (kind === "LINK") {
    let parsed: URL;
    try { parsed = new URL(target as string); }
    catch { return NextResponse.json({ error: "That is not a valid URL" }, { status: 400 }); }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return NextResponse.json({ error: "Only http and https links can be pinned" }, { status: 400 });
    }
  }

  // A channel with fifty tabs is a channel nobody can read.
  const count = await prisma.channelTab.count({ where: { channelId } });
  if (count >= 12) {
    return NextResponse.json({ error: "A channel can hold at most 12 tabs" }, { status: 400 });
  }

  const tab = await prisma.channelTab.create({
    data: { channelId, kind, label, target, position: count, createdById: user.id },
    select: { id: true, kind: true, label: true, target: true, position: true },
  });
  return NextResponse.json(tab, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: channelId } = await params;
  const denied = await denyIfNotMember(channelId, user.id);
  if (denied) return denied;

  const tabId = new URL(request.url).searchParams.get("tabId");
  if (!tabId) return NextResponse.json({ error: "tabId is required" }, { status: 400 });

  // Scoped by channelId as well as id, so a tab id from another channel can't
  // be deleted by someone who happens to be a member of this one.
  const result = await prisma.channelTab.deleteMany({ where: { id: tabId, channelId } });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
