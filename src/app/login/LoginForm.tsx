/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { Loader2, ArrowRight, Mail, Lock, AlertCircle } from "lucide-react";

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
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        padding: 16,
        background: "var(--canvas)",
        fontFamily:
          "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <style>{`
        .nx-field { transition: border-color .15s ease, box-shadow .15s ease; }
        .nx-field:focus-within { border-color: color-mix(in srgb, var(--accent) 50%, transparent) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent); }
        .nx-field input::placeholder { color:var(--subtle); }
        .nx-field input:-webkit-autofill { -webkit-text-fill-color:var(--foreground); transition: background-color 9999s ease-in-out 0s; }
        .nx-link { transition: opacity .15s ease; }
        .nx-link:hover { opacity:.8; }
        .nx-signin:hover:not(:disabled) { background: var(--accent-hover) !important; }
      `}</style>

      {/* card — Atrium: a floating panel on the canvas, no blur, no glow */}
      <div
        style={{
          position: "relative",
          width: 408,
          maxWidth: "100%",
          padding: 40,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--panel-radius)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* logo — dark artwork for the light panel, light artwork under .dark */}
        <div style={{ marginBottom: 30 }}>
          <img
            src="/nexusLogo.png"
            alt="Nexus"
            className="dark:hidden"
            style={{ height: 36, width: "auto", objectFit: "contain", maxWidth: 200 }}
          />
          <img
            src="/nexusLogo-dark.png"
            alt=""
            aria-hidden
            className="hidden dark:block"
            style={{ height: 36, width: "auto", objectFit: "contain", maxWidth: 200 }}
          />
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.4px", color: "var(--foreground)" }}>
          Welcome back
        </h1>
        <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 28px" }}>Sign in to your workspace</p>

        <form onSubmit={handleSubmit}>
          <input type="hidden" name="next" value={next} />
          {error && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "11px 12px",
                marginBottom: 18,
                background: "color-mix(in srgb, var(--crit) 10%, transparent)",
                border: "1px solid color-mix(in srgb, var(--crit) 30%, transparent)",
                borderRadius: 9,
              }}
            >
              <AlertCircle size={16} color="var(--crit)" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 13, color: "var(--crit)", fontWeight: 500, margin: 0, lineHeight: 1.4 }}>
                Invalid email or password. Please try again.
              </p>
            </div>
          )}

          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 7 }}>
            Email
          </label>
          <div
            className="nx-field"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              height: 46,
              padding: "0 14px",
              background: "var(--surface-sunken)",
              border: "1px solid var(--border)",
              borderRadius: 9,
              marginBottom: 16,
            }}
          >
            <Mail className="w-4 h-4 flex-shrink-0" color="var(--subtle)" />
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@cybersage.uk"
              suppressHydrationWarning
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--foreground)",
                fontSize: 14,
              }}
            />
          </div>

          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 7 }}>
            Password
          </label>
          <div
            className="nx-field"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              height: 46,
              padding: "0 14px",
              background: "var(--surface-sunken)",
              border: "1px solid var(--border)",
              borderRadius: 9,
              marginBottom: 10,
            }}
          >
            <Lock className="w-4 h-4 flex-shrink-0" color="var(--subtle)" />
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              suppressHydrationWarning
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--foreground)",
                fontSize: 14,
                letterSpacing: 1,
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 22 }}>
            <a
              href="/reset-password"
              className="nx-link"
              style={{ fontSize: 12.5, color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}
            >
              Forgot password?
            </a>
          </div>

          <button
            type="submit"
            disabled={isPending}
            suppressHydrationWarning
            className="nx-signin"
            style={{
              width: "100%",
              height: 46,
              border: "none",
              borderRadius: 9,
              background: "var(--accent)",
              color: "var(--accent-foreground)",
              fontSize: 14.5,
              fontWeight: 700,
              cursor: isPending ? "not-allowed" : "pointer",
              opacity: isPending ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "filter .15s ease, opacity .15s ease",
            }}
          >
            {isPending ? (
              <>
                <Loader2 size={17} className="animate-spin" /> Signing in…
              </>
            ) : (
              <>
                Sign in
                <ArrowRight className="w-[18px] h-[18px]" />
              </>
            )}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 12.5, color: "var(--muted)", margin: "26px 0 0" }}>
          Having trouble?{" "}
          <span style={{ color: "var(--foreground)", fontWeight: 600 }}>Contact your administrator.</span>
        </p>
      </div>
    </div>
  );
}
