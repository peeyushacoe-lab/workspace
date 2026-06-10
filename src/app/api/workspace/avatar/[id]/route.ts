import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Avatar endpoint is intentionally public — profile photos are not sensitive
  // and must be accessible by email clients (Gmail, Outlook) without auth.

  const { id } = await params;
  const target = await prisma.user.findUnique({
    where: { id },
    select: { avatarUrl: true },
  });

  if (!target?.avatarUrl) {
    return new NextResponse(null, { status: 404 });
  }

  const avatarUrl = target.avatarUrl;

  // If stored as a base64 data URL, extract and serve as image
  const dataUrlMatch = avatarUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1];
    const base64Data = dataUrlMatch[2];
    const buffer = Buffer.from(base64Data, "base64");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
      },
    });
  }

  // Regular URL (e.g. signed S3/R2) — proxy the image content so email clients
  // (Gmail, Outlook) get a direct image response instead of following a redirect
  // to a URL that may have CORS restrictions or expired signatures.
  try {
    const upstream = await fetch(avatarUrl);
    if (!upstream.ok) return new NextResponse(null, { status: 404 });
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    const buffer = await upstream.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
