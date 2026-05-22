import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/drive/files/shared — files shared with the current user via DrivePermission
export async function GET() {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  // Find permissions where userId = user.id OR email = user.email, with a linked file
  const permissions = await prisma.drivePermission.findMany({
    where: {
      fileId: { not: null },
      AND: [
        {
          OR: [
            { userId: user.id },
            { email: user.email },
          ],
        },
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: now } },
          ],
        },
      ],
    },
    include: {
      file: true,
    },
  });

  const files = permissions
    .map((p) => p.file)
    .filter(
      (f): f is NonNullable<typeof f> =>
        f !== null && !f.isTrashed && f.ownerId !== user.id
    );

  // Deduplicate by file id
  const seen = new Set<string>();
  const unique = files.filter((f) => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });

  return NextResponse.json(unique.map((f) => ({ ...f, size: f.size.toString() })));
}
