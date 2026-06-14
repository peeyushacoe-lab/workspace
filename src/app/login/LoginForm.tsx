/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { Loader2, ArrowRight, Shield, Mail, Sparkles, AlertCircle } from "lucide-react";

export function LoginForm({ next, error: initialError }: { next: string; error: boolean }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(initialError);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    setError(false);

    const formData = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", body: formData });
      if (res.ok) {
        const data = (await res.json()) as { redirectTo: string };
        window.location.href = data.redirectTo ?? next;
        return;
      }
    } catch {}
    setError(true);
    setIsPending(false);
  }

  return (
    <div className="min-h-screen flex bg-[#f8fafd]">

      {/* ── Left brand panel (desktop only) ─────────────────── */}
      <div className="hidden lg:flex w-[44%] bg-gradient-to-br from-[#0f1d40] via-[#1a3568] to-[#122c5e] flex-col justify-between p-14 relative overflow-hidden">

        {/* Subtle dot grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Top glow */}
        <div className="absolute -top-32 -left-32 w-72 h-72 rounded-full bg-[#3b82f6]/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-[#1a56db]/15 blur-3xl pointer-events-none" />

        <img
          src="/nexusLogo.png"
          alt="CyberSage Nexus"
          className="relative h-9 w-auto object-contain max-w-[180px] brightness-0 invert"
        />

        <div className="relative space-y-10">
          {/* Feature pills */}
          <div className="space-y-4">
            {[
              { icon: Mail,      text: "Unified mail, chat & meetings"         },
              { icon: Shield,    text: "Built-in security operations centre"   },
              { icon: Sparkles,  text: "AI-powered workspace intelligence"     },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3.5">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
                  <Icon className="h-4 w-4 text-white/75" />
                </div>
                <span className="text-white/75 text-[14.5px] font-medium">{text}</span>
              </div>
            ))}
          </div>

          <div>
            <h2 className="text-white text-2xl font-semibold leading-snug tracking-tight">
              The workspace for<br />everything Cybersage.
            </h2>
            <p className="text-white/45 text-sm mt-3 leading-relaxed max-w-[300px]">
              Mail, chat, meetings, files and security — all in one place.
            </p>
          </div>
        </div>

        <p className="relative text-white/25 text-xs">
          © {new Date().getFullYear()} CyberSage. All rights reserved.
        </p>
      </div>

      {/* ── Right form panel ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-14">

        {/* Mobile logo */}
        <div className="lg:hidden mb-10">
          <img src="/nexusLogo.png" alt="CyberSage Nexus" className="h-9 w-auto object-contain max-w-[180px]" />
        </div>

        <div className="w-full max-w-[400px]">

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.06),_0_8px_32px_rgba(0,0,0,0.08)] border border-[#eaecf0] px-8 py-9 sm:px-10">

            <div className="mb-7">
              <h1 className="text-[22px] font-semibold text-[#101828] tracking-tight">Sign in to Nexus</h1>
              <p className="text-[#667085] text-[13.5px] mt-1.5">Use your Cybersage credentials to continue.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">

              {error && (
                <div className="flex items-start gap-2.5 p-3.5 bg-[#fef3f2] border border-[#fecdca] rounded-xl">
                  <AlertCircle className="h-4 w-4 text-[#d92d20] flex-shrink-0 mt-0.5" />
                  <p className="text-[13px] text-[#b42318] font-medium leading-snug">
                    Invalid email or password. Please try again.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-[#344054]">Email address</label>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@cybersage.uk"
                  suppressHydrationWarning
                  className="w-full px-3.5 py-2.5 bg-white border border-[#d0d5dd] rounded-xl text-[14px] text-[#101828] placeholder:text-[#98a2b3] focus:outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/12 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[13px] font-medium text-[#344054]">Password</label>
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  suppressHydrationWarning
                  className="w-full px-3.5 py-2.5 bg-white border border-[#d0d5dd] rounded-xl text-[14px] text-[#101828] placeholder:text-[#98a2b3] focus:outline-none focus:border-[#1a56db] focus:ring-2 focus:ring-[#1a56db]/12 transition-all"
                />
              </div>

              <button
                disabled={isPending}
                suppressHydrationWarning
                className="w-full flex items-center justify-center gap-2 py-2.5 px-5 mt-1 bg-[#1a56db] hover:bg-[#1447c0] active:bg-[#1040b0] text-white text-[14px] font-semibold rounded-xl transition-colors shadow-[0_1px_3px_rgba(26,86,219,0.3)] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</>
                ) : (
                  <><span>Sign in</span><ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </form>
          </div>

          <p className="mt-5 text-center text-[13px] text-[#98a2b3]">
            Having trouble?{" "}
            <span className="text-[#667085]">Contact your administrator.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
