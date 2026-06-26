import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { signPayload } from "@/lib/session-crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import bcrypt from "bcrypt";
import { z } from "zod";

const schema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed, retryAfter } = await checkRateLimit(`reset-pwd:${user.id}`, 5, 15 * 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later.", retryAfter }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { currentPassword, newPassword } = schema.parse(body);

    // Forced reset (invited user setting password for first time) — skip current password check.
    // For voluntary changes, verify the current password first.
    if (!user.mustResetPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Current password is required" }, { status: 400 });
      }
      const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
      const currentValid = dbUser?.passwordHash ? await bcrypt.compare(currentPassword, dbUser.passwordHash) : false;
      if (!currentValid) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
      }
    }

    const hashed = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashed, mustResetPassword: false },
    });

    // Re-issue the signed user cookie with mustResetPassword cleared
    const updatedUser = { ...user, mustResetPassword: false };
    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    };

    // New users (forced reset) must set up a passkey before accessing the app
    const isForcedReset = user.mustResetPassword;
    const redirectTo = isForcedReset ? "/setup-passkey" : "/inbox";

    const response = NextResponse.json({ success: true, redirectTo });
    response.cookies.set("cybersage_user", signPayload(JSON.stringify(updatedUser)), cookieOptions);

    if (isForcedReset) {
      // Gate cookie — middleware blocks portal access until passkey is registered
      response.cookies.set("pending_mfa_setup", "1", {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 30, // 30 min to complete setup
      });
    }

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
    }
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
