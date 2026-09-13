import { redirect } from "next/navigation";

// Hospitality org management moved into the main /admin console (Hospitality Orgs tab).
export default function HospitalityAdminPage() {
  redirect("/admin");
}
