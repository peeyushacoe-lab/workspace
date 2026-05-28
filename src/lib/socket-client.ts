import { io, type Socket } from "socket.io-client";

let _socket: Socket | null = null;

/** Returns the shared Socket.IO client instance, creating it lazily. */
export function getSocket(): Socket {
  if (!_socket) {
    _socket = io({
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

/** Connect (or return the already-connected socket). */
export function connectSocket(): Socket {
  const socket = getSocket();
  if (!socket.connected) socket.connect();
  return socket;
}

/** Disconnect and destroy the singleton so it can be recreated. */
export function disconnectSocket(): void {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}
