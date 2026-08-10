import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { getCurrentUser } from "@/lib/session";
import { indexingQueue } from "@/lib/queues/indexing.queue";
import { deactivateUser, purgeUser, checkPurgeBlockers } from "@/lib/users/offboard";
import { wouldCreateReportingCycle } from "@/lib/reporting-line";
import type { UserRole } from "@/generated/prisma/enums";

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "CEO", "CISO", "MARKETING", "INTERNSHIP", "R_AND_D"]).optional(),
  password: z.string().min(8).optional(),
  /**
   * Reporting line. `null` clears it; a string sets it. `.nullable()` matters —
   * without it there is no way to express "this person no longer reports to
   * anyone", since an omitted key means "leave unchanged".
   */
  managerId: z.string().nullable().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
        signature: {
          select: {
            id: true,
            fullName: true,
            title: true,
            phone: true,
            linkedinUrl: true,
            website: true,
            html: true,
          }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = updateUserSchema.parse(body);
    const { id } = await params;

    const updateData: {
      fullName?: string;
      role?: UserRole;
      passwordHash?: string;
      managerId?: string | null;
    } = {};
    if (validatedData.name) updateData.fullName = validatedData.name;
    if (validatedData.role) updateData.role = validatedData.role;
    if (validatedData.password) {
      updateData.passwordHash = await bcrypt.hash(validatedData.password, 12);
    }

    // Reporting line. `undefined` = not being changed; `null` = being cleared.
    if (validatedData.managerId !== undefined) {
      const managerId = validatedData.managerId;

      if (managerId === null) {
        updateData.managerId = null;
      } else {
        // Validated server-side, not just in the picker UI. A cycle (A→B→A) makes
        // any code that walks the chain — org charts, approval routing — loop
        // forever, and the DB can only CHECK the one-hop self-management case.
        const manager = await prisma.user.findUnique({
          where: { id: managerId },
          select: { id: true, isActive: true },
        });
        if (!manager || !manager.isActive) {
          return NextResponse.json({ error: "Manager not found" }, { status: 400 });
        }
        if (await wouldCreateReportingCycle(id, managerId)) {
          return NextResponse.json(
            { error: "That would create a reporting loop — this person is already above them." },
            { status: 400 },
          );
        }
        updateData.managerId = managerId;
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
        managerId: true,
        manager: { select: { id: true, fullName: true } },
      }
    });

    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: error.issues }, { status: 400 });
    }

    console.error("Update user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Removing a user.
 *
 * The default is now **deactivation**, not deletion. `prisma.user.delete()`
 * cascades through `ChatMessage.user`, so the old behaviour erased every
 * message the person ever wrote from every conversation — a departing employee
 * took half of every thread they'd ever participated in with them, for
 * everyone. It also cascaded `LegalHold`, destroying the records placed
 * specifically to prevent destruction.
 *
 * Irreversible erasure is still available for a right-to-be-forgotten request,
 * but it has to be asked for explicitly (`?mode=purge`), it refuses while a
 * legal hold is active, and it requires the account to be deactivated first.
 * See src/lib/users/offboard.ts.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    const mode = new URL(request.url).searchParams.get("mode");

    // Prevent removing your own account
    if (id === currentUser.id) {
      return NextResponse.json({ error: "Cannot remove your own account" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { role: true, isActive: true, fullName: true },
    });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (mode !== "purge") {
      // Don't allow removing the last admin (would lock everyone out of admin).
      if (target.role === "ADMIN") {
        const adminCount = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
        if (adminCount <= 1) {
          return NextResponse.json({ error: "Cannot deactivate the last admin account" }, { status: 400 });
        }
      }
      if (!target.isActive) {
        return NextResponse.json({ error: "That account is already deactivated" }, { status: 409 });
      }

      const result = await deactivateUser(id, currentUser.id);
      indexingQueue.add("deindex-person", { type: "DEINDEX", resource: "person", resourceId: id }).catch(() => {});
      return NextResponse.json({
        success: true,
        mode: "deactivated",
        message: `${target.fullName}'s access has been revoked. Their messages and files remain intact.`,
        ...result,
      });
    }

    const blocker = await checkPurgeBlockers(id);
    if (blocker) {
      return NextResponse.json({ error: blocker.reason }, { status: 409 });
    }

    await purgeUser(id, currentUser.id);
    indexingQueue.add("deindex-person", { type: "DEINDEX", resource: "person", resourceId: id }).catch(() => {});

    return NextResponse.json({ success: true, mode: "purged" });
  } catch (error) {
    console.error("Remove user error:", error);
    return NextResponse.json(
      { error: "Could not remove this user — they may own records that block deletion." },
      { status: 500 },
    );
  }
}
