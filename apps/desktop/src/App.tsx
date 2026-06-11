import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/store/auth";
import { Login } from "@/screens/Login";
import { Shell } from "@/screens/Shell";

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg-base">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-14 w-14 rounded-2xl bg-brand-dim border border-brand-border flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="8" fill="rgba(0,210,255,0.1)" />
                <path d="M8 16L14 22L24 10" stroke="#00d2ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="absolute -inset-1 rounded-2xl border border-brand/30 animate-ping opacity-40" />
          </div>
          <p className="text-xs text-text-muted uppercase tracking-widest">Loading Nexus…</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/app/inbox" replace /> : <Login />} />
      <Route path="/app/*" element={user ? <Shell /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={user ? "/app/inbox" : "/login"} replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </BrowserRouter>
  );
}
