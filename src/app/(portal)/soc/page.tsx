import { SOCView } from "@/components/SOCView";
import { PageHeader } from "@/components/Shell";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function SOCPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      <PageHeader
        eyebrow="Security Operations"
        title="SOC"
        description="Monitor and respond to security incidents, alerts, and threat events across the workspace."
      />
      <SOCView currentUserId={user.id} />
    </>
  );
}
