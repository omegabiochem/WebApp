import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { API_URL, WS_URL, getToken } from "./api";

function socketBaseUrl() {
  const raw = (WS_URL ?? API_URL ?? "http://localhost:3000").trim();
  return raw.replace(/^ws/i, "http").replace(/\/api\/?$/, "");
}

declare global {
  interface Window {
    __omegaSocket?: Socket;
  }
}
if (window.__omegaSocket) {
  window.__omegaSocket.removeAllListeners();
  window.__omegaSocket.disconnect();
  delete window.__omegaSocket;
}
let attemptedToken: string | null = null;
let waitingForFreshToken = false;
export const socket: Socket = io(socketBaseUrl(), {
  transports: ["websocket"],
  withCredentials: true,
  autoConnect: false,
  // Called for every connection attempt, including reconnections after refresh.
  auth: (callback) => {
    attemptedToken = getToken() || null;
    callback({ token: attemptedToken });
  },
});
window.__omegaSocket = socket;

socket.on("notifications:auth-required", () => {
  waitingForFreshToken = true;
});
socket.on("connect_error", (error) => {
  if (
    (error as Error & { data?: { code?: string } }).data?.code ===
    "AUTH_REQUIRED"
  )
    waitingForFreshToken = true;
});
socket.on("connect", () => {
  waitingForFreshToken = false;
});
socket.on("disconnect", (reason) => {
  if (reason === "io client disconnect") waitingForFreshToken = false;
});

// A changed login/refresh token requires a new authenticated handshake.
export function syncNotificationSocketAuth() {
  const token = getToken() || null;
  if (token === attemptedToken) return;
  if (socket.connected) {
    socket.disconnect();
    if (token) socket.connect();
  } else if (waitingForFreshToken && token) {
    waitingForFreshToken = false;
    socket.connect();
  }
}
const tokenCheck = window.setInterval(syncNotificationSocketAuth, 2000);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.clearInterval(tokenCheck);
    socket.removeAllListeners();
    socket.disconnect();
    if (window.__omegaSocket === socket) delete window.__omegaSocket;
  });
}
