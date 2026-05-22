import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const updateSchema = z.object({
  fullName: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  phone: z.string().trim().optional(),
  linkedinUrl: z.string().trim().optional(),
  website: z.string().trim().optional(),
  html: z.string().trim().optional(),
  plainText: z.string().trim().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = updateSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json(
      { error: "Invalid data", details: payload.error.issues },
      { status: 400 }
    );
  }

  const { id } = await params;

  // Check if signature exists and belongs to current user
  const existingSignature = await prisma.signature.findFirst({
    where: {
      id,
      userId: currentUser.id,
    },
  });

  if (!existingSignature) {
    return NextResponse.json({ error: "Signature not found" }, { status: 404 });
  }



  const signature = await prisma.signature.update({
    where: { id },
    data: payload.data,
  });

  return NextResponse.json(signature);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Check if signature exists and belongs to current user
  const existingSignature = await prisma.signature.findFirst({
    where: {
      id,
      userId: currentUser.id,
    },
  });

  if (!existingSignature) {
    return NextResponse.json({ error: "Signature not found" }, { status: 404 });
  }

  await prisma.signature.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
