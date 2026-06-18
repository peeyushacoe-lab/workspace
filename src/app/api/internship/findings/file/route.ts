import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getAttachmentUrl, isS3Configured } from "@/lib/s3";

const HUB_ROLES = ["INTERNSHIP", "ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"];

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

  // Key must belong to intern-findings prefix to prevent path traversal
  if (!key.startsWith("intern-findings/")) {
    return NextResponse.json({ error: "Invalid key" }, { status: 403 });
  }

  if (!isS3Configured()) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }

  const filename = key.split("/").pop() ?? "file";
  const inline = searchParams.get("inline") === "1";
  const signedUrl = await getAttachmentUrl(key, filename, inline);
  return NextResponse.redirect(signedUrl, { status: 302 });
}
