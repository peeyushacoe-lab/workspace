import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = getSessionUserFromCookieStore(await cookies());
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  // Use || null so empty string "" (from ?folderId=) collapses to null (root)
  const folderId = searchParams.get("folderId") || null;
  const starred = searchParams.get("starred") === "true";
  const trashed = searchParams.get("trashed") === "true";
  const query = searchParams.get("q") ?? "";
  // ?all=true — return files across ALL folders (used by recent view)
  const all = searchParams.get("all") === "true";

  const files = await prisma.driveFile.findMany({
    where: {
      ownerId: user.id,
      isTrashed: trashed,
      ...(starred ? { isStarred: true } : {}),
      ...(query
        ? { name: { contains: query, mode: "insensitive" } }
        : all
          ? {}
          : { folderId }),
    },
    orderBy: { updatedAt: "desc" },
  });

  const fileEntries = files.map((f) => ({
    ...f,
    size: f.size.toString(),
    kind: "file" as const,
    href: null as string | null,
  }));

  // Merge in native Nexus docs / sheets / slides (stored as Notes with a marker)
  // so they appear in Drive like Google Docs/Sheets do in Google Drive. They live
  // at the Drive root (no DriveFolder) and open in their editor on click.
  const DOC_KINDS = [
    { marker: "document",     kind: "doc"   as const, mime: "application/vnd.nexus.document",     cls: "DOCUMENT",     href: (id: string) => `/docs?open=${id}` },
    { marker: "spreadsheet",  kind: "sheet" as const, mime: "application/vnd.nexus.spreadsheet",  cls: "SPREADSHEET",  href: (id: string) => `/apps/sheets/${id}` },
    { marker: "presentation", kind: "slide" as const, mime: "application/vnd.nexus.presentation", cls: "PRESENTATION", href: (id: string) => `/apps/slides/${id}` },
  ];
  // Native docs are root-level; only include them in root, "all", search or starred views.
  const includeDocs = !trashed && (all || query !== "" || starred || folderId === null);
  const notes = includeDocs
    ? await prisma.note.findMany({
        where: {
          userId: user.id,
          color: { in: DOC_KINDS.map((k) => k.marker) },
          ...(starred ? { pinned: true } : {}),
          ...(query ? { title: { contains: query, mode: "insensitive" } } : {}),
        },
        select: { id: true, title: true, color: true, pinned: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      })
    : [];
  const docEntries = notes.map((n) => {
    const k = DOC_KINDS.find((x) => x.marker === n.color) ?? DOC_KINDS[0];
    return {
      id: n.id,
      name: n.title || "Untitled",
      mimeType: k.mime,
      size: "0",
      folderId: null as string | null,
      ownerId: user.id,
      organizationId: null as string | null,
      storageKey: "",
      storageUrl: null as string | null,
      previewUrl: null as string | null,
      description: null as string | null,
      ocrText: null as string | null,
      classification: k.cls,
      aiSummary: null as string | null,
      isDuplicate: false,
      duplicateOfId: null as string | null,
      sensitivityLevel: null as string | null,
      isStarred: n.pinned,
      isTrashed: false,
      trashedAt: null as Date | null,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      kind: k.kind,
      href: k.href(n.id),
    };
  });

  return NextResponse.json([...docEntries, ...fileEntries]);
}
