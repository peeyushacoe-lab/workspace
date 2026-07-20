import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Only these origins may receive an SSO token — prevents open-redirect attacks.
const ALLOWED_REDIRECT_ORIGINS = [
  "https://forage.cybersage.uk",
  "https://www.forage.cybersage.uk",
  "https://sage-range.vercel.app",
];

function isAllowedRedirect(uri: string): boolean {
  try {
    const { origin } = new URL(uri);
    return ALLOWED_REDIRECT_ORIGINS.includes(origin);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const secret = process.env.NEXUS_SSO_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: "SSO not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const redirectUri = searchParams.get("redirect_uri");

  if (!redirectUri || !isAllowedRedirect(redirectUri)) {
    return NextResponse.json({ error: "Invalid or missing redirect_uri" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const sessionUser = getSessionUserFromCookieStore(cookieStore);

  // Not logged in — send to login, then back here with redirect_uri intact
  if (!sessionUser) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname + "?" + searchParams.toString());
    return NextResponse.redirect(loginUrl);
  }

  // Fetch full user + mentor assignment
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      organizationId: true,
      createdAt: true,
      internAssignment: {
        select: { mentor: { select: { fullName: true } } },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const mentorName = user.internAssignment?.mentor?.fullName ?? null;

  // Cohort derived from account creation month (e.g. "July 2026")
  const cohort = user.createdAt.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const payload = {
    sub:          user.id,
    email:        user.email,
    name:         user.fullName,
    organization: "CyberSage",
    cohort,
    role:         user.role,
    ...(mentorName ? { mentor: mentorName } : {}),
  };

  // 5-minute expiry — receiver must exchange promptly
  const token = jwt.sign(payload, secret, { expiresIn: 300, algorithm: "HS256" });

  const dest = new URL(redirectUri);
  dest.searchParams.set("token", token);
  return NextResponse.redirect(dest.toString());
}
