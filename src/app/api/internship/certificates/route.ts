import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;
const PERSON_SELECT = { id: true, fullName: true, avatarUrl: true } as const;

function isMentor(role: string) {
  return (MENTOR_ROLES as readonly string[]).includes(role);
}

function generateSerial(): string {
  const year = new Date().getUTCFullYear();
  const rand = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
  return `CS-${year}-${rand}`;
}

// GET /api/internship/certificates            → intern: my certificates
// GET /api/internship/certificates?internId=… → mentor: that intern's certificates
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  let internId = searchParams.get("internId");

  if (user.role === "INTERNSHIP") internId = user.id;
  else if (!isMentor(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!internId) return NextResponse.json({ error: "internId required" }, { status: 400 });

  const certificates = await prisma.internCertificate.findMany({
    where: { internId },
    include: { issuedBy: { select: PERSON_SELECT }, intern: { select: PERSON_SELECT } },
    orderBy: { issuedAt: "desc" },
  });
  return NextResponse.json({ certificates });
}

// POST /api/internship/certificates — { internId, title, grade? } (mentors only)
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isMentor(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body?.internId || !body?.title) {
    return NextResponse.json({ error: "internId and title required" }, { status: 400 });
  }

  const intern = await prisma.user.findFirst({
    where: { id: body.internId, role: "INTERNSHIP" },
    select: { id: true, fullName: true },
  });
  if (!intern) return NextResponse.json({ error: "Intern not found" }, { status: 404 });

  const created = await prisma.internCertificate.create({
    data: {
      internId: intern.id,
      issuedById: user.id,
      title: String(body.title).slice(0, 200),
      grade: typeof body.grade === "string" && body.grade ? body.grade.slice(0, 40) : null,
      serial: generateSerial(),
    },
    include: { issuedBy: { select: PERSON_SELECT }, intern: { select: PERSON_SELECT } },
  });

  await prisma.notification
    .create({
      data: {
        userId: intern.id,
        type: "SYSTEM",
        title: "Certificate issued",
        body: `You've been awarded: ${created.title}`,
        link: "/internship",
      },
    })
    .catch(() => {});

  return NextResponse.json(created, { status: 201 });
}

// DELETE /api/internship/certificates?id=… — issuer or ADMIN
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isMentor(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const cert = await prisma.internCertificate.findUnique({ where: { id } });
  if (!cert) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (cert.issuedById !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.internCertificate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
