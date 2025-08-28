import { useEffect, useState } from "react";
import MicroMixReportFormView from "../Reports/MicroMixReportFormView";
import { useNavigate } from "react-router-dom";
import { useReportsSocket } from "../../hooks/useReportsSockets";

type Report = {
  id: string;
  client: string;
  dateSent: string | null;
  status: string;
  reportNumber: number;
  prefix?: string; // 👈 added so we can show prefix if backend returns it
};

const FRONTDESK_STATUSES = [
  "SUBMITTED_BY_CLIENT",
  "RECEIVED_BY_FRONTDESK",
  "FRONTDESK_ON_HOLD",
  "FRONTDESK_REJECTED",
];

export default function FrontDeskDashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState("SUBMITTED_BY_CLIENT");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const navigate = useNavigate();

  // 🔥 Subscribe to live updates
  useReportsSocket(
    (id, newStatus) => {
      // status changed
      setReports((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
      );
    },
    (report) => {
      // whole report updated
      setReports((prev) => prev.map((r) => (r.id === report.id ? report : r)));
    },
    (report) => {
      // new report created → show at top
      if (FRONTDESK_STATUSES.includes(report.status)) {
        setReports((prev) => [report, ...prev]);
      }
    }
  );

  useEffect(() => {
    async function fetchReports() {
      const token = localStorage.getItem("token");
      if (!token) return;

      const res = await fetch("http://localhost:3000/reports/micro-mix", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const all = await res.json();
        setReports(
          all.filter((r: Report) => FRONTDESK_STATUSES.includes(r.status))
        );
      } else {
        console.error("Failed to fetch reports", res.status);
      }
    }
    fetchReports();
  }, []);

  const filtered = reports.filter((r) => r.status === filter);

  async function markAsReceived(reportId: string) {
    const token = localStorage.getItem("token");
    if (!token) return;
    console.log(reportId);

    await fetch(`http://localhost:3000/reports/micro-mix/${reportId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: "RECEIVED_BY_FRONTDESK" }),
    });
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">FrontDesk Dashboard</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {FRONTDESK_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-md border ${
              filter === s ? "bg-blue-600 text-white" : "bg-gray-100"
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
              <th className="p-2 text-left">Report #</th>
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
                  {r.prefix}
                  {r.reportNumber}
                </td>
                <td className="p-2">{r.client}</td>
                <td className="p-2">
                  {r.dateSent ? new Date(r.dateSent).toLocaleDateString() : "-"}
                </td>
                <td className="p-2">{r.status.replace(/_/g, " ")}</td>
                <td className="p-2 flex gap-2">
                  <button
                    className="px-3 py-1 text-sm bg-green-600 text-white rounded"
                    onClick={async () => {
                      if (r.status === "SUBMITTED_BY_CLIENT") {
                        await markAsReceived(r.id);
                      }
                      setSelectedReport(r);
                    }}
                  >
                    View
                  </button>
                  <button
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded"
                    onClick={async () => {
                      if (r.status === "SUBMITTED_BY_CLIENT") {
                        await markAsReceived(r.id);
                      }
                      navigate(`/reports/micro-mix/${r.id}`);
                    }} // 👈 route to main form
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
              Report {selectedReport.prefix}
              {selectedReport.reportNumber}
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
