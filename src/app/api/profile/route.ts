import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const updateProfileSchema = z.object({
  fullName: z.string().min(1).optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8).optional(),
  confirmPassword: z.string().min(8).optional(),
});

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    id: currentUser.id,
    email: currentUser.email,
    fullName: currentUser.fullName,
    role: currentUser.role,
  });
}

export async function PUT(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = updateProfileSchema.parse(body);

    const updateData: { fullName?: string; passwordHash?: string } = {};

    if (validatedData.fullName) {
      updateData.fullName = validatedData.fullName;
    }

    if (validatedData.newPassword) {
      if (!validatedData.currentPassword) {
        return NextResponse.json(
          { error: "Current password is required to change your password." },
          { status: 400 },
        );
      }

      if (validatedData.newPassword !== validatedData.confirmPassword) {
        return NextResponse.json(
          { error: "New password and confirmation do not match." },
          { status: 400 },
        );
      }

      const user = await prisma.user.findUnique({
        where: { id: currentUser.id },
        select: { passwordHash: true },
      });

      if (!user || !user.passwordHash) {
        return NextResponse.json({ error: "User password not available." }, { status: 400 });
      }

      const validPassword = await bcrypt.compare(validatedData.currentPassword, user.passwordHash);
      if (!validPassword) {
        return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
      }

      updateData.passwordHash = await bcrypt.hash(validatedData.newPassword, 12);
    }

    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: updateData,
      select: { id: true, email: true, fullName: true, role: true, updatedAt: true },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: error.issues }, { status: 400 });
    }

    console.error("Update profile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
