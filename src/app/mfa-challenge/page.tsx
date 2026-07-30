"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, Fingerprint, Loader2, XCircle, RefreshCw } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";

type Step = "idle" | "prompting" | "verifying" | "success" | "error";

function MfaChallengeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/inbox";

  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const authenticate = useCallback(async () => {
    setStep("prompting");
    setErrorMsg("");
    try {
      // 1. Get challenge options from server
      const optRes = await fetch("/api/auth/passkey/auth-options", { method: "POST" });
      const optData = await optRes.json() as PublicKeyCredentialRequestOptionsJSON & { error?: string };
      if (!optRes.ok) throw new Error(optData.error ?? "Could not start verification");

      // 2. Trigger browser biometric / passkey prompt
      const credential = await startAuthentication({ optionsJSON: optData });

      setStep("verifying");

      // 3. Send response to server
      const verRes = await fetch("/api/auth/passkey/auth-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credential),
      });
      const verData = await verRes.json() as { verified?: boolean; error?: string };
      if (!verRes.ok || !verData.verified) throw new Error(verData.error ?? "Verification failed");

      setStep("success");
      setTimeout(() => router.replace(next.startsWith("/") ? next : "/inbox"), 600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      // User cancelled — go back to idle silently
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("abort") || msg.includes("NotAllowedError")) {
        setStep("idle");
      } else {
        setErrorMsg(msg);
        setStep("error");
      }
    }
  }, [next, router]);

  // Auto-trigger on mount
  useEffect(() => {
    void authenticate();
  }, [authenticate]);

  return (
    <div className="bg-surface min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft">
            <ShieldCheck className="h-6 w-6 text-accent" />
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-8 shadow-sm text-center">

          {/* Success */}
          {step === "success" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-16 h-16 rounded-full bg-ok-soft flex items-center justify-center">
                <ShieldCheck className="h-8 w-8 text-ok" />
              </div>
              <p className="text-sm font-semibold text-ok">Verified — signing you in…</p>
            </div>
          )}

          {/* Prompting biometric */}
          {(step === "prompting" || step === "verifying") && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="relative flex h-20 w-20 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-accent-soft animate-pulse" />
                <Fingerprint className="relative h-10 w-10 text-accent" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">
                  {step === "prompting" ? "Verify your identity" : "Verifying…"}
                </p>
                <p className="text-sm text-muted mt-1">
                  {step === "prompting"
                    ? "Use Face ID, fingerprint, or your device PIN"
                    : "Checking your passkey…"}
                </p>
              </div>
              {step === "verifying" && <Loader2 className="h-5 w-5 animate-spin text-accent" />}
            </div>
          )}

          {/* Idle (after cancel) */}
          {step === "idle" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-sunken">
                <Fingerprint className="h-8 w-8 text-muted" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">Biometric verification</p>
                <p className="text-sm text-muted mt-1">Use your registered passkey to sign in</p>
              </div>
              <button
                onClick={() => void authenticate()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover transition-colors"
              >
                <Fingerprint className="h-4 w-4" />
                Verify with passkey
              </button>
            </div>
          )}

          {/* Error */}
          {step === "error" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-crit-soft">
                <XCircle className="h-8 w-8 text-crit" />
              </div>
              <div>
                <p className="text-sm font-semibold text-crit">Verification failed</p>
                {errorMsg && <p className="text-xs text-muted mt-1">{errorMsg}</p>}
              </div>
              <button
                onClick={() => void authenticate()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </button>
            </div>
          )}

          {/* Sign out link */}
          <div className="mt-6 pt-5 border-t border-border">
            <a
              href="/api/auth/logout"
              className="text-xs text-subtle hover:text-muted transition-colors"
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
