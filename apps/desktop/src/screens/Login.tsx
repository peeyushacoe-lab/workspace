import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "@/api/client";
import { useAuth } from "@/store/auth";
import { getMe } from "@/api/client";

export function Login() {
  const navigate = useNavigate();
  const { login: setUser } = useAuth();
  const emailRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [version, setVersion] = useState("");

  useEffect(() => {
    emailRef.current?.focus();
    window.nexus.system.info().then(i => setVersion(i.version)).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError("");

    try {
      await login(email.trim().toLowerCase(), password);
      const me = await getMe();
      setUser(me);
      navigate("/app/inbox", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign in failed";
      setError(msg);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="no-select flex h-screen w-screen flex-col bg-bg-deep overflow-hidden">
      {/* Subtle radial glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(0,210,255,0.12), transparent)",
        }}
      />

      {/* Cyber grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,210,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,210,255,1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* macOS drag region — invisible bar at top */}
      {window.nexus.platform === "darwin" && (
        <div className="drag-region h-8 w-full flex-shrink-0" />
      )}

      {/* Center content */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-[380px]">


          {/* Logo + brand */}
          <div className="mb-10 flex flex-col items-center">
            <div className="relative mb-5">
              <div
                className="h-16 w-16 rounded-2xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, rgba(0,210,255,0.15) 0%, rgba(0,70,100,0.3) 100%)",
                  border: "1px solid rgba(0,210,255,0.2)",
                  boxShadow: "0 0 40px rgba(0,210,255,0.15)",
                }}
              >
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <path d="M4 8H28M4 16H20M4 24H24" stroke="#00d2ff" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </div>
            </div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">Nexus Workspace</h1>
            <p className="mt-1 text-sm text-text-muted">Sign in to continue</p>
          </div>

          {/* Error banner */}
          {error && (
            <div
              className="mb-4 rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger text-center"
              style={{ animation: shake ? "shake 0.4s ease" : "none" }}
            >
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
                Email
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/60">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </span>
                <input
                  ref={emailRef}
                  type="email"
                  required
                  autoComplete="off"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@cybersage.uk"
                  className="no-drag w-full rounded-lg border border-brand-border bg-bg-card py-2.5 pl-9 pr-3 text-sm text-text-primary placeholder-text-muted/50 transition-fast focus:border-brand/60 focus:ring-1 focus:ring-brand/30 outline-none"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted">
                Password
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/60">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  type={showPw ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="no-drag w-full rounded-lg border border-brand-border bg-bg-card py-2.5 pl-9 pr-10 text-sm text-text-primary placeholder-text-muted/50 transition-fast focus:border-brand/60 focus:ring-1 focus:ring-brand/30 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  className="no-drag absolute right-3 top-1/2 -translate-y-1/2 text-text-muted/50 hover:text-text-secondary transition-fast"
                >
                  {showPw ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Sign in button */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="no-drag mt-2 w-full rounded-lg py-2.5 text-sm font-semibold text-bg-deep transition-smooth disabled:opacity-50"
              style={{
                background: loading
                  ? "rgba(0,210,255,0.5)"
                  : "linear-gradient(135deg, #00d2ff 0%, #0098c7 100%)",
                boxShadow: loading ? "none" : "0 0 20px rgba(0,210,255,0.2)",
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Signing in…
                </span>
              ) : "Sign in"}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 flex items-center justify-between text-[11px] text-text-muted/40">
            <span>CyberSage © 2025</span>
            <span className="font-mono">v{version || "…"}</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
}
