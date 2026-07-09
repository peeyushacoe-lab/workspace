import { NextResponse } from "next/server";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getAttachmentUrl } from "@/lib/s3";

const MENTOR_ROLES = ["ADMIN", "CEO", "CISO", "R_AND_D", "COO", "OPS_MANAGER"] as const;

type SubmissionFile = {
  name?: string;
  key?: string;
  url?: string | null;
  type?: string;
  ext?: string;
  size?: number;
};

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !MENTOR_ROLES.includes(user.role as typeof MENTOR_ROLES[number])) {
    return NextResponse.json({ error: "Mentors only" }, { status: 403 });
  }

  const { id } = await params;

  const task = await prisma.internTask.findUnique({
    where: { id },
    select: {
      title: true,
      submissions: {
        select: {
          id: true,
          version: true,
          files: true,
          submitter: { select: { fullName: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const zip = new JSZip();
  let fileCount = 0;

  for (const sub of task.submissions) {
    const files = (sub.files ?? []) as SubmissionFile[];
    if (!files.length) continue;

    // Folder per submitter + version
    const folderName = `${sub.submitter.fullName.replace(/[^a-zA-Z0-9 _-]/g, "_")}_v${sub.version}`;
    const folder = zip.folder(folderName)!;

    for (const file of files) {
      if (!file.key && !file.url) continue;

      try {
        // Prefer signed R2 URL for keys, fall back to stored url
        const fetchUrl = file.key
          ? await getAttachmentUrl(file.key)
          : (file.url as string);

        const response = await fetch(fetchUrl);
        if (!response.ok) continue;

        const bytes = await response.arrayBuffer();
        const fileName = file.name ?? `file_${fileCount + 1}`;
        folder.file(fileName, bytes);
        fileCount++;
      } catch {
        // Skip files that fail to download
      }
    }
  }

  if (fileCount === 0) {
    return NextResponse.json({ error: "No downloadable files found" }, { status: 404 });
  }

  const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
  const safeName = task.title.replace(/[^a-zA-Z0-9 _-]/g, "_").slice(0, 60);
  const blob = new Blob([zipBuffer], { type: "application/zip" });

  return new Response(blob, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName}-submissions.zip"`,
    },
  });
}
