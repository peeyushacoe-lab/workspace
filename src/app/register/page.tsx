import Link from "next/link";
import { ShieldCheck } from "lucide-react";

// Public self-registration is disabled.
// User accounts are created by administrators only (via CLI or Admin → Users panel).
export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-[#0B0D12] flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-full bg-[#00C2FF]/10 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-[#00C2FF]" />
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-[#E6E9F0] mb-2">
          Nexus is invite-only
        </h1>
        <p className="text-[#8A92A6] text-sm mb-8 leading-relaxed">
          Accounts are created by your organisation&apos;s administrator.<br />
          Contact your admin to get access.
        </p>

        <Link
          href="/login"
          className="inline-flex items-center justify-center px-6 py-2.5 rounded-lg bg-[#00C2FF] text-[#06121A] text-sm font-semibold hover:bg-[#0098E6] transition-colors"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
