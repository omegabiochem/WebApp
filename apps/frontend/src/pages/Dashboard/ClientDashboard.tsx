import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import MicroMixReportFormView from "../Reports/MicroMixReportFormView";
import { useAuth } from "../../context/AuthContext";
import type { Role, ReportStatus } from "../../utils/microMixReportFormWorkflow";
import { canShowUpdateButton } from "../../utils/microMixReportFormWorkflow";

// -----------------------------
// Types
// -----------------------------

type Report = {
  id: string;
  client: string;
  dateSent: string | null;
  status: ReportStatus | string; // Some backends may still send raw string
  formNumber: string;
};

// Include an "ALL" pseudo-status for filtering
const CLIENT_STATUSES: ("ALL" | ReportStatus)[] = [
  "ALL",
  "FINAL_APPROVED",
  "DRAFT",
  "SUBMITTED_BY_CLIENT",
  "UNDER_CLIENT_PRELIMINARY_REVIEW",
  "UNDER_CLIENT_FINAL_REVIEW",
  "CLIENT_NEEDS_PRELIMINARY_CORRECTION",
  "CLIENT_NEEDS_FINAL_CORRECTION",
  "UNDER_CLIENT_PRELIMINARY_CORRECTION",
  "UNDER_CLIENT_FINAL_CORRECTION",
  "PRELIMINARY_RESUBMITTION_BY_CLIENT",
  "FINAL_RESUBMITTION_BY_CLIENT",
  "LOCKED",
];

// Map statuses → badge styles
const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
  SUBMITTED_BY_CLIENT: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",
  UNDER_CLIENT_PRELIMINARY_REVIEW: "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
  UNDER_CLIENT_FINAL_REVIEW: "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
  CLIENT_NEEDS_PRELIMINARY_CORRECTION: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
  CLIENT_NEEDS_FINAL_CORRECTION: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
  UNDER_CLIENT_PRELIMINARY_CORRECTION: "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200",
  UNDER_CLIENT_FINAL_CORRECTION: "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200",
  PRELIMINARY_RESUBMITTION_BY_CLIENT: "bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200",
  FINAL_RESUBMITTION_BY_CLIENT: "bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200",
  FINAL_APPROVED: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
  LOCKED: "bg-slate-200 text-slate-800 ring-1 ring-slate-300",
};

