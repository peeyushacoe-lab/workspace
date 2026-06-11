import { BrowserWindow, shell, powerMonitor, app } from "electron";
import path from "path";
import fs from "fs";

const IS_DEV = !app.isPackaged;

// ── App URL resolution ────────────────────────────────────────────────────────
// Priority: env var → config file → production URL
// Set CYBERSAGE_URL in the environment to override.

function resolveAppUrl(): string {
  if (IS_DEV) return "http://localhost:3000";
  if (process.env.CYBERSAGE_URL) return process.env.CYBERSAGE_URL;

  // Config file: users can create %APPDATA%\CyberSage\config.json { "url": "..." }
  try {
    const cfg = path.join(app.getPath("userData"), "config.json");
    if (fs.existsSync(cfg)) {
      const { url } = JSON.parse(fs.readFileSync(cfg, "utf8")) as { url?: string };
      if (url) return url;
    }
  } catch {}

  // Hardcoded production deployment — this is your Vercel production domain.
  // Update this string to match your actual deployment (disable preview protection
  // in Vercel → Settings → Deployment Protection, or use your custom domain).
  return "https://cybersage-mail.vercel.app";
}

const APP_URL = resolveAppUrl();

// ── Window state persistence ──────────────────────────────────────────────────

type WinState = { bounds?: Electron.Rectangle; maximized?: boolean };
const statePath = path.join(app.getPath("userData"), "window-state.json");

function loadState(): WinState {
  try { return JSON.parse(fs.readFileSync(statePath, "utf8")) as WinState; } catch { return {}; }
}
function saveState(s: WinState) {
  try { fs.writeFileSync(statePath, JSON.stringify(s)); } catch {}
}

// ── Window ────────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

export function getMainWindow() { return mainWindow; }

export function createMainWindow(): BrowserWindow {
  const { bounds, maximized } = loadState();

  mainWindow = new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 820,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#0f1321",
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
    icon: path.join(__dirname, "../../public/icon-512.png"),
    show: false,
    autoHideMenuBar: false,
  });

  if (maximized) mainWindow.maximize();

  mainWindow.loadURL(`${APP_URL}/inbox`);
  mainWindow.once("ready-to-show", () => mainWindow?.show());

  mainWindow.on("close", () => {
    if (!mainWindow) return;
    const isMax = mainWindow.isMaximized();
    saveState({ maximized: isMax, bounds: isMax ? bounds : mainWindow.getBounds() });
  });
  mainWindow.on("closed", () => { mainWindow = null; });

  // External links open in OS browser, internal links stay in the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL) || url.startsWith("http://localhost")) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  powerMonitor.on("resume", () => mainWindow?.webContents.send("system-resume"));
  powerMonitor.on("lock-screen", () => mainWindow?.webContents.send("system-lock"));

  return mainWindow;
}

export function navigateMainWindow(urlPath: string) {
  mainWindow?.loadURL(`${APP_URL}${urlPath}`);
}

export function getAppUrl(): string {
  return APP_URL;
}
