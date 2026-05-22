import { redirect } from "next/navigation";

// SOC/security operations moved to CyberSage Sentinel.
// Workspace surfaces security verdicts inline (phishing banners, DLP warnings).
export default function SOCPage() {
  redirect("/inbox");
}
