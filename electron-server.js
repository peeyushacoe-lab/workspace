// @ts-check
"use strict";

/**
 * Bundled Next.js server for the Electron desktop app.
 * Runs inside the packaged app via utilityProcess.fork().
 * Uses in-memory Socket.IO adapter — no Redis needed on the desktop.
 */

const { createServer } = require("http");
const { parse } = require("url");
const path = require("path");
const crypto = require("crypto");

const port = parseInt(process.env.ELECTRON_SERVER_PORT ?? "3721", 10);

// __dirname in the packaged app = process.resourcesPath
// __dirname in dev = project root
const appDir = __dirname;

// ── Session verification ──────────────────────────────────────────────────────

function verifyPayload(signed) {
  const secret = process.env.JWT_SECRET ?? "dev-secret-please-change";
  const sep = signed.lastIndexOf(".");
  if (sep === -1) return null;
  const payload = signed.slice(0, sep);
  const sig = signed.slice(sep + 1);
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch { return null; }
  return Buffer.from(payload, "base64url").toString("utf8");
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

function getSessionUser(cookieHeader) {
  const cookies = parseCookies(cookieHeader ?? "");
  const signed = cookies["cybersage_user"];
  if (!signed) return null;
  try {
    const json = verifyPayload(signed);
    return json ? JSON.parse(json) : null;
  } catch { return null; }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const next = require("next");
const { Server } = require("socket.io");

const nextApp = next({ dev: false, dir: appDir });
const handle = nextApp.getRequestHandler();

nextApp.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    try {
      handle(req, res, parse(req.url ?? "/", true));
    } catch (err) {
      console.error("[electron-server]", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  // Socket.IO — in-memory adapter (no Redis needed on desktop)
  const io = new Server(httpServer, {
    path: "/api/socketio",
    cors: { origin: false },
    transports: ["websocket", "polling"],
    pingTimeout: 60_000,
    pingInterval: 25_000,
  });

  io.use((socket, next) => {
    const user = getSessionUser(socket.handshake.headers.cookie);
    if (!user) return next(new Error("Unauthorized"));
    socket.data.user = user;
    next();
  });

  io.on("connection", (socket) => {
    const { id: userId, fullName } = socket.data.user;

    socket.on("chat:join", ({ channelId }) => {
      void socket.join(`channel:${channelId}`);
      socket.to(`channel:${channelId}`).emit("chat:presence", { userId, fullName, online: true });
    });

    socket.on("chat:leave", ({ channelId }) => {
      void socket.leave(`channel:${channelId}`);
      socket.to(`channel:${channelId}`).emit("chat:presence", { userId, fullName, online: false });
    });

    socket.on("chat:typing", ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit("chat:typing", { userId, fullName });
    });

    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        if (room.startsWith("channel:")) {
          socket.to(room).emit("chat:presence", { userId, fullName, online: false });
        }
      }
    });
  });

  httpServer.listen(port, "127.0.0.1", () => {
    console.log(`[electron-server] ready on http://127.0.0.1:${port}`);
    // Signal to main process that we are ready
    if (process.parentPort) {
      process.parentPort.postMessage({ type: "ready", port });
    }
  });

  httpServer.on("error", (err) => {
    console.error("[electron-server] fatal:", err);
    process.exit(1);
  });
});
