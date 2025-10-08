// import { useEffect } from "react";
// import io from "socket.io-client";

// const socket = io("http://localhost:3000");

// export function useReportsSocket(
//   onStatusChange: (id: string, newStatus: string) => void,
//   onReportUpdate?: (report: any) => void,
//   onReportCreated?: (report: any) => void
// ) {
//   useEffect(() => {
//     socket.on(
//       "reportStatusChanged",
//       ({ reportId, newStatus }: { reportId: string; newStatus: string }) => {
//         onStatusChange(reportId, newStatus);
//       }
//     );

//     if (onReportUpdate) {
//       socket.on("reportUpdated", (report: any) => onReportUpdate(report));
//     }

//     if (onReportCreated) {
//       socket.on("reportCreated", (report: any) => onReportCreated(report));
//     }

//     return () => {
//       socket.off("reportStatusChanged");
//       socket.off("reportUpdated");
//       socket.off("reportCreated");
//     };
//   }, [onStatusChange, onReportUpdate, onReportCreated]);
// }
// src/hooks/useReportsSocket.ts
import { useEffect, useRef } from "react";
import io from "socket.io-client";
import { API_URL, WS_URL, getToken } from "../lib/api";

type StatusChanged = { id: string; status: string };
type SocketRef = ReturnType<typeof io> | null;

function resolveWsUrl() {
  if (WS_URL) return WS_URL;                     // e.g. wss://omega-lims.fly.dev
  if (!API_URL) throw new Error("API_URL missing");
  return API_URL.replace(/^http/, "ws");         // http->ws, https->wss
}

export function useReportsSocket(
  onStatusChange: (payload: StatusChanged) => void,
  onReportUpdate?: (report: any) => void,
  onReportCreated?: (report: any) => void
) {
  const socketRef = useRef<SocketRef>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const url = resolveWsUrl();
    const s = io(url, {
      transports: ["websocket"],
      auth: { token }, // make sure your Nest gateway reads auth.token
      // path: "/socket.io", // set if your server uses a custom path
    });
    socketRef.current = s;

    const handleStatus = (payload: StatusChanged) => onStatusChange(payload);
    const handleUpdated = (report: any) => onReportUpdate?.(report);
    const handleCreated = (report: any) => onReportCreated?.(report);

    // Use your backend's actual event names
    s.on("microMix:statusChanged", handleStatus);
    s.on("microMix:updated", handleUpdated);
    s.on("microMix:created", handleCreated);

    s.on("connect_error", (err: unknown) => {
      console.warn("socket connect_error:", err);
    });

    return () => {
      s.off("microMix:statusChanged", handleStatus);
      s.off("microMix:updated", handleUpdated);
      s.off("microMix:created", handleCreated);
      s.close();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onStatusChange, onReportUpdate, onReportCreated]);
}
