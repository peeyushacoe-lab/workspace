import {
  app, BrowserWindow, ipcMain, protocol, shell,
  Tray, Menu, nativeImage, net, safeStorage,
  Notification,
} from "electron";
import path from "path";
import fs from "fs";

const IS_DEV = !app.isPackaged;

// ── API base URL ──────────────────────────────────────────────────────────────

function resolveApiBase(): string {
  if (IS_DEV) return "http://localhost:3000";
  try {
    const cfgPath = path.join(app.getPath("userData"), "config.json");
    if (fs.existsSync(cfgPath)) {
      const { apiUrl } = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as { apiUrl?: string };
      if (apiUrl) return apiUrl;
    }
  } catch {}
  return "https://cybersage-mail.vercel.app";
}

const API_BASE = resolveApiBase();

// ── Session (cookie jar for backend auth) ─────────────────────────────────────

const cookieJar = new Map<string, string>();
const sessionFile = () => path.join(app.getPath("userData"), "session.enc");

function cookieHeader(): string {
  return Array.from(cookieJar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

function absorbSetCookie(headers: Headers) {
  const raw: string[] = [];
  // Electron 22+ exposes getSetCookie()
  const h = headers as unknown as { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") {
    raw.push(...h.getSetCookie());
  } else {
    const single = headers.get("set-cookie");
    if (single) raw.push(single);
  }
  for (const s of raw) {
    const pair = s.split(";")[0] ?? "";
    const eq = pair.indexOf("=");
    if (eq < 1) continue;
    cookieJar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function loadSession() {
  try {
    if (!fs.existsSync(sessionFile())) return;
    const raw = fs.readFileSync(sessionFile(), "utf8");
    if (!safeStorage.isEncryptionAvailable()) return;
    const json = safeStorage.decryptString(Buffer.from(raw, "base64"));
    const obj = JSON.parse(json) as Record<string, string>;
    for (const [k, v] of Object.entries(obj)) cookieJar.set(k, v);
  } catch {}
}

function saveSession() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return;
    const json = JSON.stringify(Object.fromEntries(cookieJar));
    const enc = safeStorage.encryptString(json);
    fs.writeFileSync(sessionFile(), enc.toString("base64"), "utf8");
  } catch {}
}

function clearSession() {
  cookieJar.clear();
  try { fs.unlinkSync(sessionFile()); } catch {}
}

// ── IPC ───────────────────────────────────────────────────────────────────────

function registerIpc() {
  // General API proxy — all network from renderer goes through here (no CORS)
  ipcMain.handle("api:request", async (_, { method, path: p, body, form, timeout = 30_000 }: {
    method: string;
    path: string;
    body?: Record<string, unknown>;
    form?: Record<string, string>;
    timeout?: number;
  }) => {
    const url = `${API_BASE}${p}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);

    try {
      let requestBody: string | undefined;
      const reqHeaders: Record<string, string> = {
        "Cookie": cookieHeader(),
        "X-Nexus-Client": "desktop",
      };

      if (form) {
        const params = new URLSearchParams(form);
        requestBody = params.toString();
        reqHeaders["Content-Type"] = "application/x-www-form-urlencoded";
      } else if (body) {
        requestBody = JSON.stringify(body);
        reqHeaders["Content-Type"] = "application/json";
      }

      const res = await net.fetch(url, {
        method,
        body: requestBody,
        headers: reqHeaders,
        signal: ctrl.signal,
      });

      absorbSetCookie(res.headers);
      saveSession();

      const ct = res.headers.get("content-type") ?? "";
      const data = ct.includes("application/json") ? await res.json() : await res.text();
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return { ok: false, status: 0, data: null, error: String(err) };
    } finally {
      clearTimeout(t);
    }
  });

  ipcMain.handle("api:logout", async () => {
    try {
      await net.fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        headers: { "Cookie": cookieHeader() },
      });
    } catch {}
    clearSession();
    return { ok: true };
  });

  ipcMain.handle("api:has-session", () => cookieJar.size > 0);

  // Notifications
  ipcMain.handle("notify", (_, { title, body }: { title: string; body: string }) => {
    if (Notification.isSupported()) new Notification({ title, body }).show();
  });

  // Badge (Windows taskbar progress / macOS dock badge)
  ipcMain.handle("badge", (_, count: number) => {
    if (process.platform === "darwin") app.setBadgeCount(count);
  });

  // Window controls
  ipcMain.on("win:minimize", () => getMain()?.minimize());
  ipcMain.on("win:maximize", () => {
    const w = getMain();
    w?.isMaximized() ? w.unmaximize() : w?.maximize();
  });
  ipcMain.on("win:close", () => getMain()?.hide());
  ipcMain.handle("win:is-maximized", () => getMain()?.isMaximized() ?? false);

  // System info
  ipcMain.handle("system:info", () => ({
    platform: process.platform,
    version: app.getVersion(),
    apiBase: API_BASE,
  }));

  // Open URL externally
  ipcMain.handle("shell:open", (_, url: string) => shell.openExternal(url));

  // ── Meet signaling SSE (piped through main process for cookie auth) ────────
  const meetSubs = new Map<string, AbortController>();

  ipcMain.handle("meet:subscribe", async (_e, { subId, roomId }: { subId: string; roomId: string }) => {
    if (meetSubs.has(subId)) return { ok: true };
    const ctrl = new AbortController();
    meetSubs.set(subId, ctrl);

    (async () => {
      try {
        const res = await net.fetch(`${API_BASE}/api/meet/signal?roomId=${encodeURIComponent(roomId)}`, {
          method: "GET",
          headers: { "Cookie": cookieHeader(), "Accept": "text/event-stream" },
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          getMain()?.webContents.send(`meet:signal:${subId}`, { type: "error", error: `HTTP ${res.status}` });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const evt of events) {
            const dataLine = evt.split("\n").find(l => l.startsWith("data:"));
            if (!dataLine) continue;
            const payload = dataLine.slice(5).trim();
            try {
              const parsed = JSON.parse(payload);
              getMain()?.webContents.send(`meet:signal:${subId}`, parsed);
            } catch { /* ignore */ }
          }
        }
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          getMain()?.webContents.send(`meet:signal:${subId}`, { type: "error", error: String(err) });
        }
      } finally {
        meetSubs.delete(subId);
      }
    })();

    return { ok: true };
  });

  ipcMain.handle("meet:unsubscribe", (_e, subId: string) => {
    const ctrl = meetSubs.get(subId);
    if (ctrl) { ctrl.abort(); meetSubs.delete(subId); }
    return { ok: true };
  });
}

// ── Main window ───────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function getMain() { return mainWindow; }

const stateFile = () => path.join(app.getPath("userData"), "win-state.json");

type WinState = { w: number; h: number; x?: number; y?: number; max?: boolean };

function loadWinState(): WinState {
  try { return JSON.parse(fs.readFileSync(stateFile(), "utf8")) as WinState; } catch { return { w: 1300, h: 840 }; }
}
function saveWinState(s: WinState) {
  try { fs.writeFileSync(stateFile(), JSON.stringify(s)); } catch {}
}

function createMain() {
  const s = loadWinState();

  mainWindow = new BrowserWindow({
    width: s.w, height: s.h, x: s.x, y: s.y,
    minWidth: 920, minHeight: 620,
    backgroundColor: "#0f1321",
    title: "Nexus",
    show: false,
    // Custom title bar for macOS; default chrome on Windows looks like Teams/Outlook
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    icon: path.join(app.getAppPath(), "assets/icons/icon.png"),
  });

  if (s.max) mainWindow.maximize();

  const url = IS_DEV ? "http://localhost:5173" : "app://nexus/";
  mainWindow.loadURL(url);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.focus();
    if (IS_DEV) mainWindow?.webContents.openDevTools({ mode: "detach" });
    mainWindow?.webContents.on("before-input-event", (_, input) => {
      if (input.key === "F12") mainWindow?.webContents.toggleDevTools();
    });
  });

  mainWindow.on("close", (e) => {
    if (!mainWindow) return;
    // Minimise to tray on close instead of quitting
    if (process.platform !== "darwin") {
      e.preventDefault();
      mainWindow.hide();
      return;
    }
    const max = mainWindow.isMaximized();
    const b = mainWindow.getBounds();
    saveWinState({ w: b.width, h: b.height, x: b.x, y: b.y, max });
  });

  mainWindow.on("closed", () => { mainWindow = null; });

  // External links open in browser
  mainWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    void shell.openExternal(u);
    return { action: "deny" };
  });

  return mainWindow;
}

function buildMacAppMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "Preferences…", accelerator: "CmdOrCtrl+,", click: () => mainWindow?.webContents.send("nav:settings") },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" }, { role: "redo" }, { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" },
        { role: "pasteAndMatchStyle" }, { role: "delete" },
        { role: "selectAll" },
        { type: "separator" },
        {
          label: "Speech",
          submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
        },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" }, { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" }, { role: "zoom" },
        { type: "separator" },
        { role: "front" },
        { type: "separator" },
        { role: "window" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  const iconBase = path.join(app.getAppPath(), "assets/icons");
  const trayIconPath = path.join(iconBase, process.platform === "darwin" ? "trayTemplate.png" : "tray.png");
  const fallback = path.join(iconBase, "icon.png");
  const img = nativeImage.createFromPath(fs.existsSync(trayIconPath) ? trayIconPath : fallback);

  tray = new Tray(img.resize({ width: 16, height: 16 }));
  tray.setToolTip("Nexus Workspace");

  function rebuildMenu(dnd = false) {
    const menu = Menu.buildFromTemplate([
      {
        label: "Open Nexus",
        click: () => { mainWindow?.show(); mainWindow?.focus(); },
      },
      { type: "separator" },
      {
        label: dnd ? "✓ Do Not Disturb" : "Do Not Disturb",
        click: () => {
          mainWindow?.webContents.send("dnd:toggle");
          rebuildMenu(!dnd);
        },
      },
      { type: "separator" },
      { label: "Quit", click: () => { mainWindow?.destroy(); app.quit(); } },
    ]);
    tray?.setContextMenu(menu);
  }

  rebuildMenu();
  // macOS: single click shows window; Windows: double-click
  if (process.platform === "darwin") {
    tray.on("click", () => { mainWindow?.show(); mainWindow?.focus(); });
  } else {
    tray.on("double-click", () => { mainWindow?.show(); mainWindow?.focus(); });
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// Register app:// as a privileged scheme so cookies / fetch work from it
protocol.registerSchemesAsPrivileged([{
  scheme: "app",
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
    bypassCSP: false,
  },
}]);

app.whenReady().then(async () => {
  // Wipe HTTP cache so updated renderer files always load fresh
  const { session } = await import("electron");
  await session.defaultSession.clearCache();

  loadSession();

  // Serve Vite build via app:// in production (renderer is in extraResources → resources/renderer/)
  if (!IS_DEV) {
    protocol.handle("app", (req) => {
      const { pathname } = new URL(req.url);
      const fileName = pathname === "/" || !path.extname(pathname) ? "index.html" : pathname;
      // Use forward slashes for file:// URLs on all platforms
      const file = path.join(process.resourcesPath, "renderer", fileName).replace(/\\/g, "/");
      return net.fetch(`file:///${file}`, {
        headers: { "Cache-Control": "no-store" },
      });
    });
  }

  if (process.platform === "darwin") buildMacAppMenu();

  registerIpc();
  createMain();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMain();
    else mainWindow?.show();
  });
});

app.on("window-all-closed", () => {
  // On macOS keep app alive (standard behaviour).
  // On Windows/Linux we hide to tray, so this fires only on explicit quit.
  if (process.platform !== "darwin") return;
});

app.on("before-quit", () => {
  // Allow window to close on quit shortcut
  if (mainWindow) mainWindow.removeAllListeners("close");
});
