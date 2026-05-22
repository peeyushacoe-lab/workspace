import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/client";
import bcrypt from "bcrypt";

/**
 * SCIM 2.0 /Users endpoint.
 * Authentication: Bearer token in Authorization header (SCIM_BEARER_TOKEN env var).
 * Supports: GET (list/filter), POST (provision), PUT (replace), PATCH (update), DELETE (deprovision)
 */

function scimAuth(request: Request): boolean {
  const token = process.env.SCIM_BEARER_TOKEN;
  if (!token) return true; // No token configured — open (dev only)
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
    "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": {
      organization: "CyberSage",
      department: user.role,
    },
  };
}

export async function GET(request: Request) {
  if (!scimAuth(request)) return NextResponse.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: 401, detail: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const filter    = searchParams.get("filter") ?? "";
  const startIdx  = parseInt(searchParams.get("startIndex") ?? "1");
  const count     = Math.min(parseInt(searchParams.get("count") ?? "100"), 200);

  // Basic filter: userName eq "email@domain.com"
  const emailMatch = filter.match(/userName\s+eq\s+"([^"]+)"/i);

  const users = await prisma.user.findMany({
    where: emailMatch ? { email: emailMatch[1] } : {},
    orderBy: { createdAt: "asc" },
    take: count,
    skip: startIdx - 1,
  });

  const total = emailMatch ? users.length : await prisma.user.count();

  return NextResponse.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: total,
    startIndex: startIdx,
    itemsPerPage: count,
    Resources: users.map(toScimUser),
  });
}

export async function POST(request: Request) {
  if (!scimAuth(request)) return NextResponse.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: 401, detail: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    userName?: string;
    name?: { formatted?: string; givenName?: string; familyName?: string };
    emails?: Array<{ value: string; primary?: boolean }>;
    active?: boolean;
    externalId?: string;
    "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"?: { department?: string };
  };

  const email    = body.userName ?? body.emails?.find((e) => e.primary)?.value;
  const fullName = body.name?.formatted ?? [body.name?.givenName, body.name?.familyName].filter(Boolean).join(" ");

  if (!email || !fullName) {
    return NextResponse.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: 400, detail: "userName and name are required" }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) {
    return NextResponse.json({ schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"], status: 409, detail: "User already exists" }, { status: 409 });
  }

  const dept    = body["urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"]?.department;
  const role    = (dept && dept.toUpperCase() in UserRole) ? dept.toUpperCase() as UserRole : "DEVELOPER" as UserRole;
  const tmpPw   = await bcrypt.hash(`Scim@${Date.now()}`, 12);

  const user = await prisma.user.create({
    data: {
      email,
      fullName,
      passwordHash: tmpPw,
      role,
      isActive: body.active !== false,
      mustResetPassword: true,
    },
  });

  // Record SCIM sync
  await prisma.sCIMSync.upsert({
    where: { externalId: body.externalId ?? user.id },
    create: { externalId: body.externalId ?? user.id, userId: user.id, resourceType: "User", metadata: { source: "SCIM" } as object },
    update: { userId: user.id, lastSyncAt: new Date() },
  }).catch(() => {});

  return NextResponse.json(toScimUser(user), { status: 201 });
}
