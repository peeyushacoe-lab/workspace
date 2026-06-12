import { notFound } from "next/navigation";
import { Lock as LockIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getAttachmentUrl } from "@/lib/s3";
import { ShareFileViewer } from "@/components/ShareFileViewer";

type Props = { params: Promise<{ token: string }> };

export default async function SharePage({ params }: Props) {
  const { token } = await params;

  // Look up the permission
  const permission = await prisma.drivePermission.findUnique({
    where: { token },
  });

  if (!permission) return notFound();

  // Check expiry
  if (permission.expiresAt && permission.expiresAt < new Date()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="rounded-xl border border-[#e8eaed] bg-white p-10 text-center max-w-md">
          <LockIcon className="mx-auto mb-3 h-7 w-7 text-[#9aa0a6]" />
          <h1 className="text-xl font-semibold text-[#202124] mb-2">Link expired</h1>
          <p className="text-sm text-[#5f6368]">This share link has expired. Ask the owner for a new link.</p>
        </div>
      </div>
    );
  }

  if (!permission.fileId) return notFound();

  const file = await prisma.driveFile.findUnique({ where: { id: permission.fileId } });
  if (!file || file.isTrashed) return notFound();

  let downloadUrl: string | null = null;
  try {
    downloadUrl = await getAttachmentUrl(file.storageKey);
  } catch {
    // storage not configured
  }

  const fileData = {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: Number(file.size),
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
    downloadUrl,
    role: permission.role,
  };

  return <ShareFileViewer file={fileData} />;
}
