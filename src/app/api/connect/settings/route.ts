import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  readConnectSettings,
  writeConnectSettings,
  THEME_VALUES,
  DENSITY_VALUES,
  type DeepPartial,
  type ConnectSettings,
} from "@/lib/connect-settings";

/**
 * A person's own Connect settings. Always scoped to the caller — there is no
 * `userId` parameter, so there is nothing to enumerate and no IDOR surface.
 */

export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { preferences: true, fullName: true, email: true, avatarUrl: true },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const response = NextResponse.json({
    settings: readConnectSettings(row.preferences),
    profile: { fullName: row.fullName, email: row.email, avatarUrl: row.avatarUrl },
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function PATCH(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch = sanitise(body);
  if (!patch) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  // Read-modify-write rather than a JSON path update: `preferences` also holds
  // HR lifecycle state, employee ids and the notification matrix, and Prisma
  // has no partial-JSON update. Overwriting the column wholesale is exactly how
  // unrelated features lose their state, so the merge happens in
  // writeConnectSettings and everything outside `connect` is carried through.
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { preferences: true } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const next = writeConnectSettings(row.preferences, patch);
  await prisma.user.update({
    where: { id: user.id },
    data: { preferences: next as object },
  });

  return NextResponse.json({ settings: readConnectSettings(next) });
}

/**
 * Accept only known keys with the right primitive type, and only the two enum
 * fields' allowed values. The client is trusted to render the form; it is not
 * trusted to decide what a valid theme is.
 */
function sanitise(body: unknown): DeepPartial<ConnectSettings> | null {
  if (typeof body !== "object" || body === null) return null;
  const input = body as Record<string, unknown>;
  const patch: DeepPartial<ConnectSettings> = {};

  const section = (name: string): Record<string, unknown> | null => {
    const v = input[name];
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  };
  const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
  const pick = <T extends string>(v: unknown, allowed: T[]): T | undefined =>
    typeof v === "string" && (allowed as string[]).includes(v) ? (v as T) : undefined;

  const appearance = section("appearance");
  if (appearance) {
    patch.appearance = clean({
      theme: pick(appearance.theme, THEME_VALUES),
      density: pick(appearance.density, DENSITY_VALUES),
      reduceMotion: bool(appearance.reduceMotion),
      largerText: bool(appearance.largerText),
    });
  }

  const messaging = section("messaging");
  if (messaging) {
    patch.messaging = clean({
      enterToSend: bool(messaging.enterToSend),
      mediaPreviews: bool(messaging.mediaPreviews),
      showTypingIndicators: bool(messaging.showTypingIndicators),
    });
  }

  const calls = section("calls");
  if (calls) {
    patch.calls = clean({
      joinMuted: bool(calls.joinMuted),
      joinCameraOff: bool(calls.joinCameraOff),
    });
  }

  const privacy = section("privacy");
  if (privacy) {
    patch.privacy = clean({
      shareReadReceipts: bool(privacy.shareReadReceipts),
      shareTyping: bool(privacy.shareTyping),
    });
  }

  return Object.keys(patch).length ? patch : null;
}

/** Drop keys whose value failed validation, so they fall through to the
 *  existing stored value rather than being written as undefined. */
function clean<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
