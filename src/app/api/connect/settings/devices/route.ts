import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

/**
 * Connected devices — the sessions signed in as this person.
 *
 * Always scoped to the caller, and revocation is scoped by `userId` as well as
 * session id, so a session id belonging to someone else cannot be ended by
 * guessing it. This is the control that matters most on a lost laptop, so it
 * is the one place worth being pedantic about the where-clause.
 */

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await prisma.userSession.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      deviceInfo: true,
      ipAddress: true,
      userAgent: true,
      lastSeenAt: true,
      createdAt: true,
    },
    orderBy: { lastSeenAt: "desc" },
    take: 50,
  });

  const response = NextResponse.json(
    sessions.map((s) => ({
      id: s.id,
      label: describeDevice(s.deviceInfo, s.userAgent),
      ipAddress: s.ipAddress,
      lastSeenAt: s.lastSeenAt,
      createdAt: s.createdAt,
    })),
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function DELETE(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const all = searchParams.get("all") === "1";

  if (!id && !all) {
    return NextResponse.json({ error: "id or all=1 is required" }, { status: 400 });
  }

  // Scoped by userId as well as id — a session id from another account cannot
  // be revoked by supplying it here.
  const result = await prisma.userSession.deleteMany({
    where: { userId: user.id, ...(id ? { id } : {}) },
  });

  await logAudit({
    actorId: user.id,
    action: "SESSION_REVOKED",
    targetType: "UserSession",
    targetId: id ?? "all",
    metadata: { revoked: result.count },
  });

  return NextResponse.json({ ok: true, revoked: result.count });
}

/**
 * A readable device name. `deviceInfo` is set at login when available;
 * otherwise fall back to coarse UA sniffing, which is fine here because the
 * only job is helping someone recognise their own laptop in a list.
 */
function describeDevice(deviceInfo: string | null, userAgent: string | null): string {
  if (deviceInfo?.trim()) return deviceInfo.trim();
  const ua = userAgent ?? "";
  if (!ua) return "Unknown device";

  const os =
    /Windows/i.test(ua) ? "Windows"
    : /Macintosh|Mac OS X/i.test(ua) ? "macOS"
    : /iPhone|iPad|iOS/i.test(ua) ? "iOS"
    : /Android/i.test(ua) ? "Android"
    : /Linux/i.test(ua) ? "Linux"
    : "Unknown";

  const browser =
    /Edg\//i.test(ua) ? "Edge"
    : /OPR\//i.test(ua) ? "Opera"
    : /Chrome\//i.test(ua) ? "Chrome"
    : /Safari\//i.test(ua) ? "Safari"
    : /Firefox\//i.test(ua) ? "Firefox"
    : "Browser";

  return `${browser} on ${os}`;
}
