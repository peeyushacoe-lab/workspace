import { redirect } from "next/navigation";

// The demo "Operations" snapshot is superseded by the live room board and
// housekeeping queue. Kept as a redirect so old links still land somewhere real.
export default function HospitalityOperationsPage() {
  redirect("/hospitality/rooms");
}
