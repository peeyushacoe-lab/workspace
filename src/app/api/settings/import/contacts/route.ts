import { NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// POST /api/settings/import/contacts
// Accepts a Google Takeout "Contacts" CSV export (multipart/form-data, field "file").
// Google's export uses headers like "First Name", "Last Name", "E-mail 1 - Value" —
// we match loosely so exports from other providers with similarly-named columns work too.
export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (10 MB max)" }, { status: 400 });
  }

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const emailCol = headers.find((h) => /^e-?mail\s*1?\s*-?\s*value$/i.test(h)) ?? headers.find((h) => /e-?mail/i.test(h));
  const firstCol = headers.find((h) => /^first name$/i.test(h));
  const lastCol = headers.find((h) => /^last name$/i.test(h));
  const nameCol = headers.find((h) => /^name$/i.test(h));

  if (!emailCol) {
    return NextResponse.json({ error: "Could not find an email column in this CSV" }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of parsed.data) {
    const email = row[emailCol]?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      skipped++;
      continue;
    }
    const name =
      (nameCol && row[nameCol]?.trim()) ||
      [firstCol && row[firstCol]?.trim(), lastCol && row[lastCol]?.trim()].filter(Boolean).join(" ").trim() ||
      email;

    try {
      const existing = await prisma.contact.findUnique({ where: { email } });
      if (existing) {
        await prisma.contact.update({ where: { email }, data: { name } });
        updated++;
      } else {
        await prisma.contact.create({ data: { name, email, status: "imported" } });
        created++;
      }
    } catch (err) {
      errors.push(`${email}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return NextResponse.json({ ok: true, created, updated, skipped, errors: errors.slice(0, 20) });
}
