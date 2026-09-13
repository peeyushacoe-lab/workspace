import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function uniqueSlug(base: string, model: "organization" | "hotel") {
  let slug = slugify(base);
  let n = 1;
  while (true) {
    const existing = model === "organization"
      ? await prisma.organization.findUnique({ where: { slug }, select: { id: true } })
      : await prisma.hotelProperty.findFirst({ where: { slug }, select: { id: true } });
    if (!existing) return slug;
    slug = `${slugify(base)}-${n++}`;
  }
}

// ─── GET  /api/admin/hospitality/orgs ────────────────────────────────────────
export async function GET(_req: NextRequest) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const orgs = await prisma.organization.findMany({
    where: { hotelProperties: { some: {} } },
    orderBy: { createdAt: "desc" },
    include: {
      hotelProperties: {
        select: { id: true, name: true, city: true, country: true, starRating: true, totalRooms: true, currency: true, timezone: true, isDemo: true, createdAt: true },
      },
      _count: { select: { users: true } },
    },
  });

  return NextResponse.json({ orgs });
}

// ─── POST  /api/admin/hospitality/orgs ───────────────────────────────────────
// Creates: Organization + HotelProperty + first admin user + their mailbox
export async function POST(req: NextRequest) {
  const me = getSessionUserFromCookieStore(await cookies());
  if (!me || me.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const {
    // Org
    orgName, productType,
    // Hotel
    hotelName, city, country, starRating, totalRooms, currency, timezone, isDemo,
    // First user
    userName, userEmail, userPassword,
  } = body as {
    orgName: string; productType?: string;
    hotelName: string; city?: string; country?: string; starRating?: number;
    totalRooms?: number; currency?: string; timezone?: string; isDemo?: boolean;
    userName: string; userEmail: string; userPassword: string;
  };

  if (!orgName?.trim() || !hotelName?.trim() || !userName?.trim() || !userEmail?.trim() || !userPassword) {
    return NextResponse.json({ error: "orgName, hotelName, userName, userEmail, userPassword are required." }, { status: 400 });
  }

  const normalizedEmail = userEmail.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
  if (existing) return NextResponse.json({ error: "Email already in use." }, { status: 409 });

  const [orgSlug, hotelSlug, passwordHash] = await Promise.all([
    uniqueSlug(orgName, "organization"),
    uniqueSlug(hotelName, "hotel"),
    bcrypt.hash(userPassword, 12),
  ]);

  const result = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: orgName.trim(),
        slug: orgSlug,
        plan: "PRO",
        maxUsers: 50,
        settings: { orgType: productType ?? "HOSPITALITY" },
      },
    });

    const property = await tx.hotelProperty.create({
      data: {
        organizationId: org.id,
        name: hotelName.trim(),
        slug: hotelSlug,
        city: city?.trim() || null,
        country: country?.trim() || null,
        starRating: starRating ?? null,
        totalRooms: totalRooms ?? 0,
        currency: currency ?? "GBP",
        timezone: timezone ?? "UTC",
        isDemo: isDemo ?? false,
      },
    });

    const newUser = await tx.user.create({
      data: {
        email: normalizedEmail,
        fullName: userName.trim(),
        passwordHash,
        role: "OPS_MANAGER",
        orgRole: "OWNER",
        organizationId: org.id,
        company: orgName.trim(),
      },
    });

    await tx.mailbox.create({
      data: {
        email: normalizedEmail,
        displayName: userName.trim(),
        organizationId: org.id,
        accessLogs: { create: { userId: newUser.id, role: "OWNER" } },
      },
    });

    return { org, property, user: newUser };
  });

  return NextResponse.json({
    org:      { id: result.org.id, name: result.org.name, slug: result.org.slug },
    property: { id: result.property.id, name: result.property.name },
    user:     { id: result.user.id, email: result.user.email, fullName: result.user.fullName },
  }, { status: 201 });
}
