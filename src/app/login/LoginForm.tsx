"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

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
      {/* Left panel — brand */}
      <div className="w-5/12 hidden md:flex bg-[#0c0f1b] flex-col justify-between p-12 border-r border-[rgba(255,255,255,0.06)]">
        <img
          src="/nexusLogo.png"
          alt="CyberSage Nexus"
          className="h-12 w-auto self-start object-contain max-w-[220px]"
        />

        <div>
          <p className="text-[#eceef8] text-3xl font-semibold tracking-tight leading-snug max-w-sm">
            The workspace for everything Cybersage.
          </p>
          <p className="text-[#8b93a7] text-sm mt-4 max-w-sm leading-relaxed">
            Mail, chat, meetings, files and security operations — in one place.
          </p>
        </div>

        <p className="text-[#5d6579] text-xs">
          &copy; {new Date().getFullYear()} CyberSage
        </p>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 bg-[#0f1321] flex flex-col justify-center items-center p-6 sm:p-12">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="flex items-center mb-8 md:hidden">
            <img src="/nexusLogo.png" alt="CyberSage Nexus" className="h-10 w-auto object-contain max-w-[200px]" />
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-[#eceef8] tracking-tight">Sign in</h1>
            <p className="text-[#8b93a7] text-sm mt-1.5">Use your Cybersage account.</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-4 bg-[#ff4d6d]/10 border border-[#ff4d6d]/30 rounded-lg">
                <p className="text-sm text-[#ff4d6d] font-medium text-center">
                  Invalid email or password. Please try again.
                </p>
              </div>
            )}

            <div>
              <label className="block text-[13px] font-medium text-[#c3c8d8] mb-1.5">
                Email
              </label>
              <input
                name="email"
                type="email"
                required
                placeholder="you@cybersage.uk"
                suppressHydrationWarning
                className="block w-full px-3.5 py-2.5 border border-[rgba(255,255,255,0.1)] rounded-lg bg-[#161a28] text-[#eceef8] placeholder:text-[#5d6579] focus:border-[#00d2ff]/60 focus:ring-2 focus:ring-[#00d2ff]/20 transition-colors text-sm outline-none"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#c3c8d8] mb-1.5">
                Password
              </label>
              <input
                name="password"
                type="password"
                required
                placeholder="Your password"
                suppressHydrationWarning
                className="block w-full px-3.5 py-2.5 border border-[rgba(255,255,255,0.1)] rounded-lg bg-[#161a28] text-[#eceef8] placeholder:text-[#5d6579] focus:border-[#00d2ff]/60 focus:ring-2 focus:ring-[#00d2ff]/20 transition-colors text-sm outline-none"
              />
            </div>

            <button
              disabled={isPending}
              suppressHydrationWarning
              className="w-full flex justify-center py-2.5 px-4 rounded-lg text-sm font-semibold text-[#003543] bg-[#00d2ff] hover:bg-[#33dbff] focus:ring-2 focus:ring-[#00d2ff]/30 transition-colors disabled:opacity-70 items-center gap-2 mt-1"
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

          <p className="mt-8 text-[13px] text-[#707a90]">
            Trouble signing in? Contact your administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
