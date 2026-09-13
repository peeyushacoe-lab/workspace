import { AlertDetail } from "@/components/hospitality/AlertDetail";

export const metadata = { title: "Alert · Hospitality · Nexus" };

export default async function HospitalityAlertDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AlertDetail alertId={id} />;
}
