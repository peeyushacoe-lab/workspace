import { notFound } from "next/navigation";
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
      <div className="flex min-h-screen items-center justify-center bg-[#0f1321]">
        <div className="rounded-xl border border-[rgba(0,255,255,0.08)] bg-[#1b1f2e] p-10 text-center max-w-md">
          <p className="text-2xl mb-2">🔒</p>
          <h1 className="text-xl font-semibold text-[#dfe1f6] mb-2">Link expired</h1>
          <p className="text-sm text-[#bbc9cf]">This share link has expired. Ask the owner for a new link.</p>
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
