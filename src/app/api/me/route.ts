import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const user = getSessionUserFromCookieStore(cookieStore);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    mfaEnabled: user.mfaEnabled,
    organizationId: user.organizationId,
  });
}
