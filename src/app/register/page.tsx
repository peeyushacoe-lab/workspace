import Link from "next/link";
import { ShieldCheck } from "lucide-react";

// Public self-registration is disabled.
// User accounts are created by administrators only (via CLI or Admin → Users panel).
export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-accent" />
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-foreground mb-2">
          Nexus is invite-only
        </h1>
        <p className="text-muted text-sm mb-8 leading-relaxed">
          Accounts are created by your organisation&apos;s administrator.<br />
          Contact your admin to get access.
        </p>

        <Link
          href="/login"
          className="inline-flex items-center justify-center px-6 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent-hover transition-colors"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
