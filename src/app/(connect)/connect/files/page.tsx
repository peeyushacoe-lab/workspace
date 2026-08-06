import { cookies } from "next/headers";
import { getSessionUserFromCookieStore } from "@/lib/auth";
import { DriveView } from "@/components/DriveView";

/**
 * Files inside Connect.
 *
 * Deliberately Nexus Drive, not a Connect file store. A file attached to a
 * message and a file uploaded to Drive are the same file — duplicating storage
 * would double the R2 bill and make permissions answer differently depending on
 * which product you asked.
 */
export default async function ConnectFilesPage() {
  const user = getSessionUserFromCookieStore(await cookies());
  return <DriveView currentUserId={user!.id} />;
}
