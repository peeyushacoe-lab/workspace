import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("cyberSageDesktop", {
  isDesktop: true,
  platform: () => ipcRenderer.invoke("get-platform") as Promise<string>,
  version: () => ipcRenderer.invoke("get-version") as Promise<string>,

  notify: (title: string, body: string) =>
    ipcRenderer.invoke("notify", { title, body }),

  setBadge: (count: number) => ipcRenderer.invoke("set-badge", count),

  installUpdate: () => ipcRenderer.invoke("install-update"),
  onUpdateAvailable: (cb: (v: { version: string }) => void) => {
    ipcRenderer.on("update-available", (_, data) => cb(data as { version: string }));
  },
  onUpdateDownloaded: (cb: (v: { version: string }) => void) => {
    ipcRenderer.on("update-downloaded", (_, data) => cb(data as { version: string }));
  },

  onNetworkStatus: (cb: (s: { online: boolean }) => void) => {
    ipcRenderer.on("network-status", (_, data) => cb(data as { online: boolean }));
  },

  onSystemResume: (cb: () => void) => {
    ipcRenderer.on("system-resume", () => cb());
  },

  openFile: (filePath: string) => ipcRenderer.invoke("open-file", filePath),
  showFile: (filePath: string) => ipcRenderer.invoke("show-file", filePath),
});
