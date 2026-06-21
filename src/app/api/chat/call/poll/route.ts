import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import {
  getActiveCall,
  getCallResult,
  getPending,
} from "@/lib/call-signaling";

export const dynamic = "force-dynamic";

// Polling fallback for call signaling — reliable on serverless where Redis
// pub/sub → SSE delivery isn't guaranteed.
//   incoming: the call currently ringing this user (callee view)
//   outgoing: the result of the caller's own call when ?callId= is supplied
export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const callId = new URL(request.url).searchParams.get("callId");

  // ── Outgoing: has the caller's call been answered / ended? ────────────────
  let outgoing: { status: string } | null = null;
  if (callId) {
    const result = await getCallResult(callId);
    if (result) {
      outgoing = { status: result };
    } else {
      const active = await getActiveCall(callId);
      outgoing = { status: active ? "ringing" : "ended" };
    }
  }

  // ── Incoming: is a call ringing this user right now? ──────────────────────
  let incoming = null;
  const pendingCallId = await getPending(user.id);
  if (pendingCallId) {
    const call = await getActiveCall(pendingCallId);
    const result = await getCallResult(pendingCallId);
    if (call && !result && call.caller.id !== user.id && call.participantIds.includes(user.id)) {
      incoming = call;
    }
  }

  return Response.json({ incoming, outgoing });
}
