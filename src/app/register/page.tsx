import Link from "next/link";
import { ShieldCheck } from "lucide-react";

// Public self-registration is disabled.
// User accounts are created by administrators only (via CLI or Admin → Users panel).
export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-full bg-[#e8f0fe] flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-[#1a56db]" />
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-[#202124] mb-2">
          Nexus is invite-only
        </h1>
        <p className="text-[#5f6368] text-sm mb-8 leading-relaxed">
          Accounts are created by your organisation&apos;s administrator.<br />
          Contact your admin to get access.
        </p>

        <Link
          href="/login"
          className="inline-flex items-center justify-center px-6 py-2.5 rounded-lg bg-[#1a56db] text-white text-sm font-semibold hover:bg-[#1648c7] transition-colors"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
