/**
 * CyberSage Desktop — Electron main process (Phase 34 — Desktop Production)
 * Build: npx electron-builder
 * Dev:   npx tsx electron/main.ts
 */
import {
  app, BrowserWindow, Tray, Menu, nativeImage,
  ipcMain, shell, protocol, Notification,
  powerMonitor, net,
} from "electron";
import { autoUpdater } from "electron-updater";
import Store from "electron-store";
import path from "path";

const APP_URL = process.env.CYBERSAGE_URL ?? "https://cybersage.uk";
const IS_DEV  = !app.isPackaged;

// Persistent window state
const store = new Store<{ bounds?: Electron.Rectangle; maximized?: boolean }>();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  const savedBounds = store.get("bounds");
  const wasMaximized = store.get("maximized", false);

  mainWindow = new BrowserWindow({
    width: savedBounds?.width ?? 1280,
    height: savedBounds?.height ?? 800,
    x: savedBounds?.x,
    y: savedBounds?.y,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#0f1321",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    icon: path.join(__dirname, "../public/icons/icon-512.png"),
    show: false,
  });

  if (wasMaximized) mainWindow.maximize();

  mainWindow.loadURL(IS_DEV ? "http://localhost:3000" : APP_URL);
  mainWindow.once("ready-to-show", () => mainWindow?.show());

  // Persist window state on close
  mainWindow.on("close", () => {
    if (!mainWindow) return;
    store.set("maximized", mainWindow.isMaximized());
    if (!mainWindow.isMaximized()) store.set("bounds", mainWindow.getBounds());
  });

  mainWindow.on("closed", () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Offline/online detection → notify renderer
  net.on("online", () => {
    mainWindow?.webContents.send("network-status", { online: true });
  });
  net.on("offline", () => {
    mainWindow?.webContents.send("network-status", { online: false });
  });

  // System sleep/wake → reconnect WebSocket
  powerMonitor.on("resume", () => {
    mainWindow?.webContents.send("system-resume");
  });
}

// ── Tray ──────────────────────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, "../public/icons/tray-icon.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("CyberSage Workspace");

  const rebuild = (unreadCount = 0) =>
    tray?.setContextMenu(Menu.buildFromTemplate([
      { label: "Open CyberSage", click: () => { mainWindow ? mainWindow.show() : createWindow(); } },
      { label: "Compose", click: () => mainWindow?.webContents.executeJavaScript("window.__csCompose?.()") },
      { type: "separator" },
      ...(unreadCount > 0 ? [{ label: `${unreadCount} unread`, enabled: false }] : []),
      { label: "Check for updates", click: () => autoUpdater.checkForUpdatesAndNotify() },
      { type: "separator" as const },
      { label: "Quit", role: "quit" as const },
    ]));

  rebuild();
  tray.on("double-click", () => mainWindow?.show());

  // Re-expose so badge IPC can update it
  return { rebuild };
}

// ── Auto-updater ──────────────────────────────────────────────────────────────

function setupAutoUpdater() {
  if (IS_DEV) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    mainWindow?.webContents.send("update-available", { version: info.version });
    new Notification({
      title: "Update available",
      body: `CyberSage ${info.version} is downloading in the background.`,
    }).show();
  });

  autoUpdater.on("update-downloaded", (info) => {
    mainWindow?.webContents.send("update-downloaded", { version: info.version });
    new Notification({
      title: "Update ready",
      body: `CyberSage ${info.version} will install on next launch.`,
    }).show();
  });

  autoUpdater.on("error", (err) => {
    console.error("[updater] error:", err.message);
  });

  // Check on startup + every 4 hours
  autoUpdater.checkForUpdatesAndNotify().catch(console.error);
  setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(console.error), 4 * 60 * 60 * 1000);
}

// ── Protocol ──────────────────────────────────────────────────────────────────

app.setAsDefaultProtocolClient("cybersage");

// ── Startup ───────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  protocol.handle("cybersage", (request) => {
    const url = new URL(request.url);
    mainWindow?.loadURL(`${APP_URL}${url.pathname}${url.search}`);
    return new Response(null, { status: 302 });
  });

  createWindow();
  const { rebuild } = createTray();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // ── IPC handlers ───────────────────────────────────────────────────────────

  ipcMain.handle("notify", (_, { title, body }: { title: string; body: string }) => {
    new Notification({ title, body, icon: path.join(__dirname, "../public/icons/icon-512.png") }).show();
  });

  ipcMain.handle("set-badge", (_, count: number) => {
    if (process.platform === "darwin") app.setBadgeCount(count);
    tray?.setTitle(count > 0 ? `${count}` : "");
    rebuild(count);
  });

  ipcMain.handle("install-update", () => {
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle("get-platform", () => process.platform);

  ipcMain.handle("get-version", () => app.getVersion());

  // File drag-drop: renderer sends a path, open in default app
  ipcMain.handle("open-file", (_, filePath: string) => {
    shell.openPath(filePath).catch(console.error);
  });

  ipcMain.handle("show-file", (_, filePath: string) => {
    shell.showItemInFolder(filePath);
  });
});

// ── App events ────────────────────────────────────────────────────────────────

app.on("window-all-closed", () => {
  // macOS: keep running in tray
  if (process.platform !== "darwin") app.quit();
});

// Deep link handler (macOS open-url / Windows second-instance)
app.on("open-url", (_, url) => {
  const deepPath = url.replace("cybersage://", "/");
  mainWindow?.loadURL(`${APP_URL}${deepPath}`);
  mainWindow?.focus();
});

app.on("second-instance", (_, argv) => {
  // Windows: focus existing window on second launch
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  const url = argv.find((a) => a.startsWith("cybersage://"));
  if (url) {
    const deepPath = url.replace("cybersage://", "/");
    mainWindow?.loadURL(`${APP_URL}${deepPath}`);
  }
});

// Single-instance lock
if (!app.requestSingleInstanceLock()) app.quit();
