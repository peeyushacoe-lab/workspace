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
        background:
          "radial-gradient(1200px 600px at 50% -10%, rgba(0,194,255,0.10), transparent 60%), #0B0D12",
        fontFamily:
          "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <style>{`
        @keyframes nexglow { 0%,100% { opacity:.5; transform:translateX(-50%) scale(1); } 50% { opacity:.8; transform:translateX(-50%) scale(1.05); } }
        .nx-field { transition: border-color .15s ease, box-shadow .15s ease; }
        .nx-field:focus-within { border-color: rgba(0,194,255,0.5) !important; box-shadow: 0 0 0 3px rgba(0,194,255,0.12); }
        .nx-field input::placeholder { color:#5A6275; }
        .nx-field input:-webkit-autofill { -webkit-text-fill-color:#E6E9F0; transition: background-color 9999s ease-in-out 0s; }
        .nx-link { transition: opacity .15s ease; }
        .nx-link:hover { opacity:.8; }
        .nx-signin:hover:not(:disabled) { filter: brightness(1.05); }
      `}</style>

      {/* animated cyan glow */}
      <div
        style={{
          position: "absolute",
          top: -160,
          left: "50%",
          transform: "translateX(-50%)",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,194,255,0.18), transparent 65%)",
          filter: "blur(20px)",
          animation: "nexglow 8s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      {/* card */}
      <div
        style={{
          position: "relative",
          width: 408,
          maxWidth: "100%",
          padding: 40,
          background: "rgba(18,21,29,0.82)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          boxShadow: "0 40px 80px -20px rgba(0,0,0,0.6)",
        }}
      >
        {/* logo */}
        <div style={{ marginBottom: 30 }}>
          <img
            src="/nexusLogo-dark.png"
            alt="Nexus"
            style={{ height: 36, width: "auto", objectFit: "contain", maxWidth: 200 }}
          />
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.4px", color: "#E6E9F0" }}>
          Welcome back
        </h1>
        <p style={{ fontSize: 14, color: "#8A92A6", margin: "0 0 28px" }}>Sign in to your workspace</p>

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
                background: "rgba(255,92,122,0.10)",
                border: "1px solid rgba(255,92,122,0.30)",
                borderRadius: 9,
              }}
            >
              <AlertCircle size={16} color="#FF5C7A" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 13, color: "#FF8AA0", fontWeight: 500, margin: 0, lineHeight: 1.4 }}>
                Invalid email or password. Please try again.
              </p>
            </div>
          )}

          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8A92A6", marginBottom: 7 }}>
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
              background: "#0D1017",
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 9,
              marginBottom: 16,
            }}
          >
            <Mail size={17} color="#5A6275" style={{ flexShrink: 0 }} />
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
                color: "#E6E9F0",
                fontSize: 14,
              }}
            />
          </div>

          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#8A92A6", marginBottom: 7 }}>
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
              background: "#0D1017",
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 9,
              marginBottom: 10,
            }}
          >
            <Lock size={17} color="#5A6275" style={{ flexShrink: 0 }} />
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
                color: "#E6E9F0",
                fontSize: 14,
                letterSpacing: 1,
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 22 }}>
            <a
              href="/reset-password"
              className="nx-link"
              style={{ fontSize: 12.5, color: "#00C2FF", fontWeight: 600, textDecoration: "none" }}
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
              background: "linear-gradient(135deg, #00C2FF, #0098E6)",
              color: "#06121A",
              fontSize: 14.5,
              fontWeight: 700,
              cursor: isPending ? "not-allowed" : "pointer",
              opacity: isPending ? 0.7 : 1,
              boxShadow: "0 8px 22px -6px rgba(0,194,255,0.55)",
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
                <ArrowRight size={17} strokeWidth={2.4} />
              </>
            )}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 12.5, color: "#8A92A6", margin: "26px 0 0" }}>
          Having trouble?{" "}
          <span style={{ color: "#C2C8D6", fontWeight: 600 }}>Contact your administrator.</span>
        </p>
      </div>
    </div>
  );
}
