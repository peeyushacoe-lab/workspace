import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { redis } from "@/lib/redis";

export async function DELETE() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await redis.hdel("push:subscriptions", user.id);

  return NextResponse.json({ ok: true });
}
