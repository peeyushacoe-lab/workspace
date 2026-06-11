import { useState, useEffect, createContext, useContext, type ReactNode, createElement } from "react";
import type { SessionUser } from "@/api/client";
import { getMe, logout as apiLogout } from "@/api/client";

type AuthState = {
  user: SessionUser | null;
  loading: boolean;
  login(user: SessionUser): void;
  logout(): Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const hasSession = await window.nexus.api.hasSession();
        if (hasSession) {
          const me = await getMe();
          setUser(me);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function logout() {
    await apiLogout();
    setUser(null);
  }

  return createElement(AuthCtx.Provider, {
    value: { user, loading, login: setUser, logout },
  }, children);
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
