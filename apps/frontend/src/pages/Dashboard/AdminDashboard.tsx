import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import MicroMixReportFormView from "../Reports/MicroMixReportFormView";

type Report = {
  id: string;
  client: string;
  dateSent: string | null;
  status: string;
  reportNumber: number;
  prefix: string;
};

const ALL_STATUSES = [
  "ALL",
  "DRAFT",
  "SUBMITTED_BY_CLIENT",
  "CLIENT_NEEDS_CORRECTION",
  "RECEIVED_BY_FRONTDESK",
  "FRONTDESK_ON_HOLD",
  "FRONTDESK_REJECTED",
  "UNDER_TESTING_REVIEW",
  "TESTING_ON_HOLD",
  "TESTING_REJECTED",
  "UNDER_QA_REVIEW",
  "QA_NEEDS_CORRECTION",
  "QA_REJECTED",
  "UNDER_ADMIN_REVIEW",
  "ADMIN_NEEDS_CORRECTION",
  "ADMIN_REJECTED",
  "APPROVED",
  "LOCKED",
];

export default function AdminDashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [searchClient, setSearchClient] = useState("");
  const [searchReport, setSearchReport] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [changeStatusReport, setChangeStatusReport] = useState<Report | null>(
    null
  );
  const [newStatus, setNewStatus] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchReports() {
      const token = localStorage.getItem("token");
      if (!token) return;

      const res = await fetch("http://localhost:3000/reports/micro-mix", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setReports(await res.json());
      } else {
        console.error("Failed to fetch reports", res.status);
      }
    }
    fetchReports();
  }, []);

  // Filtering logic
  const filtered = reports.filter((r) => {
    if (filterStatus !== "ALL" && r.status !== filterStatus) return false;
    if (
      searchClient &&
      !r.client.toLowerCase().includes(searchClient.toLowerCase())
    )
      return false;
    if (
      searchReport &&
      !(r.prefix + r.reportNumber)
        .toLowerCase()
        .includes(searchReport.toLowerCase())
    )
      return false;

    if (dateFrom && r.dateSent && new Date(r.dateSent) < new Date(dateFrom))
      return false;
    if (dateTo && r.dateSent && new Date(r.dateSent) > new Date(dateTo))
      return false;

    return true;
  });

  // Save status change
  async function handleChangeStatus(report: Report, newStatus: string) {
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(
        `http://localhost:3000/reports/micro-mix/${report.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (!res.ok) throw new Error("Failed to update status");
      alert("Status updated successfully");
    } catch (err) {
      console.error("Failed to update status", err);
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border rounded px-3 py-2"
        >
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search by client"
          value={searchClient}
          onChange={(e) => setSearchClient(e.target.value)}
          className="border rounded px-3 py-2"
        />

        <input
          type="text"
          placeholder="Search by report #"
          value={searchReport}
          onChange={(e) => setSearchReport(e.target.value)}
          className="border rounded px-3 py-2"
        />

        <div className="flex gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border rounded px-3 py-2 flex-1"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border rounded px-3 py-2 flex-1"
          />
        </div>
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
                  <button
                    className="px-3 py-1 text-sm bg-purple-600 text-white rounded"
                    onClick={() => {
                      setChangeStatusReport(r);
                      setNewStatus(r.status);
                    }}
                  >
                    Change Status
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500">
                  No reports match filters.
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

      {/* Change Status Dialog */}
      {changeStatusReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-4">Change Status</h2>
            <p className="mb-2">
              <strong>Current Status:</strong>{" "}
              {changeStatusReport.status.replace(/_/g, " ")}
            </p>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="border rounded px-3 py-2 w-full mb-4"
            >
              {ALL_STATUSES.filter((s) => s !== "ALL").map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setChangeStatusReport(null)}
                className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  handleChangeStatus(changeStatusReport, newStatus)
                }
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
