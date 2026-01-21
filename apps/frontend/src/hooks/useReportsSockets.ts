import { useEffect } from "react";
import { socket } from "../lib/socket";

type StatusChanged = { reportId?: string; id?: string; status: string };

export function useReportsSocket(
  onStatusChange: (payload: StatusChanged) => void,
  onReportUpdate?: (report: any) => void,
  onReportCreated?: (report: any) => void
) {
  useEffect(() => {
    const handleStatus = (payload: any) => onStatusChange(payload);
    const handleUpdated = (report: any) => onReportUpdate?.(report);
    const handleCreated = (report: any) => onReportCreated?.(report);

    // ✅ match backend emits
    socket.on("report.statusChanged", handleStatus);
    socket.on("report.updated", handleUpdated);
    socket.on("report.created", handleCreated);

    socket.on("connect_error", (err) => {
      console.warn("socket connect_error:", err);
    });

    return () => {
      socket.off("report.statusChanged", handleStatus);
      socket.off("report.updated", handleUpdated);
      socket.off("report.created", handleCreated);
      // ❌ DO NOT close/disconnect here
    };
  }, [onStatusChange, onReportUpdate, onReportCreated]);
}
