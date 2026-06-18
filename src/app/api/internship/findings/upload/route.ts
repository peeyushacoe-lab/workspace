import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { uploadToR2, isS3Configured } from "@/lib/s3";

const HUB_ROLES = ["INTERNSHIP", "ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"];

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !HUB_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (!ALLOWED_TYPES[file.type]) {
    return NextResponse.json({ error: "Only PDF and Word (.doc/.docx) files are allowed" }, { status: 400 });
  }

  const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large — maximum 20 MB" }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[file.type];
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  const key = `intern-findings/${user.id}/${Date.now()}-${safeName}`;

  if (!isS3Configured()) {
    // Dev fallback — no R2 configured, return stub so the form still works
    return NextResponse.json({
      key,
      name: file.name,
      type: file.type,
      ext,
      size: file.size,
      url: null,
    });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  await uploadToR2(buf, key, file.type);

  return NextResponse.json({
    key,
    name: file.name,
    type: file.type,
    ext,
    size: file.size,
    url: `/api/internship/findings/file?key=${encodeURIComponent(key)}`,
  });
}