// -----------------------------
// Utilities
// -----------------------------

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function niceStatus(s: string) {
  return s.replace(/_/g, " ");
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function canUpdateThisReport(r: Report, user?: any) {
  if (user?.role !== "CLIENT") return false;
  if (r.client !== user?.clientCode) return false;

  const fieldsUsedOnForm = [
    "client",
    "dateSent",
    "typeOfTest",
    "sampleType",
    "formulaNo",
    "description",
    "lotNo",
    "manufactureDate",
    "pathogens",
  ];

  return canShowUpdateButton(user?.role as Role, r.status as ReportStatus, fieldsUsedOnForm);
}

// -----------------------------
// Component
// -----------------------------

export default function ClientDashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<("ALL" | ReportStatus)>("SUBMITTED_BY_CLIENT");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"dateSent" | "formNumber">("dateSent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    let abort = false;
    async function fetchReports() {
      try {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem("token");
        if (!token) {
          setReports([]);
          setError("Missing auth token. Please log in again.");
          return;
        }
        const res = await fetch("http://localhost:3000/reports/micro-mix", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
        const all: Report[] = await res.json();

        if (abort) return;

        const clientReports = all.filter((r) => r.client === user?.clientCode);
        setReports(clientReports);
      } catch (e: any) {
        if (!abort) setError(e?.message ?? "Failed to fetch reports");
      } finally {
        if (!abort) setLoading(false);
      }
    }

    fetchReports();
    return () => {
      abort = true;
    };
  }, [user?.clientCode]);

  // Derived table data
  const processed = useMemo(() => {
    const byStatus = statusFilter === "ALL" ? reports : reports.filter((r) => r.status === statusFilter);

    const bySearch = search.trim()
      ? byStatus.filter((r) => {
          const q = search.toLowerCase();
          return (
            r.formNumber.toLowerCase().includes(q) ||
            r.client.toLowerCase().includes(q) ||
            String(r.status).toLowerCase().includes(q)
          );
        })
      : byStatus;

    const sorted = [...bySearch].sort((a, b) => {
      if (sortBy === "formNumber") {
        const aN = a.formNumber.toLowerCase();
        const bN = b.formNumber.toLowerCase();
        return sortDir === "asc" ? aN.localeCompare(bN) : bN.localeCompare(aN);
      }
      // dateSent
      const aT = a.dateSent ? new Date(a.dateSent).getTime() : 0;
      const bT = b.dateSent ? new Date(b.dateSent).getTime() : 0;
      return sortDir === "asc" ? aT - bT : bT - aT;
    });

    return sorted;
  }, [reports, statusFilter, search, sortBy, sortDir]);

  // Pagination
  const total = processed.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageClamped = Math.min(page, totalPages);
  const start = (pageClamped - 1) * perPage;
  const end = start + perPage;
  const pageRows = processed.slice(start, end);

  // Reset to page 1 when the core filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, search, perPage]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Client Dashboard</h1>
          <p className="text-sm text-slate-500">View and manage your Micro Mix reports</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center rounded-lg border px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
            aria-label="Refresh"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Controls Card */}
      <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
        {/* Status filter chips (scrollable) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {CLIENT_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={classNames(
                "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ring-1",
                statusFilter === s
                  ? "bg-blue-600 text-white ring-blue-600"
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100 ring-slate-200"
              )}
              aria-pressed={statusFilter === s}
            >
              {niceStatus(String(s))}
            </button>
          ))}
        </div>

        {/* Search & Sort row */}
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search form #, client, or status…"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="sortBy">Sort by</label>
            <select
              id="sortBy"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="dateSent">Date Sent</option>
              <option value="formNumber">Form #</option>
            </select>

            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
              aria-label="Toggle sort direction"
              title="Toggle sort direction"
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>

          <div className="flex items-center gap-2 md:justify-end">
            <label htmlFor="perPage" className="text-sm text-slate-600">Rows:</label>
            <select
              id="perPage"
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
              className="w-24 rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Content card */}
      <div className="rounded-2xl border bg-white shadow-sm">
        {/* States */}
        {error && (
          <div className="border-b bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="text-left text-slate-600">
                <th className="px-4 py-3 font-medium">Form #</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Date Sent</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                [...Array(6)].map((_, i) => (
                  <tr key={`skel-${i}`} className="border-t">
                    <td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-slate-200" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-32 animate-pulse rounded bg-slate-200" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-slate-200" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-56 animate-pulse rounded bg-slate-200" /></td>
                    <td className="px-4 py-3"><div className="h-8 w-28 animate-pulse rounded bg-slate-200" /></td>
                  </tr>
                ))
              )}

              {!loading && pageRows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{r.formNumber}</td>
                  <td className="px-4 py-3">{r.client}</td>
                  <td className="px-4 py-3">{formatDate(r.dateSent)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={classNames(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                        STATUS_STYLES[String(r.status)] || "bg-slate-100 text-slate-800 ring-1 ring-slate-200"
                      )}
                    >
                      {niceStatus(String(r.status))}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                        onClick={() => setSelectedReport(r)}
                      >
                        View
                      </button>

                      {canUpdateThisReport(r, user) && (
                        <button
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                          onClick={() => navigate(`/reports/micro-mix/${r.id}`)}
                        >
                          Update
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && pageRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                    No reports found for <span className="font-medium">{niceStatus(String(statusFilter))}</span>
                    {search ? (
                      <>
                        {" "}matching <span className="font-medium">“{search}”</span>.
                      </>
                    ) : 
                      "."
                    }
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 text-sm md:flex-row">
            <div className="text-slate-600">
              Showing <span className="font-medium">{start + 1}</span>–
              <span className="font-medium">{Math.min(end, total)}</span> of
              <span className="font-medium"> {total}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg border px-3 py-1.5 disabled:opacity-50"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageClamped === 1}
              >
                Prev
              </button>
              <span className="tabular-nums">{pageClamped} / {totalPages}</span>
              <button
                className="rounded-lg border px-3 py-1.5 disabled:opacity-50"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageClamped === totalPages}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: read-only full form */}
      {selectedReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Report details"
          onClick={(e) => {
            // close on backdrop click
            if (e.target === e.currentTarget) setSelectedReport(null);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
              <h2 className="text-lg font-semibold">Report ({selectedReport.formNumber})</h2>
              <div className="flex items-center gap-2">
                {canUpdateThisReport(selectedReport, user) && (
                  <button
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                    onClick={() => {
                      const id = selectedReport.id;
                      setSelectedReport(null);
                      navigate(`/reports/micro-mix/${id}`);
                    }}
                  >
                    Update
                  </button>
                 )} 
                <button
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
                  onClick={() => setSelectedReport(null)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="overflow-auto px-6 py-4">
              <MicroMixReportFormView report={selectedReport} onClose={() => setSelectedReport(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// import { useEffect, useState } from "react";
// import MicroMixReportFormView from "../Reports/MicroMixReportFormView";
// import { useNavigate } from "react-router-dom";
// import { useAuth } from "../../context/AuthContext";
// import type { Role, ReportStatus } from "../../utils/microMixReportFormWorkflow";
// import { canShowUpdateButton } from "../../utils/microMixReportFormWorkflow";

// type Report = {
//   id: string;
//   client: string;
//   dateSent: string | null;
//   status: string;
//   formNumber: string;
// };

// const CLIENT_STATUSES = [
//   "ALL", // 👈 added ALL option
//   "FINAL_APPROVED",
//   "DRAFT",
//   "SUBMITTED_BY_CLIENT",
//   "UNDER_CLIENT_PRELIMINARY_REVIEW",
//   "UNDER_CLIENT_FINAL_REVIEW",
//   "CLIENT_NEEDS_PRELIMINARY_CORRECTION",
//   "CLIENT_NEEDS_FINAL_CORRECTION",
//   "UNDER_CLIENT_PRELIMINARY_CORRECTION",
//   "UNDER_CLIENT_FINAL_CORRECTION",
//   "PRELIMINARY_RESUBMITTION_BY_CLIENT",
//   "FINAL_RESUBMITTION_BY_CLIENT",
//   "LOCKED",
// ];


// function canUpdateThisReport(r: Report, user?: any) {
//   // If non-clients see this dashboard later, you can loosen this check.
//   if (user?.role !== "CLIENT") return false;
//   if (r.client !== user?.clientCode) return false;

//   // List the fields that the Update screen actually edits for CLIENTS.
//   // (This makes the check stricter than just "can edit something in this status".)
//   const fieldsUsedOnForm = [
//     "client",
//     "dateSent",
//     "typeOfTest",
//     "sampleType",
//     "formulaNo",
//     "description",
//     "lotNo",
//     "manufactureDate",
//     "pathogens",
//   ];

//   return canShowUpdateButton(
//     user?.role as Role,
//     r.status as ReportStatus,
//     fieldsUsedOnForm
//   );
// }

// export default function ClientDashboard() {
//   const [reports, setReports] = useState<Report[]>([]);
//   const [filter, setFilter] = useState("SUBMITTED_BY_CLIENT");
//   const [selectedReport, setSelectedReport] = useState<Report | null>(null);
//   const navigate = useNavigate();
//   const { user } = useAuth();

//   useEffect(() => {
//     async function fetchReports() {
//       const token = localStorage.getItem("token");
//       if (!token) return;

//       const res = await fetch("http://localhost:3000/reports/micro-mix", {
//         headers: { Authorization: `Bearer ${token}` },
//       });

//       if (res.ok) {
//         const all = await res.json();

//         const clientReports = all.filter(
//           (r: Report) => r.client === user?.clientCode
//         );

//         setReports(clientReports);
//       } else {
//         console.error("Failed to fetch reports", res.status);
//       }
//     }
//     fetchReports();
//   }, []);

//   // 👇 filtering logic with ALL option
//   const filtered =
//     filter === "ALL" ? reports : reports.filter((r) => r.status === filter);

//   return (
//     <div className="p-6">
//       <h1 className="text-2xl font-bold mb-4">Client Dashboard</h1>

//       {/* Tabs */}
//       <div className="flex gap-2 mb-4">
//         {CLIENT_STATUSES.map((s) => (
//           <button
//             key={s}
//             onClick={() => setFilter(s)}
//             className={`px-4 py-2 rounded-md border ${filter === s ? "bg-blue-600 text-white" : "bg-gray-100"
//               }`}
//           >
//             {s.replace(/_/g, " ")}
//           </button>
//         ))}
//       </div>

//       {/* Table */}
//       <div className="overflow-x-auto border rounded-lg">
//         <table className="w-full border-collapse text-sm">
//           <thead>
//             <tr className="bg-gray-100 border-b">
//               <th className="p-2 text-left">Form #</th>
//               <th className="p-2 text-left">Client</th>
//               <th className="p-2 text-left">Date Sent</th>
//               <th className="p-2 text-left">Status</th>
//               <th className="p-2 text-left">Actions</th>
//             </tr>
//           </thead>
//           <tbody>
//             {filtered.map((r) => (
//               <tr key={r.id} className="border-b hover:bg-gray-50">
//                 <td className="p-2">
//                   {r.formNumber}
//                 </td>
//                 <td className="p-2">{r.client}</td>
//                 <td className="p-2">
//                   {r.dateSent ? new Date(r.dateSent).toLocaleDateString() : "-"}
//                 </td>
//                 <td className="p-2">{r.status.replace(/_/g, " ")}</td>
//                 <td className="p-2 flex gap-2">
//                   <button
//                     className="px-3 py-1 text-sm bg-green-600 text-white rounded"
//                     onClick={() => setSelectedReport(r)}
//                   >
//                     View
//                   </button>
//                   {canUpdateThisReport(r, user) && (
//                     <button
//                       className="px-3 py-1 text-sm bg-blue-600 text-white rounded"
//                       onClick={() => navigate(`/reports/micro-mix/${r.id}`)}
//                     >
//                       Update
//                     </button>
//                   )}
//                 </td>
//               </tr>
//             ))}
//             {filtered.length === 0 && (
//               <tr>
//                 <td colSpan={5} className="p-4 text-center text-gray-500">
//                   No reports found for {filter.replace(/_/g, " ")}.
//                 </td>
//               </tr>
//             )}
//           </tbody>
//         </table>
//       </div>

//       {/* Modal with full form in read-only */}
//       {selectedReport && (
//         <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto">
//           <div className="bg-white rounded-lg shadow-lg w-full max-w-5xl p-6 m-4 overflow-x-auto">
//             <h2 className="text-lg font-bold mb-4 sticky top-0 bg-white z-10 border-b pb-2">
//               Report-
//               ({selectedReport.formNumber})
//             </h2>

//             <MicroMixReportFormView
//               report={selectedReport}
//               onClose={() => setSelectedReport(null)}
//             />

//             <div className="flex justify-end mt-6">
//               {/* <button
//                 onClick={() => setSelectedReport(null)}
//                 className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
//               >
//                 Close
//               </button> */}
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }
