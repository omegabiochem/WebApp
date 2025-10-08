import { useEffect } from "react";
import io from "socket.io-client";

const socket = io("http://localhost:3000");

export function useReportsSocket(
  onStatusChange: (id: string, newStatus: string) => void,
  onReportUpdate?: (report: any) => void,
  onReportCreated?: (report: any) => void
) {
  useEffect(() => {
    socket.on(
      "reportStatusChanged",
      ({ reportId, newStatus }: { reportId: string; newStatus: string }) => {
        onStatusChange(reportId, newStatus);
      }
    );

    if (onReportUpdate) {
      socket.on("reportUpdated", (report: any) => onReportUpdate(report));
    }

    if (onReportCreated) {
      socket.on("reportCreated", (report: any) => onReportCreated(report));
    }

    return () => {
      socket.off("reportStatusChanged");
      socket.off("reportUpdated");
      socket.off("reportCreated");
    };
  }, [onStatusChange, onReportUpdate, onReportCreated]);
}
