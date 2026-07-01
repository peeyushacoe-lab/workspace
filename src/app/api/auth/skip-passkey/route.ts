import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set("pending_mfa_setup", "", { maxAge: 0, path: "/" });
  return response;
}
