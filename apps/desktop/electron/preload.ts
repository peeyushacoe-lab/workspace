import { contextBridge, ipcRenderer } from "electron";

type ApiOpts = {
  method: string;
  path: string;
  body?: Record<string, unknown>;
  form?: Record<string, string>;
  timeout?: number;
};

type ApiResult<T = unknown> = { ok: boolean; status: number; data: T; error?: string };

function on<T = unknown>(channel: string, cb: (data: T) => void) {
  const handler = (_: Electron.IpcRendererEvent, data: T) => cb(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

contextBridge.exposeInMainWorld("nexus", {
  isDesktop: true as const,
  platform: process.platform,

  // ── API proxy (all requests go through main process to avoid CORS) ──────────
  api: {
    request: <T = unknown>(opts: ApiOpts): Promise<ApiResult<T>> =>
      ipcRenderer.invoke("api:request", opts),
    logout: (): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke("api:logout"),
    hasSession: (): Promise<boolean> =>
      ipcRenderer.invoke("api:has-session"),
  },

  // ── Native notifications ───────────────────────────────────────────────────
  notify: (title: string, body: string): Promise<void> =>
    ipcRenderer.invoke("notify", { title, body }),

  badge: (count: number): Promise<void> =>
    ipcRenderer.invoke("badge", count),

  // ── Window controls ────────────────────────────────────────────────────────
  window: {
    minimize: () => ipcRenderer.send("win:minimize"),
    maximize: () => ipcRenderer.send("win:maximize"),
    close: () => ipcRenderer.send("win:close"),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke("win:is-maximized"),
  },

  // ── System ────────────────────────────────────────────────────────────────
  system: {
    info: (): Promise<{ platform: string; version: string; apiBase: string }> =>
      ipcRenderer.invoke("system:info"),
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke("shell:open", url),
    onDndToggle: (cb: () => void) => on("dnd:toggle", cb),
    onNotification: (cb: (data: { title: string; body: string }) => void) =>
      on("push:notification", cb),
  },

  // ── Meet signaling (SSE piped through main process) ──────────────────────
  meet: {
    subscribe: (roomId: string, cb: (data: unknown) => void): (() => void) => {
      const subId = `${roomId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      ipcRenderer.invoke("meet:subscribe", { subId, roomId });
      const handler = (_: Electron.IpcRendererEvent, data: unknown) => cb(data);
      ipcRenderer.on(`meet:signal:${subId}`, handler);
      return () => {
        ipcRenderer.off(`meet:signal:${subId}`, handler);
        ipcRenderer.invoke("meet:unsubscribe", subId);
      };
    },
  },
});
