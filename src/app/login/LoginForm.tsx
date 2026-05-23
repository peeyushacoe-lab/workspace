"use client";

import { useState } from "react";
import { Mail, Lock, Loader2, Zap, Users } from "lucide-react";

export function LoginForm({ next, error: initialError }: { next: string; error: boolean }) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(initialError);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    setError(false);

    const formData = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = (await res.json()) as { redirectTo: string };
        window.location.href = data.redirectTo ?? next;
        return;
      }
    } catch {
      // network failure — fall through to show error
    }

    setError(true);
    setIsPending(false);
  }

  return (
    <div className="flex h-screen">
      {/* Left panel — cyber dark brand panel */}
      <div className="w-5/12 hidden md:flex bg-[#0a0d1c] flex-col justify-between p-12 relative overflow-hidden border-r border-[rgba(0,255,255,0.08)]">
        {/* Cyber grid overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "linear-gradient(rgba(0,210,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,210,255,0.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#00d2ff]/5 to-transparent pointer-events-none" />

        {/* Logo / brand */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <img src="/nexus.png" alt="Nexus" className="h-12 w-12 rounded-xl object-contain drop-shadow-[0_0_12px_rgba(0,210,255,0.5)]" />
            <span className="text-[#a5e7ff] font-semibold text-lg tracking-tight">Nexus</span>
          </div>
        </div>

        {/* Feature list */}
        <div className="relative z-10 space-y-8">
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-[#1b1f2e]/80 backdrop-blur-sm border border-[rgba(0,255,255,0.08)] flex items-center justify-center shrink-0">
                <Mail className="h-5 w-5 text-[#00d2ff]" />
              </div>
              <div>
                <p className="text-[#dfe1f6] font-semibold text-lg">Secure Email</p>
                <p className="text-[#bbc9cf] text-sm">End-to-end encrypted communication for your entire organisation.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-[#1b1f2e]/80 backdrop-blur-sm border border-[rgba(0,255,255,0.08)] flex items-center justify-center shrink-0">
                <Zap className="h-5 w-5 text-[#00d2ff]" />
              </div>
              <div>
                <p className="text-[#dfe1f6] font-semibold text-lg">AI-Powered</p>
                <p className="text-[#bbc9cf] text-sm">Smart drafts, summaries, and threat detection built in.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-[#1b1f2e]/80 backdrop-blur-sm border border-[rgba(0,255,255,0.08)] flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-[#00d2ff]" />
              </div>
              <div>
                <p className="text-[#dfe1f6] font-semibold text-lg">Team Workspace</p>
                <p className="text-[#bbc9cf] text-sm">Role-based access and collaboration across every department.</p>
              </div>
            </div>
          </div>

          <div className="border-t border-[rgba(0,255,255,0.08)] pt-8">
            <p className="text-[#dfe1f6] text-4xl font-bold tracking-tight leading-tight">
              Work smarter,<br />
              <span className="text-[#00d2ff]">stay secure.</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <p className="text-[#bbc9cf]/50 text-xs">
            &copy; {new Date().getFullYear()} CyberSage · Nexus Workspace
          </p>
        </div>
      </div>

      {/* Right panel — glassmorphism login form */}
      <div className="flex-1 bg-[#0f1321] flex flex-col justify-center items-center p-6 sm:p-12 relative">
        {/* Cyber grid on right panel too */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "linear-gradient(rgba(0,210,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,210,255,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} />

        <div className="relative z-10 w-full max-w-[440px]">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 md:hidden">
            <img src="/nexus.png" alt="Nexus" className="h-10 w-10 rounded-xl object-contain" />
            <span className="text-[#a5e7ff] font-semibold text-lg tracking-tight">Nexus</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-[#dfe1f6] tracking-tight">Sign in</h1>
            <p className="text-[#bbc9cf] text-base mt-1.5">Welcome back to your workspace.</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-4 bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg shadow-[0_0_16px_rgba(255,77,109,0.2)]">
                <p className="text-sm text-[#ff4d6d] font-medium text-center">
                  Invalid email or password. Please try again.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[#dfe1f6] mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#bbc9cf]/60" />
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="e.g. ceo@cybersage.uk"
                  suppressHydrationWarning
                  className="block w-full pl-10 pr-4 py-2.5 border border-[rgba(0,255,255,0.08)] rounded-md bg-[#1b1f2e] text-[#dfe1f6] focus:ring-2 focus:ring-[#00d2ff]/30 focus:border-[#00d2ff]/60 transition-all text-sm outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#dfe1f6] mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#bbc9cf]/60" />
                <input
                  name="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  suppressHydrationWarning
                  className="block w-full pl-10 pr-4 py-2.5 border border-[rgba(0,255,255,0.08)] rounded-md bg-[#1b1f2e] text-[#dfe1f6] focus:ring-2 focus:ring-[#00d2ff]/30 focus:border-[#00d2ff]/60 transition-all text-sm outline-none"
                />
              </div>
            </div>

            <button
              disabled={isPending}
              suppressHydrationWarning
              className="w-full flex justify-center py-2.5 px-4 rounded-md text-sm font-semibold text-[#003543] bg-[#00d2ff] hover:bg-[#00b8d9] hover:shadow-[0_0_20px_rgba(0,210,255,0.4)] focus:ring-2 focus:ring-[#00d2ff]/40 transition-all active:scale-[0.98] disabled:opacity-70 items-center gap-2 mt-1"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <div className="mt-8 border-t border-[rgba(0,255,255,0.08)] pt-5">
            <p className="text-xs text-center text-[#bbc9cf]/50 uppercase tracking-[0.12em] font-medium">
              RBAC Protected Environment
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
