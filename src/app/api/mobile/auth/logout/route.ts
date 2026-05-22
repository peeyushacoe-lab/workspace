import { NextResponse } from "next/server";
import { getMobileUser } from "@/lib/mobile-auth";

export async function POST(request: Request) {
  const user = await getMobileUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Refresh token revocation handled client-side (delete from secure store).
  // For server-side revocation, clients should also call this to clear sessions.
  return NextResponse.json({ ok: true });
}
