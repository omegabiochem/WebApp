import { useEffect, useState } from "react";

type Report = {
  id: string;
  client: string;
  dateSent: string | null;
  status: string;
  reportNumber: number;
};

const FRONTDESK_STATUSES = [
  "SUBMITTED_BY_CLIENT",
  "RECEIVED_BY_FRONTDESK",
  "FRONTDESK_ON_HOLD",
  "FRONTDESK_REJECTED",
];

export default function ClientDashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState("SUBMITTED_BY_CLIENT");

  useEffect(() => {
    async function fetchReports() {
      const token = localStorage.getItem("token");
      const res = await fetch("http://localhost:3000/reports/micro-mix", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const all = await res.json();
      // filter by allowed statuses
      setReports(
        all.filter((r: Report) => FRONTDESK_STATUSES.includes(r.status))
      );
    }
    fetchReports();
  }, []);

  const filtered = reports.filter((r) => r.status === filter);

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
                    onClick={() => console.log("View", r.id)}
                  >
                    View
                  </button>
                  <button
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded"
                    onClick={() => console.log("Edit", r.id)}
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
    </div>
  );
}
