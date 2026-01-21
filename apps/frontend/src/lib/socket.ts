import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { API_URL, WS_URL, getToken } from "./api";

function socketBaseUrl() {
  const raw = (WS_URL ?? API_URL ?? "http://localhost:3000").trim();
  const httpish = raw.replace(/^ws/, "http");
  return httpish.replace(/\/api\/?$/, "");
}

declare global {
  interface Window {
    __omegaSocket?: Socket;
  }
}

const URL = socketBaseUrl();

// ✅ If a stale socket exists (from previous HMR run), kill it
if (window.__omegaSocket) {
  try {
    window.__omegaSocket.removeAllListeners();
    window.__omegaSocket.disconnect();
  } catch {}
  delete window.__omegaSocket;
}

export const socket: Socket = io(URL, {
  transports: ["websocket"],
  withCredentials: true,
  autoConnect: false,
  auth: { token: getToken() }, // ✅ initial value (may be null)
});

// ✅ Vite HMR: disconnect when module is replaced
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try {
      socket.removeAllListeners();
      socket.disconnect();
    } catch {}
  });
}
