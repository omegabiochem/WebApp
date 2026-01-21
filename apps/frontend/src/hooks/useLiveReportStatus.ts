import { useEffect } from "react";
import { socket } from "../lib/socket";

type StatusChanged = { reportId?: string; id?: string; status?: string };

type ReportCreated = {
  id: string;
  status?: string;
  formType?: string;
  formNumber?: string;
  reportNumber?: string | null;
  dateSent?: string | null;
  client?: string;
};

export function useLiveReportStatus<T extends { id: string; status?: string }>(
  setReports: React.Dispatch<React.SetStateAction<T[]>>,
  opts?: {
    acceptCreated?: (r: any) => boolean; // filter for this dashboard
    createdEvent?: string; // default "report.created"
    statusEvent?: string; // default "report.statusChanged"
  },
) {
  useEffect(() => {
    const statusEvent = opts?.statusEvent ?? "report.statusChanged";
    const createdEvent = opts?.createdEvent ?? "report.created";

    const onStatus = (p: StatusChanged) => {
      const id = p.reportId ?? p.id;
      const status = p.status;
      if (!id || !status) return;

      setReports((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status } : r)),
      );
    };

    const onCreated = (r: ReportCreated) => {
      if (!r?.id) return;
      if (opts?.acceptCreated && !opts.acceptCreated(r)) return;

      setReports((prev) => {
        if (prev.some((x) => x.id === r.id)) return prev; // avoid duplicates
        return [r as any, ...prev]; // add to top
      });
    };

    socket.on(statusEvent, onStatus);
    socket.on(createdEvent, onCreated);

    return () => {
      socket.off(statusEvent, onStatus);
      socket.off(createdEvent, onCreated);
    };
  }, [setReports, opts?.acceptCreated, opts?.createdEvent, opts?.statusEvent]);
}
