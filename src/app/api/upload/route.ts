import { NextResponse } from "next/server";
import { parseContactsCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { canAccessPath } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canAccessPath(currentUser, "/contacts")) {
    return NextResponse.json(
      { contacts: [], errors: ["Unauthorized"] },
      { status: currentUser ? 403 : 401 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { contacts: [], errors: ["Upload a CSV file."] },
      { status: 400 },
    );
  }

  const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB
  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json(
      { contacts: [], errors: ["File too large. Maximum size is 5 MB."] },
      { status: 413 },
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "csv") {
    return NextResponse.json(
      { contacts: [], errors: ["Only .csv files are accepted."] },
      { status: 400 },
    );
  }

  const csv = await file.text();
  const { contacts, errors } = parseContactsCsv(csv);

  if (process.env.DATABASE_URL && contacts.length) {
    await Promise.all(
      contacts.map((contact) =>
        prisma.contact.upsert({
          where: { email: contact.email },
          update: {
            name: contact.name,
            status: contact.status,
            metadata: {
              interviewDate: contact.interviewDate,
              customMessage: contact.customMessage,
            },
          },
          create: {
            name: contact.name,
            email: contact.email,
            status: contact.status,
            metadata: {
              interviewDate: contact.interviewDate,
              customMessage: contact.customMessage,
            },
          },
        }),
      ),
    );
  }

  return NextResponse.json({ contacts, errors });
}
