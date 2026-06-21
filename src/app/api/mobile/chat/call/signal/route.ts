import { NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";
import { applyCallSignal, type CallAction } from "@/lib/call-service";

export const dynamic = "force-dynamic";

// Mobile (JWT-authed) call signaling: accept / decline / cancel / end.
export async function POST(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { callId?: string; action?: CallAction };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.callId || !body.action) {
    return NextResponse.json({ error: "callId and action required" }, { status: 400 });
  }

  const result = await applyCallSignal({ callId: body.callId, userId: user.userId, action: body.action });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ ok: true, stale: result.stale ?? false });
}
