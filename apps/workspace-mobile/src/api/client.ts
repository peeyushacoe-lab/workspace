import * as SecureStore from "expo-secure-store";

export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "https://cybersage-mail.vercel.app";

const TOKEN_KEY   = "cs_access_token";
const REFRESH_KEY = "cs_refresh_token";

export async function getAccessToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function setTokens(access: string, refresh: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, access);
  await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}
export async function clearTokens() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

async function refreshAccess(): Promise<string | null> {
  const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refresh) return null;
  try {
    const res = await fetch(`${API_BASE}/api/mobile/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) { await clearTokens(); return null; }
    const data = await res.json() as { accessToken: string };
    await SecureStore.setItemAsync(TOKEN_KEY, data.accessToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let token = await getAccessToken();

  const doFetch = async (t: string | null) =>
    fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
        ...(options.headers ?? {}),
      },
    });

  let res = await doFetch(token);

  if (res.status === 401) {
    token = await refreshAccess();
    if (!token) throw new Error("SESSION_EXPIRED");
    res = await doFetch(token);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}
