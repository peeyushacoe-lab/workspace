import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { applyCallSignal, type CallAction } from "@/lib/call-service";

export const dynamic = "force-dynamic";

// Every state transition after the initial ring (accept/decline/cancel/end).
export async function POST(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { callId?: string; action?: CallAction };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.callId || !body.action) {
    return Response.json({ error: "callId and action required" }, { status: 400 });
  }

  const result = await applyCallSignal({ callId: body.callId, userId: user.id, action: body.action });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status ?? 400 });
  }
  return Response.json({ ok: true, stale: result.stale ?? false });
}
