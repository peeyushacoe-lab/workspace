"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, Fingerprint, Smartphone, Monitor,
  Loader2, CheckCircle, ArrowRight, Info,
} from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";

type Step = "intro" | "naming" | "registering" | "done" | "error";

export default function SetupPasskeyPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function register() {
    setStep("registering");
    setError("");
    try {
      const optRes = await fetch("/api/auth/passkey/register-options", { method: "POST" });
      if (!optRes.ok) throw new Error("Failed to start setup");
      const options = await optRes.json() as PublicKeyCredentialCreationOptionsJSON;

      const credential = await startRegistration({ optionsJSON: options });

      const verRes = await fetch("/api/auth/passkey/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...credential, name: name.trim() || "My passkey" }),
      });
      const data = await verRes.json() as { verified?: boolean; error?: string };
      if (!verRes.ok || !data.verified) throw new Error(data.error ?? "Setup failed");

      setStep("done");
      setTimeout(() => router.replace("/inbox"), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Setup failed";
      if (msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("abort") || msg.includes("NotAllowedError")) {
        setStep("naming"); // user cancelled biometric — go back to naming step
      } else {
        setError(msg);
        setStep("error");
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f0fe] mb-4">
            <ShieldCheck className="h-7 w-7 text-[#1a56db]" />
          </div>
          <h1 className="text-2xl font-semibold text-[#202124]">Secure your account</h1>
          <p className="text-sm text-[#5f6368] mt-1">Step 2 of 2 — Set up biometric sign-in</p>
        </div>

        <div className="bg-white border border-[#e8eaed] rounded-2xl overflow-hidden shadow-sm">

          {/* Intro */}
          {step === "intro" && (
            <div className="p-8">
              <h2 className="text-lg font-semibold text-[#202124] mb-2">What is a passkey?</h2>
              <p className="text-sm text-[#5f6368] mb-6 leading-relaxed">
                A passkey replaces passwords and security codes with your device&apos;s built-in
                biometrics. Every time you sign in, just use your face, fingerprint, or PIN —
                no codes to copy, no apps to open.
              </p>

              <div className="space-y-3 mb-8">
                {[
                  { icon: Fingerprint, label: "Face ID or fingerprint", desc: "Touch or look at your device to approve sign-ins" },
                  { icon: Monitor, label: "Works on any of your devices", desc: "Register your laptop, phone, or tablet" },
                  { icon: ShieldCheck, label: "Phishing-proof", desc: "Cryptographically tied to Nexus — can't be stolen or faked" },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="flex gap-3 p-3 rounded-lg bg-[#f8f9fa]">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#e8f0fe]">
                      <Icon className="h-4 w-4 text-[#1a56db]" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#202124]">{label}</p>
                      <p className="text-xs text-[#5f6368]">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep("naming")}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl bg-[#1a56db] text-white hover:bg-[#1648c7] transition-colors"
              >
                Set up passkey
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Name your passkey */}
          {step === "naming" && (
            <div className="p-8">
              <h2 className="text-lg font-semibold text-[#202124] mb-1">Name this device</h2>
              <p className="text-sm text-[#5f6368] mb-6">
                Give it a name so you can identify it later (e.g. &quot;Work MacBook&quot;, &quot;iPhone 15&quot;).
              </p>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My work laptop"
                autoFocus
                className="w-full px-3 py-2.5 bg-[#f1f3f4] border border-[#d0d5dd] rounded-lg text-sm text-[#202124] placeholder:text-[#80868b] focus:outline-none focus:border-[#1a56db]/60 focus:ring-2 focus:ring-[#1a56db]/20 transition-colors mb-6"
                onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) void register(); }}
              />

              <div className="flex items-start gap-2 p-3 rounded-lg bg-[#e8f0fe] mb-6">
                <Info className="h-4 w-4 text-[#1a56db] mt-0.5 shrink-0" />
                <p className="text-xs text-[#1a56db]">
                  Your browser will ask for Face ID, fingerprint, or PIN. This only takes a second.
                </p>
              </div>

              <button
                onClick={() => void register()}
                disabled={!name.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl bg-[#1a56db] text-white hover:bg-[#1648c7] transition-colors disabled:opacity-40"
              >
                <Fingerprint className="h-4 w-4" />
                Register with biometrics
              </button>
            </div>
          )}

          {/* Registering */}
          {step === "registering" && (
            <div className="p-8 flex flex-col items-center gap-4 py-12">
              <div className="relative flex h-20 w-20 items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-[#e8f0fe] animate-pulse" />
                <Fingerprint className="relative h-10 w-10 text-[#1a56db]" />
              </div>
              <p className="text-base font-semibold text-[#202124]">Waiting for biometric…</p>
              <p className="text-sm text-[#5f6368] text-center">
                Follow the prompt on your device — use Face ID, fingerprint, or PIN
              </p>
              <Loader2 className="h-5 w-5 animate-spin text-[#1a56db] mt-2" />
            </div>
          )}

          {/* Done */}
          {step === "done" && (
            <div className="p-8 flex flex-col items-center gap-4 py-12">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e6f4ea]">
                <CheckCircle className="h-8 w-8 text-[#0f9d58]" />
              </div>
              <p className="text-base font-semibold text-[#0f9d58]">Passkey registered!</p>
              <p className="text-sm text-[#5f6368]">Taking you to your inbox…</p>
            </div>
          )}

          {/* Error */}
          {step === "error" && (
            <div className="p-8">
              <p className="text-sm font-semibold text-[#ea4335] mb-2">Setup failed</p>
              {error && <p className="text-xs text-[#5f6368] mb-6">{error}</p>}
              <button
                onClick={() => setStep("naming")}
                className="w-full px-4 py-3 text-sm font-semibold rounded-xl bg-[#1a56db] text-white hover:bg-[#1648c7] transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {/* Which devices */}
          {(step === "intro" || step === "naming") && (
            <div className="px-8 pb-6 pt-0">
              <div className="pt-4 border-t border-[#e8eaed] flex items-center justify-center gap-4 text-xs text-[#80868b]">
                <span className="flex items-center gap-1"><Fingerprint className="h-3.5 w-3.5" /> Touch ID</span>
                <span className="flex items-center gap-1"><Monitor className="h-3.5 w-3.5" /> Windows Hello</span>
                <span className="flex items-center gap-1"><Smartphone className="h-3.5 w-3.5" /> Face ID</span>
              </div>
            </div>
          )}
        </div>

        {/* Sign out link */}
        <p className="text-center mt-6">
          <a href="/api/auth/logout" className="text-xs text-[#80868b] hover:text-[#5f6368] transition-colors">
            Sign out
          </a>
        </p>
      </div>
    </div>
  );
}
