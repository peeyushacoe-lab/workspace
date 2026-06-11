import { autoUpdater } from "electron-updater";
import { Notification, app } from "electron";
import path from "path";
import { getMainWindow } from "./window";

export function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("checking-for-update", () => {
    getMainWindow()?.webContents.send("updater-status", { status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    getMainWindow()?.webContents.send("update-available", {
      version: info.version,
    });
    new Notification({
      title: "Update available",
      body: `CyberSage ${info.version} is downloading in the background.`,
      icon: path.join(__dirname, "../../public/icon-512.png"),
    }).show();
  });

  autoUpdater.on("update-not-available", () => {
    getMainWindow()?.webContents.send("updater-status", {
      status: "up-to-date",
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    getMainWindow()?.webContents.send("update-progress", {
      percent: Math.round(progress.percent),
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    getMainWindow()?.webContents.send("update-downloaded", {
      version: info.version,
    });
    new Notification({
      title: "Update ready",
      body: `CyberSage ${info.version} will install when you restart.`,
      icon: path.join(__dirname, "../../public/icon-512.png"),
    }).show();
  });

  autoUpdater.on("error", (err) => {
    console.error("[updater]", err.message);
  });

  // Check on startup, then every 4 hours
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  setInterval(
    () => autoUpdater.checkForUpdatesAndNotify().catch(() => {}),
    4 * 60 * 60 * 1000
  );
}
