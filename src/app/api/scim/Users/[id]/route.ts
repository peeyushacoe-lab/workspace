import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

function scimAuth(request: Request): boolean {
  const token = process.env.SCIM_BEARER_TOKEN;
  if (!token) return true;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${token}`;
}

function toScimUser(user: { id: string; email: string; fullName: string; role: string; isActive: boolean; createdAt: Date }) {
  const [givenName, ...rest] = user.fullName.split(" ");
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: user.id,
    externalId: user.id,
    userName: user.email,
    name: { formatted: user.fullName, givenName: givenName ?? "", familyName: rest.join(" ") },
    emails: [{ value: user.email, primary: true, type: "work" }],
    active: user.isActive,
    meta: {
      resourceType: "User",
      created: user.createdAt.toISOString(),
      location: `/api/scim/Users/${user.id}`,
    },
  };
}

export async function GET(request: Request, { params }: Params) {
  if (!scimAuth(request)) return NextResponse.json({ status: 401, detail: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const user = await prisma.user.findFirst({ where: { id } });
  if (!user) return NextResponse.json({ status: 404, detail: "Not found" }, { status: 404 });
  return NextResponse.json(toScimUser(user));
}

export async function PUT(request: Request, { params }: Params) {
  if (!scimAuth(request)) return NextResponse.json({ status: 401, detail: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const user = await prisma.user.findFirst({ where: { id } });
  if (!user) return NextResponse.json({ status: 404, detail: "Not found" }, { status: 404 });

  const body = await request.json() as {
    active?: boolean;
    name?: { formatted?: string; givenName?: string; familyName?: string };
  };

  const nameParts = [body.name?.givenName, body.name?.familyName].filter(Boolean).join(" ");
  const fullName = body.name?.formatted ?? (nameParts || user.fullName);
  const updated = await prisma.user.update({
    where: { id },
    data: {
      fullName,
      isActive: body.active !== undefined ? body.active : user.isActive,
    },
  });

  await prisma.sCIMSync.upsert({
    where: { externalId: id },
    create: { externalId: id, userId: id, resourceType: "User", metadata: { source: "SCIM" } as object },
    update: { lastSyncAt: new Date() },
  }).catch(() => {});

  return NextResponse.json(toScimUser(updated));
}

export async function PATCH(request: Request, { params }: Params) {
  if (!scimAuth(request)) return NextResponse.json({ status: 401, detail: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const user = await prisma.user.findFirst({ where: { id } });
  if (!user) return NextResponse.json({ status: 404, detail: "Not found" }, { status: 404 });

  const body = await request.json() as { Operations?: Array<{ op: string; path?: string; value: unknown }> };

  const updates: Record<string, unknown> = {};
  for (const op of body.Operations ?? []) {
    if (op.op.toLowerCase() === "replace") {
      if (op.path === "active" || op.path === "Active") updates.isActive = op.value;
      if (!op.path && typeof op.value === "object" && op.value !== null) {
        const val = op.value as Record<string, unknown>;
        if ("active" in val) updates.isActive = val.active;
      }
    }
  }

  const updated = await prisma.user.update({ where: { id }, data: updates as never });
  return NextResponse.json(toScimUser(updated));
}

export async function DELETE(request: Request, { params }: Params) {
  if (!scimAuth(request)) return NextResponse.json({ status: 401, detail: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const user = await prisma.user.findFirst({ where: { id } });
  if (!user) return NextResponse.json({ status: 404, detail: "Not found" }, { status: 404 });

  // Deprovision = deactivate, not hard-delete (preserve audit trail)
  await prisma.user.update({ where: { id }, data: { isActive: false } });
  return new NextResponse(null, { status: 204 });
}
