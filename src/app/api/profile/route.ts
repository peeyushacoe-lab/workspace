import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const profileFields = z.object({
  // Identity
  fullName:       z.string().min(1).max(120).optional(),
  displayName:    z.string().max(60).optional(),
  bio:            z.string().max(500).optional(),
  jobTitle:       z.string().max(100).optional(),
  company:        z.string().max(100).optional(),
  department:     z.string().max(100).optional(),
  phone:          z.string().max(40).optional(),
  website:        z.string().max(200).url().or(z.literal("")).optional(),
  location:       z.string().max(120).optional(),
  timezone:       z.string().max(60).optional(),
  language:       z.string().max(10).optional(),
  pronouns:       z.string().max(40).optional(),
  birthday:       z.string().optional(), // ISO date string
  statusMessage:  z.string().max(140).optional(),
  statusEmoji:    z.string().max(10).optional(),
  avatarUrl:      z.string().max(500).optional(),
  coverUrl:       z.string().max(500).optional(),
  // Password change
  currentPassword: z.string().min(1).optional(),
  newPassword:     z.string().min(8).optional(),
  confirmPassword: z.string().min(8).optional(),
  // Persisted preferences (freeform JSON)
  preferences:     z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: {
      id: true, email: true, fullName: true, role: true, customRole: true,
      displayName: true, bio: true, jobTitle: true, company: true,
      department: true, phone: true, website: true, location: true,
      timezone: true, language: true, pronouns: true, birthday: true,
      statusMessage: true, statusEmoji: true, avatarUrl: true, coverUrl: true,
      preferences: true, mfaEnabled: true, createdAt: true,
    },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json(user);
}

export async function PUT(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const data = profileFields.parse(body);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};

    const plainFields = [
      "fullName","displayName","bio","jobTitle","company","department",
      "phone","website","location","timezone","language","pronouns",
      "statusMessage","statusEmoji","avatarUrl","coverUrl",
    ] as const;

    for (const field of plainFields) {
      if (data[field] !== undefined) updateData[field] = data[field];
    }

    if (data.birthday !== undefined) {
      updateData.birthday = data.birthday ? new Date(data.birthday) : null;
    }

    if (data.preferences !== undefined) {
      updateData.preferences = data.preferences;
    }

    // Password change
    if (data.newPassword) {
      if (!data.currentPassword) {
        return NextResponse.json({ error: "Current password required" }, { status: 400 });
      }
      if (data.newPassword !== data.confirmPassword) {
        return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
      }
      const user = await prisma.user.findUnique({
        where: { id: currentUser.id },
        select: { passwordHash: true },
      });
      if (!user?.passwordHash) {
        return NextResponse.json({ error: "Password not set" }, { status: 400 });
      }
      const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
      if (!valid) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
      }
      updateData.passwordHash = await bcrypt.hash(data.newPassword, 12);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: currentUser.id },
      data: updateData,
      select: {
        id: true, email: true, fullName: true, role: true, customRole: true,
        displayName: true, bio: true, jobTitle: true, company: true,
        department: true, phone: true, website: true, location: true,
        timezone: true, language: true, pronouns: true, birthday: true,
        statusMessage: true, statusEmoji: true, avatarUrl: true, coverUrl: true,
        preferences: true, updatedAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: err.issues }, { status: 400 });
    }
    console.error("[profile PUT]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
