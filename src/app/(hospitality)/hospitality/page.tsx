import { getCurrentUser } from "@/lib/session";
import { HospitalityHome } from "@/components/hospitality/HospitalityHome";

export const metadata = { title: "Dashboard" };

export default async function HospitalityPage() {
  const user = await getCurrentUser();
  const firstName = user?.fullName.split(/\s+/)[0] ?? "there";
  return <HospitalityHome firstName={firstName} />;
}
