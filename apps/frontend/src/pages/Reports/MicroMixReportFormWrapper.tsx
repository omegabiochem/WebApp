import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import MicroMixReportForm from "./MicroMixReportForm";
import type { MicroMixReportDTO } from "../../../../SharedTypes/Reports/MicroMixReport";
import { api } from "../../lib/api";

// type Report = {
//   id: string;
//   client: string;
//   dateSent: string | null;
//   status: string;
//   // reportNumber: number;
//   // prefix?: string;
//   // add other fields if needed
// };

export default function MicroMixReportFormWrapper() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<MicroMixReportDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let aborted = false;
    async function fetchReport() {
      // const token = localStorage.getItem("token");
      // if (!token) {
      //   console.error("No token found");
      //   setLoading(false);
      //   return;
      // }

      try {
        setLoading(true);
        const data = await api<MicroMixReportDTO>(`/reports/micro-mix/${id}`);
        if (!aborted) setReport(data);
      } catch (err) {
        if (!aborted) {
          console.error("Error fetching report:", err);
        }
      } finally {
        if (!aborted) setLoading(false);
      }
    }

    if (id) fetchReport();
    return () => {
      aborted = true;
    };
  }, [id]);

  if (loading) return <div className="p-4">Loading...</div>;
  if (!report) return <div className="p-4 text-red-500">Report not found</div>;

  return <MicroMixReportForm report={report} />;
}
