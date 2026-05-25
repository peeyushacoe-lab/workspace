"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, ShieldCheck, Loader2, KeyRound } from "lucide-react";

function MfaChallengeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/inbox";

  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/mfa/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code.trim(), isBackupCode: useBackup }),
      });
      const data = (await res.json()) as { verified?: boolean; error?: string };
      if (!res.ok || !data.verified) {
        setError(data.error ?? "Invalid code. Please try again.");
        setCode("");
        inputRef.current?.focus();
        return;
      }
      router.replace(next.startsWith("/") ? next : "/inbox");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#0f172a] min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00d2ff] shadow-lg shadow-blue-500/30">
            <Sparkles className="h-6 w-6 text-[#003543]" />
          </div>
        </div>

        {/* Card */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-8 w-full max-w-sm shadow-2xl">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="flex justify-center mb-3">
              <ShieldCheck className="h-8 w-8 text-[#60a5fa]" />
            </div>
            <h1 className="text-xl font-bold text-[#dfe1f6]">Two-Factor Authentication</h1>
            <p className="text-sm text-[#94a3b8] mt-1">
              {useBackup
                ? "Enter one of your backup codes"
                : "Enter the 6-digit code from your authenticator app"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#dfe1f6] mb-1.5 text-[#94a3b8]">
                {useBackup ? "Backup Code" : "Authentication Code"}
              </label>
              <input
                ref={inputRef}
                type={useBackup ? "text" : "number"}
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={useBackup ? "xxxxxxxx" : "000000"}
                maxLength={useBackup ? 8 : 6}
                className="w-full text-4xl text-center font-mono text-[#003543] bg-[#0f172a] border border-[#334155] rounded-md focus:ring-2 focus:ring-[#00d2ff]/30 focus:border-transparent px-4 py-3 tracking-[0.4em] placeholder:text-[#334155] focus:outline-none transition"
                disabled={loading}
                autoComplete="one-time-code"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || code.trim().length < 6}
              className="bg-[#00d2ff] text-[#003543] hover:bg-[#00b8d9] hover:shadow-[0_0_20px_rgba(0,210,255,0.4)] w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-40 transition-colors active:scale-[0.98]"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              {loading ? "Verifying…" : "Verify"}
            </button>
          </form>

          {/* Toggle backup code */}
          <div className="mt-4 text-center">
            <button
              onClick={() => { setUseBackup((v) => !v); setCode(""); setError(null); }}
              className="text-[#94a3b8] hover:text-[#f8fafc] text-sm underline-offset-4 hover:underline transition-colors"
            >
              {useBackup ? "Use authenticator app instead" : "Use a backup code instead"}
            </button>
          </div>

          {/* Sign out */}
          <div className="mt-6 pt-5 border-t border-[#334155] text-center">
            <a
              href="/api/auth/logout"
              className="text-[#94a3b8] text-sm hover:text-[#f8fafc] transition-colors"
            >
              Sign out and use a different account
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MfaChallengePage() {
  return (
    <Suspense>
      <MfaChallengeForm />
    </Suspense>
  );
}
