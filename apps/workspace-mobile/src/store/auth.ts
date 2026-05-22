import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { API_BASE, setTokens, clearTokens } from "../api/client";

interface AuthUser {
  id: string; email: string; fullName: string;
  role: string; avatarUrl?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ mfaRequired?: boolean; mfaToken?: string }>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

const USER_KEY = "cs_user";

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  hydrate: async () => {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    if (raw) { try { set({ user: JSON.parse(raw) as AuthUser, loading: false }); return; } catch {} }
    set({ loading: false });
  },

  login: async (email, password) => {
    const res = await fetch(`${API_BASE}/api/mobile/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json() as {
      mfaRequired?: boolean; mfaToken?: string;
      accessToken?: string; refreshToken?: string;
      user?: AuthUser; error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? "Login failed");
    if (data.mfaRequired) return { mfaRequired: true, mfaToken: data.mfaToken };
    await setTokens(data.accessToken!, data.refreshToken!);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data.user));
    set({ user: data.user! });
    return {};
  },

  logout: async () => {
    await clearTokens();
    await SecureStore.deleteItemAsync(USER_KEY);
    set({ user: null });
  },
}));
