/**
 * CyberSage Desktop — Electron main process (Phase 20)
 * Build: npx electron-builder --dir
 * Dev:   npx electron electron/main.ts (via tsx)
 */
import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, protocol, Notification } from "electron";
import path from "path";

const APP_URL = process.env.CYBERSAGE_URL ?? "https://cybersage.uk";
const IS_DEV  = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
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

  mainWindow.loadURL(APP_URL);
  mainWindow.once("ready-to-show", () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

function createTray() {
  const iconPath = path.join(__dirname, "../public/icons/tray-icon.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("CyberSage Workspace");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open CyberSage", click: () => { mainWindow?.show() ?? createWindow(); } },
    { label: "Compose", click: () => mainWindow?.webContents.executeJavaScript("window.__csCompose?.()") },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]));
  tray.on("double-click", () => mainWindow?.show());
}

// Register cybersage:// protocol for deep links
app.setAsDefaultProtocolClient("cybersage");

app.whenReady().then(() => {
  // Intercept CSP-blocked navigation attempts for local resources
  protocol.handle("cybersage", (request) => {
    const url = new URL(request.url);
    mainWindow?.loadURL(`${APP_URL}${url.pathname}${url.search}`);
    return new Response(null, { status: 302 });
  });

  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Deep link handler (macOS / Windows)
app.on("open-url", (_, url) => {
  const path = url.replace("cybersage://", "/");
  mainWindow?.loadURL(`${APP_URL}${path}`);
  mainWindow?.focus();
});

// IPC: show desktop notification from renderer
ipcMain.handle("notify", (_, { title, body }: { title: string; body: string }) => {
  new Notification({ title, body, icon: path.join(__dirname, "../public/icons/icon-512.png") }).show();
});

// IPC: badge count for unread mail
ipcMain.handle("set-badge", (_, count: number) => {
  if (process.platform === "darwin") app.setBadgeCount(count);
  tray?.setTitle(count > 0 ? `${count}` : "");
});
