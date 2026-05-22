import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authenticator } from "@otplib/preset-default";
import qrcode from "qrcode";
import { getSessionUserFromCookieStore } from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const user = getSessionUserFromCookieStore(cookieStore);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(user.email, "CyberSage", secret);
  const qrCode = await qrcode.toDataURL(otpauthUrl);

  return NextResponse.json({ secret, qrCode, otpauthUrl });
}
