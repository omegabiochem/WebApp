import { useEffect, useState } from "react";
import MicroMixReportFormView from "../Reports/MicroMixReportFormView";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

type Report = {
  id: string;
  client: string;
  dateSent: string | null;
  status: string;
  formNumber: string;
};

const CLIENT_STATUSES = [
  "ALL", // 👈 added ALL option
  "APPROVED",
  "DRAFT",
  "SUBMITTED_BY_CLIENT",
  "CLIENT_NEEDS_CORRECTION",
];

export default function ClientDashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState("SUBMITTED_BY_CLIENT");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    async function fetchReports() {
      const token = localStorage.getItem("token");
      if (!token) return;

      const res = await fetch("http://localhost:3000/reports/micro-mix", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const all = await res.json();
        // Only keep reports in the 3 statuses (ignore others from backend)
        // setReports(
        //   all.filter((r: Report) =>
        //     [
        //       "SUBMITTED_BY_CLIENT",
        //       "DRAFT",
        //       "CLIENT_NEEDS_CORRECTION",
        //     ].includes(r.status) && r.client === user?.clientCode
        //   )
        // );

        const clientReports = all.filter(
          (r: Report) => r.client === user?.clientCode
        );

        setReports(clientReports);
      } else {
        console.error("Failed to fetch reports", res.status);
      }
    }
    fetchReports();
  }, []);

  // 👇 filtering logic with ALL option
  const filtered =
    filter === "ALL" ? reports : reports.filter((r) => r.status === filter);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Client Dashboard</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {CLIENT_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-md border ${filter === s ? "bg-blue-600 text-white" : "bg-gray-100"
              }`}
          >
            {s.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100 border-b">
              <th className="p-2 text-left">Form #</th>
              <th className="p-2 text-left">Client</th>
              <th className="p-2 text-left">Date Sent</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="p-2">
                  {r.formNumber}
                </td>
                <td className="p-2">{r.client}</td>
                <td className="p-2">
                  {r.dateSent ? new Date(r.dateSent).toLocaleDateString() : "-"}
                </td>
                <td className="p-2">{r.status.replace(/_/g, " ")}</td>
                <td className="p-2 flex gap-2">
                  <button
                    className="px-3 py-1 text-sm bg-green-600 text-white rounded"
                    onClick={() => setSelectedReport(r)}
                  >
                    View
                  </button>
                  <button
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded"
                    onClick={() => navigate(`/reports/micro-mix/${r.id}`)}
                  >
                    Update
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500">
                  No reports found for {filter.replace(/_/g, " ")}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal with full form in read-only */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-5xl p-6 m-4 overflow-x-auto">
            <h2 className="text-lg font-bold mb-4 sticky top-0 bg-white z-10 border-b pb-2">
              Report
              {selectedReport.formNumber}
            </h2>

            <MicroMixReportFormView
              report={selectedReport}
              onClose={() => setSelectedReport(null)}
            />

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setSelectedReport(null)}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
