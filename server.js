// @ts-check
"use strict";

/**
 * Custom Next.js + Socket.IO server (Phase 33 — WebSocket Infrastructure)
 *
 * Architecture:
 *  - Socket.IO handles all real-time transport (replaces SSE EventSource)
 *  - Redis pub/sub bridge: API routes still publish to Redis channels;
 *    this server subscribes via psubscribe and re-emits to Socket.IO rooms
 *  - Typing + presence are pure Socket.IO (no Redis/DB needed)
 *  - Redis adapter enables horizontal scaling across instances
 */

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { Redis } = require("ioredis");
const crypto = require("crypto");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

// ── Session verification (mirrors src/lib/session-crypto.ts) ─────────────────

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

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      await handle(req, res, parse(req.url ?? "/", true));
    } catch (err) {
      console.error("[server] Next.js handler error:", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  // ── Socket.IO server ───────────────────────────────────────────────────────
  const io = new Server(httpServer, {
    path: "/api/socketio",
    cors: { origin: false },
    transports: ["websocket", "polling"],
    pingTimeout: 60_000,
    pingInterval: 25_000,
  });

  // Redis adapter — cross-instance broadcasting when horizontally scaled
  const adapterPub = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const adapterSub = adapterPub.duplicate();
  io.adapter(createAdapter(adapterPub, adapterSub));
  console.log("[socket] Redis adapter initialised");

  // Redis bridge — subscribe to all chat channels via pattern match,
  // forward each published message to the matching Socket.IO room.
  // Event names map: Redis type "message" → Socket.IO "chat:message"
  const bridge = new Redis(redisUrl, { maxRetriesPerRequest: null });
  bridge.psubscribe("chat:channel:*").catch((err) =>
    console.error("[socket] psubscribe failed:", err)
  );
  bridge.on("pmessage", (_pattern, channel, raw) => {
    try {
      const channelId = channel.slice("chat:channel:".length);
      const { type, data } = JSON.parse(raw);
      io.to(`channel:${channelId}`).emit(`chat:${type}`, data);
    } catch { /* ignore malformed */ }
  });

  // ── Auth middleware ────────────────────────────────────────────────────────
  io.use((socket, next) => {
    const user = getSessionUser(socket.handshake.headers.cookie);
    if (!user) return next(new Error("Unauthorized"));
    socket.data.user = user;
    next();
  });

  // ── Connection handlers ────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    const { id: userId, fullName } = socket.data.user;

    // Join a chat channel room
    socket.on("chat:join", ({ channelId }) => {
      void socket.join(`channel:${channelId}`);
      socket.to(`channel:${channelId}`).emit("chat:presence", {
        userId, fullName, online: true,
      });
    });

    // Leave a chat channel room explicitly
    socket.on("chat:leave", ({ channelId }) => {
      void socket.leave(`channel:${channelId}`);
      socket.to(`channel:${channelId}`).emit("chat:presence", {
        userId, fullName, online: false,
      });
    });

    // Typing indicator — broadcast directly, no DB/Redis needed
    socket.on("chat:typing", ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit("chat:typing", { userId, fullName });
    });

    // Announce offline to all joined channel rooms on disconnect
    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        if (room.startsWith("channel:")) {
          socket.to(room).emit("chat:presence", { userId, fullName, online: false });
        }
      }
    });
  });

  // ── Start listening ────────────────────────────────────────────────────────
  httpServer.once("error", (err) => { console.error(err); process.exit(1); });
  httpServer.listen(port, () => {
    console.log(`> CyberSage ready on http://localhost:${port} [${dev ? "dev" : "prod"}]`);
  });
});
