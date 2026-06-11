/**
 * Runs the Next.js + Socket.IO server inside the Electron main process.
 * The main process has full Node.js + asar module access, so require("next")
 * resolves correctly from the bundled node_modules.
 */

import { app } from "electron";
import path from "path";
import fs from "fs";
import net from "net";
import crypto from "crypto";

const IS_DEV = !app.isPackaged;

let _url = "";
let _httpServer: ReturnType<typeof import("http").createServer> | null = null;

export function getServerUrl(): string {
  return _url;
}

export function stopServer() {
  _httpServer?.close();
  _httpServer = null;
  _url = "";
}

// ── Env loading ───────────────────────────────────────────────────────────────

function loadEnv() {
  const candidates = [
    path.join(app.getPath("userData"), ".env"),   // user-created
    path.join(process.resourcesPath ?? "", ".env"), // bundled
    // dev fallback handled by Next.js itself
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
    console.log("[server] env loaded from", p);
    return;
  }
}

// ── Port helper ───────────────────────────────────────────────────────────────

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

// ── Session helper (for Socket.IO auth) ───────────────────────────────────────

function verifySession(cookieHeader?: string): boolean {
  if (!cookieHeader) return false;
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    cookies[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  const signed = cookies["cybersage_user"];
  if (!signed) return false;
  try {
    const secret = process.env.JWT_SECRET ?? "dev-secret-please-change";
    const sep = signed.lastIndexOf(".");
    if (sep < 0) return false;
    const payload = signed.slice(0, sep);
    const sig = signed.slice(sep + 1);
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── Server bootstrap ──────────────────────────────────────────────────────────

export async function startServer(): Promise<string> {
  if (_url) return _url;

  // In dev, assume `npm run dev` is already running on 3000
  if (IS_DEV) {
    _url = "http://127.0.0.1:3000";
    return _url;
  }

  // Disable Next.js telemetry in packaged app
  process.env.NEXT_TELEMETRY_DISABLED = "1";

  loadEnv();

  const port = await freePort();

  // appDir is the resources directory — .next and public are extraResources here
  const appDir = process.resourcesPath;

  console.log("[server] starting Next.js at", appDir, "port", port);

  // These require() calls resolve from the bundled node_modules in the asar.
  // The main process has Electron's asar-patched require, so this works.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const next = (require("next") as { default: typeof import("next").default }).default
    ?? require("next");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createServer } = require("http") as typeof import("http");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parse } = require("url") as typeof import("url");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Server } = require("socket.io") as typeof import("socket.io");

  const nextApp = next({ dev: false, dir: appDir });

  console.log("[server] preparing Next.js (may take 10-30s)...");
  await nextApp.prepare();
  console.log("[server] Next.js prepared");

  const handle = nextApp.getRequestHandler();
  _httpServer = createServer((req, res) => {
    handle(req, res, parse(req.url ?? "/", true));
  });

  // In-memory Socket.IO — no Redis needed on the desktop
  const io = new Server(_httpServer, {
    path: "/api/socketio",
    cors: { origin: false },
    transports: ["websocket", "polling"],
    pingTimeout: 60_000,
    pingInterval: 25_000,
  });

  io.use((socket, next) => {
    if (verifySession(socket.handshake.headers.cookie as string)) return next();
    return next(new Error("Unauthorized"));
  });

  io.on("connection", (socket) => {
    socket.on("chat:join", ({ channelId }: { channelId: string }) => {
      void socket.join(`channel:${channelId}`);
      socket.to(`channel:${channelId}`).emit("chat:presence", { socketId: socket.id, online: true });
    });
    socket.on("chat:leave", ({ channelId }: { channelId: string }) => {
      void socket.leave(`channel:${channelId}`);
    });
    socket.on("chat:typing", ({ channelId }: { channelId: string }) => {
      socket.to(`channel:${channelId}`).emit("chat:typing", { socketId: socket.id });
    });
    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        if (room.startsWith("channel:")) {
          socket.to(room).emit("chat:presence", { socketId: socket.id, online: false });
        }
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    _httpServer!.listen(port, "127.0.0.1", resolve);
    _httpServer!.on("error", reject);
  });

  _url = `http://127.0.0.1:${port}`;
  console.log("[server] ready →", _url);
  return _url;
}
