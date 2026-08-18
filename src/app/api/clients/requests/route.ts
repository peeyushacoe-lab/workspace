import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission, can } from "@/lib/rbac/can";

// GET /api/clients/requests?view=inbox|raised|all&status=OPEN
//
// The cross-client view: "what has leadership asked me for", which is the queue
// a Business Manager actually works from. Without this the requests only exist
// inside individual client pages and nobody would find them.
export async function GET(req: NextRequest) {
  const auth = await requireApiPermission("clients.read");
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") ?? "inbox";
  const status = searchParams.get("status");

  const isAdmin = await can(user.id, "clients.admin");

  const where: Record<string, unknown> = {};
  if (status) {
    where.status = status;
  } else if (view === "inbox") {
    // Default to what still needs doing — a closed request is history.
    where.status = { in: ["OPEN", "ACKNOWLEDGED"] };
  }

  if (view === "raised") {
    where.raisedById = user.id;
  } else if (view === "inbox") {
    // Assigned to me, or on a client I own. The Ops Manager additionally sees
    // everything, since an unanswered request is theirs to chase.
    where.OR = isAdmin
      ? [{ assignedToId: user.id }, { client: { ownerId: user.id } }, { assignedToId: null }]
      : [{ assignedToId: user.id }, { client: { ownerId: user.id } }];
  }
  // view === "all": every request the viewer's read access covers.

  const requests = await prisma.clientRequest.findMany({
    where,
    orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      client: { select: { id: true, name: true, region: true } },
      raisedBy: { select: { id: true, fullName: true, avatarUrl: true, role: true } },
      assignedTo: { select: { id: true, fullName: true, avatarUrl: true } },
      _count: { select: { comments: true } },
    },
  });

  return NextResponse.json({ requests });
}
