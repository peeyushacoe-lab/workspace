import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { signPayload } from "@/lib/session-crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import bcrypt from "bcrypt";
import { z } from "zod";

const schema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
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
    const { newPassword } = schema.parse(body);

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

    const response = NextResponse.json({ success: true, redirectTo: "/inbox" });
    response.cookies.set("cybersage_user", signPayload(JSON.stringify(updatedUser)), cookieOptions);
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
    }
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
