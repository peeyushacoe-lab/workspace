/**
 * Electron preload — exposes a limited IPC bridge to the renderer
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("cyberSageDesktop", {
  notify: (title: string, body: string) => ipcRenderer.invoke("notify", { title, body }),
  setBadge: (count: number) => ipcRenderer.invoke("set-badge", count),
  platform: process.platform,
  isDesktop: true,
});
