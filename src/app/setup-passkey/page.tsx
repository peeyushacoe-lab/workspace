"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, Fingerprint, Smartphone, Monitor,
  Loader2, CheckCircle, ArrowRight, Info,
} from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";

type Step = "intro" | "naming" | "registering" | "done" | "error" | "skipping";

export default function SetupPasskeyPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function skipPasskey() {
    setStep("skipping");
    await fetch("/api/auth/skip-passkey", { method: "POST" });
    router.replace("/home");
  }

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
      setTimeout(() => router.replace("/home"), 1500);
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
    <div className="min-h-screen bg-surface-sunken flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft mb-4">
            <ShieldCheck className="h-7 w-7 text-accent" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Secure your account</h1>
          <p className="text-sm text-muted mt-1">Step 2 of 2 — Set up biometric sign-in</p>
        </div>

        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">

          {/* Intro */}
          {step === "intro" && (
            <div className="p-8">
              <h2 className="text-lg font-semibold text-foreground mb-2">What is a passkey?</h2>
              <p className="text-sm text-muted mb-6 leading-relaxed">
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
                  <div key={label} className="flex gap-3 p-3 rounded-lg bg-surface-sunken">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft">
                      <Icon className="h-4 w-4 text-accent" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{label}</p>
                      <p className="text-xs text-muted">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep("naming")}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl bg-accent text-accent-foreground hover:bg-accent-hover transition-colors"
              >
                Set up passkey
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Name your passkey */}
          {step === "naming" && (
            <div className="p-8">
              <h2 className="text-lg font-semibold text-foreground mb-1">Name this device</h2>
              <p className="text-sm text-muted mb-6">
                Give it a name so you can identify it later (e.g. &quot;Work MacBook&quot;, &quot;iPhone 15&quot;).
              </p>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My work laptop"
                autoFocus
                className="w-full px-3 py-2.5 bg-surface-sunken border border-border rounded-lg text-sm text-foreground placeholder:text-subtle focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-colors mb-6"
                onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) void register(); }}
              />

              <div className="flex items-start gap-2 p-3 rounded-lg bg-accent-soft mb-6">
                <Info className="h-4 w-4 text-accent mt-0.5 shrink-0" />
                <p className="text-xs text-accent">
                  Your browser will ask for Face ID, fingerprint, or PIN. This only takes a second.
                </p>
              </div>

              <button
                onClick={() => void register()}
                disabled={!name.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl bg-accent text-accent-foreground hover:bg-accent-hover transition-colors disabled:opacity-40"
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
                <div className="absolute inset-0 rounded-full bg-accent-soft animate-pulse" />
                <Fingerprint className="relative h-10 w-10 text-accent" />
              </div>
              <p className="text-base font-semibold text-foreground">Waiting for biometric…</p>
              <p className="text-sm text-muted text-center">
                Follow the prompt on your device — use Face ID, fingerprint, or PIN
              </p>
              <Loader2 className="h-5 w-5 animate-spin text-accent mt-2" />
            </div>
          )}

          {/* Done */}
          {step === "done" && (
            <div className="p-8 flex flex-col items-center gap-4 py-12">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ok-soft">
                <CheckCircle className="h-8 w-8 text-ok" />
              </div>
              <p className="text-base font-semibold text-ok">Passkey registered!</p>
              <p className="text-sm text-muted">Taking you to your inbox…</p>
            </div>
          )}

          {/* Error */}
          {step === "error" && (
            <div className="p-8">
              <p className="text-sm font-semibold text-crit mb-2">Setup failed</p>
              {error && <p className="text-xs text-muted mb-6">{error}</p>}
              <button
                onClick={() => setStep("naming")}
                className="w-full px-4 py-3 text-sm font-semibold rounded-xl bg-accent text-accent-foreground hover:bg-accent-hover transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {/* Which devices */}
          {(step === "intro" || step === "naming") && (
            <div className="px-8 pb-6 pt-0">
              <div className="pt-4 border-t border-border flex items-center justify-center gap-4 text-xs text-subtle">
                <span className="flex items-center gap-1"><Fingerprint className="h-3.5 w-3.5" /> Touch ID</span>
                <span className="flex items-center gap-1"><Monitor className="h-3.5 w-3.5" /> Windows Hello</span>
                <span className="flex items-center gap-1"><Smartphone className="h-3.5 w-3.5" /> Face ID</span>
              </div>
            </div>
          )}
        </div>

        {/* Skip / sign out */}
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={() => void skipPasskey()}
            disabled={step === "skipping"}
            className="text-xs text-muted hover:text-foreground transition-colors underline underline-offset-2 disabled:opacity-50"
          >
            {step === "skipping" ? "Redirecting…" : "Skip for now"}
          </button>
          <span className="text-subtle text-xs">·</span>
          <a href="/api/auth/logout" className="text-xs text-subtle hover:text-muted transition-colors">
            Sign out
          </a>
        </div>
      </div>
    </div>
  );
}
