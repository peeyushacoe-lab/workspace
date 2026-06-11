import {
  ipcMain,
  dialog,
  shell,
  desktopCapturer,
  safeStorage,
  Notification,
  app,
} from "electron";
import { autoUpdater } from "electron-updater";
import fs from "fs";
import path from "path";
import { getMainWindow } from "./window";
import { updateTrayBadge } from "./tray";

const CRED_PATH = path.join(app.getPath("userData"), "credentials.enc");

export function registerIpcHandlers() {

  // ── System ────────────────────────────────────────────────────────────────

  ipcMain.handle("get-platform", () => process.platform);
  ipcMain.handle("get-version", () => app.getVersion());
  ipcMain.handle("get-app-path", () => app.getPath("userData"));

  // ── Notifications ─────────────────────────────────────────────────────────

  ipcMain.handle(
    "notify",
    (_, { title, body }: { title: string; body: string }) => {
      new Notification({
        title,
        body,
        icon: path.join(__dirname, "../../public/icon-512.png"),
      }).show();
    }
  );

  // ── Badge / Tray ──────────────────────────────────────────────────────────

  ipcMain.handle("set-badge", (_, count: number) => {
    updateTrayBadge(count);
  });

  // ── Auto-updater ──────────────────────────────────────────────────────────

  ipcMain.handle("check-for-updates", () => {
    if (!app.isPackaged) return;
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  });

  ipcMain.handle("install-update", () => {
    autoUpdater.quitAndInstall();
  });

  // ── Secure credential storage (safeStorage) ───────────────────────────────

  ipcMain.handle("cred-save", (_, key: string, value: string) => {
    if (!safeStorage.isEncryptionAvailable()) return false;
    try {
      const existing = loadCredentials();
      existing[key] = safeStorage.encryptString(value).toString("base64");
      fs.writeFileSync(CRED_PATH, JSON.stringify(existing));
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("cred-get", (_, key: string): string | null => {
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      const store = loadCredentials();
      const enc = store[key];
      if (!enc) return null;
      return safeStorage.decryptString(Buffer.from(enc, "base64"));
    } catch {
      return null;
    }
  });

  ipcMain.handle("cred-delete", (_, key: string) => {
    try {
      const store = loadCredentials();
      delete store[key];
      fs.writeFileSync(CRED_PATH, JSON.stringify(store));
      return true;
    } catch {
      return false;
    }
  });

  // ── File system ───────────────────────────────────────────────────────────

  ipcMain.handle("open-file", (_, filePath: string) => {
    shell.openPath(filePath).catch(() => {});
  });

  ipcMain.handle("show-file", (_, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle("open-file-dialog", async (_, opts: Electron.OpenDialogOptions) => {
    const win = getMainWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, opts);
    return result.canceled ? null : result.filePaths;
  });

  ipcMain.handle("save-file-dialog", async (_, opts: Electron.SaveDialogOptions) => {
    const win = getMainWindow();
    if (!win) return null;
    const result = await dialog.showSaveDialog(win, opts);
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle(
    "read-file",
    (_, filePath: string): string | null => {
      try {
        return fs.readFileSync(filePath, "base64");
      } catch {
        return null;
      }
    }
  );

  ipcMain.handle(
    "write-file",
    (_, filePath: string, base64: string) => {
      try {
        fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
        return true;
      } catch {
        return false;
      }
    }
  );

  // ── Screen share (desktopCapturer) ────────────────────────────────────────

  ipcMain.handle("get-screen-sources", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 320, height: 180 },
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon?.toDataURL() ?? null,
    }));
  });

  // ── Window controls ───────────────────────────────────────────────────────

  ipcMain.handle("window-minimize", () => getMainWindow()?.minimize());
  ipcMain.handle("window-maximize", () => {
    const win = getMainWindow();
    if (!win) return;
    win.isMaximized() ? win.unmaximize() : win.maximize();
  });
  ipcMain.handle("window-close", () => getMainWindow()?.close());
  ipcMain.handle("window-is-maximized", () =>
    getMainWindow()?.isMaximized() ?? false
  );
}

function loadCredentials(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(CRED_PATH, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}
