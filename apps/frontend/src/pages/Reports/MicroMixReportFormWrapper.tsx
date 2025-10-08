
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import MicroMixReportForm from "./MicroMixReportForm";
import type {MicroMixReportDTO} from "../../../../SharedTypes/Reports/MicroMixReport";


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
    async function fetchReport() {
      const token = localStorage.getItem("token");
      if (!token) {
        console.error("No token found");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`http://localhost:3000/reports/micro-mix/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed with status ${res.status}`);
        const data: MicroMixReportDTO = await res.json();
        setReport(data);
      } catch (err) {
        console.error("Error fetching report:", err);
      } finally {
        setLoading(false);
      }
    }

    if (id) fetchReport();
  }, [id]);

  if (loading) return <div className="p-4">Loading...</div>;
  if (!report) return <div className="p-4 text-red-500">Report not found</div>;

  return <MicroMixReportForm report={report} />;
}
