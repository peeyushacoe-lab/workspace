import { io, type Socket } from "socket.io-client";

let _socket: Socket | null = null;

// Real-time runs over a dedicated Socket.IO server (server.js). That server only
// exists when NEXT_PUBLIC_SOCKET_URL points at it (e.g. a separately-hosted
// always-on process). On Vercel (serverless) there is no Socket.IO server, so we
// skip it entirely and rely on SSE + polling — otherwise the browser endlessly
// retries a dead wss:// endpoint and floods the console with errors.
const SOCKET_URL =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SOCKET_URL : undefined;

/** Returns the shared Socket.IO client, or null when no socket server is configured. */
export function getSocket(): Socket | null {
  if (!SOCKET_URL) return null;
  if (!_socket) {
    _socket = io(SOCKET_URL, {
      path: "/api/socketio",
      autoConnect: false,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionAttempts: 10,
    });
  }
  return _socket;
}

/** Connect (or return the already-connected socket). Null when sockets are disabled. */
export function connectSocket(): Socket | null {
  const socket = getSocket();
  if (socket && !socket.connected) socket.connect();
  return socket;
}

/** Disconnect and destroy the singleton so it can be recreated. */
export function disconnectSocket(): void {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}
