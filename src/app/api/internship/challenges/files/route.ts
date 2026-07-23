import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getAttachmentUrl } from "@/lib/s3";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;
const HUB_ROLES = ["INTERNSHIP", ...MENTOR_ROLES] as const;

// Download proxy for challenge submission files uploaded via
// .../submissions/upload. The R2 key itself is only ever handed to a client
// inside an already-permission-checked submission payload (challenges/[id]
// GET redacts submissions for teams the viewer isn't on — see ChallengesPanel
// visibility model), so any signed-in Intern Hub user reaching this route with
// a valid key is, by construction, someone the key was already shown to.
export async function GET(request: Request) {
  const session = await getCurrentUser();
  if (!session || !HUB_ROLES.includes(session.role as typeof HUB_ROLES[number])) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const name = searchParams.get("name") ?? undefined;
  if (!key || !key.startsWith("challenges/")) {
    return NextResponse.json({ error: "Invalid file key" }, { status: 400 });
  }

  try {
    const signedUrl = await getAttachmentUrl(key, name);
    return NextResponse.redirect(signedUrl);
  } catch {
    return NextResponse.json({ error: "File not found or storage unavailable" }, { status: 404 });
  }
}
