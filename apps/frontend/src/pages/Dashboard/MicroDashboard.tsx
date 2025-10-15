import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import MicroMixReportFormView from "../Reports/MicroMixReportFormView";
import { useAuth } from "../../context/AuthContext";
import {
  STATUS_COLORS,
  type ReportStatus,
} from "../../utils/microMixReportFormWorkflow";
import { api } from "../../lib/api";

// -----------------------------
// Types
// -----------------------------

type Report = {
  id: string;
  client: string;
  dateSent: string | null;
  status: string; // backend status
  reportNumber: number;
  prefix?: string; // e.g., MMX-2025
};

// -----------------------------
// Statuses (Micro view)
// -----------------------------

// Keep Micro's short, actionable queue + ALL
const MICRO_STATUSES = [
  "ALL",
  "SUBMITTED_BY_CLIENT",
  "UNDER_PRELIMINARY_TESTING_REVIEW",
  "PRELIMINARY_APPROVED",
  "UNDER_FINAL_TESTING_REVIEW",
  "PRELIMINARY_TESTING_NEEDS_CORRECTION",
  "PRELIMINARY_RESUBMISSION_BY_CLIENT",
  // "PRELIMINARY_SUBMISSION_NEEDS_CORRECTION",
  "CLIENT_NEEDS_PRELIMINARY_CORRECTION",
  "UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW",
  "UNDER_FINAL_RESUBMISSION_TESTING_REVIEW",
] as const;

// Map statuses → badge styles (fallback provided below for unknown keys)
// const STATUS_STYLES: Record<string, string> = {
//   DRAFT: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
//   SUBMITTED_BY_CLIENT: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",
//   UNDER_PRELIMINARY_TESTING_REVIEW:
//     "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
//   PRELIMINARY_APPROVED:
//     "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
//   UNDER_FINAL_TESTING_REVIEW:
//     "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200",
//   PRELIMINARY_RESUBMISSION_BY_CLIENT:
//     "bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200",
// };

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
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function displayReportNo(r: Report) {
  const num = String(r.reportNumber ?? "");
  return r.prefix ? `${num}` : num;
}

// -----------------------------
// API helpers
// -----------------------------

async function setStatus(
  reportId: string,
  newStatus: string,
  reason = "Common Status Change"
) {
  // const token = localStorage.getItem("token");
  // if (!token) throw new Error("Missing auth token");

  // const res = await fetch(
  //   `http://localhost:3000/reports/micro-mix/${reportId}/status`,
  //   {
  //     method: "PATCH",
  //     headers: {
  //       "Content-Type": "application/json",
  //       Authorization: `Bearer ${token}`,
  //     },
  //     body: JSON.stringify({ reason, status: newStatus }),
  //   }
  // );

  // if (!res.ok) {
  //   const msg = await res.text().catch(() => "");
  //   throw new Error(
  //     msg || `Failed to set status to ${newStatus} (${res.status})`
  //   );
  // }
  await api(`/reports/micro-mix/${reportId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ reason, status: newStatus }),
  });
}

// -----------------------------
// Component
// -----------------------------

export default function MicroDashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] =
    useState<(typeof MICRO_STATUSES)[number]>("ALL");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"dateSent" | "reportNumber">("dateSent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  const navigate = useNavigate();
  const { user } = useAuth();

  // Fetch all Micro mix reports (no per-client filter for Micro role)
  useEffect(() => {
    let abort = false;
    async function fetchReports() {
      try {
        setLoading(true);
        setError(null);
        // const token = localStorage.getItem("token");
        // if (!token) {
        //   setReports([]);
        //   setError("Missing auth token. Please log in again.");
        //   return;
        // }

        // const res = await fetch("http://localhost:3000/reports/micro-mix", {
        //   headers: { Authorization: `Bearer ${token}` },
        // });

        // if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
        // const all: Report[] = await res.json();
        const all = await api<Report[]>("/reports/micro-mix");
        if (abort) return;

        // Keep only statuses Micro cares about (plus whatever backend sends that matches)
        const keep = new Set(MICRO_STATUSES.filter((s) => s !== "ALL"));
        setReports(all.filter((r) => keep.has(r.status as any)));
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
  }, []);

  // Derived table data (filter → search → sort)
  const processed = useMemo(() => {
    const byStatus =
      statusFilter === "ALL"
        ? reports
        : reports.filter((r) => r.status === statusFilter);

    const q = search.trim().toLowerCase();
    const bySearch = q
      ? byStatus.filter((r) => {
          const combinedNo = displayReportNo(r).toLowerCase();
          return (
            combinedNo.includes(q) ||
            r.client.toLowerCase().includes(q) ||
            String(r.status).toLowerCase().includes(q)
          );
        })
      : byStatus;

    const sorted = [...bySearch].sort((a, b) => {
      if (sortBy === "reportNumber") {
        const aN = Number(a.reportNumber ?? 0);
        const bN = Number(b.reportNumber ?? 0);
        return sortDir === "asc" ? aN - bN : bN - aN;
      }
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

  useEffect(() => {
    setPage(1);
  }, [statusFilter, search, perPage]);

  // Update button guard: only for MICRO role
  const canUpdate = user?.role === "MICRO";

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Micro Dashboard</h1>
          <p className="text-sm text-slate-500">
            Queue of Micro Mix reports for preliminary/final testing.
          </p>
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
          {MICRO_STATUSES.map((s) => (
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
              placeholder="Search report #, client, or status…"
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
            <label className="sr-only" htmlFor="sortBy">
              Sort by
            </label>
            <select
              id="sortBy"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="dateSent">Date Sent</option>
              <option value="reportNumber">Report #</option>
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
            <label htmlFor="perPage" className="text-sm text-slate-600">
              Rows:
            </label>
            <select
              id="perPage"
              value={perPage}
              onChange={(e) => setPerPage(Number(e.target.value))}
              className="w-24 rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Content card */}
      <div className="rounded-2xl border bg-white shadow-sm">
        {/* States */}
        {error && (
          <div className="border-b bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="text-left text-slate-600">
                <th className="px-4 py-3 font-medium">Report #</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Date Sent</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                [...Array(6)].map((_, i) => (
                  <tr key={`skel-${i}`} className="border-t">
                    <td className="px-4 py-3">
                      <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-5 w-56 animate-pulse rounded bg-slate-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-8 w-28 animate-pulse rounded bg-slate-200" />
                    </td>
                  </tr>
                ))}

              {!loading &&
                pageRows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">
                      {displayReportNo(r)}
                    </td>
                    <td className="px-4 py-3">{r.client}</td>
                    <td className="px-4 py-3">{formatDate(r.dateSent)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={classNames(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                          STATUS_COLORS[r.status as ReportStatus] ||
                            "bg-slate-100 text-slate-800 ring-1 ring-slate-200"
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

                        {canUpdate && (
                          <button
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                            onClick={async () => {
                              try {
                                if (r.status === "SUBMITTED_BY_CLIENT") {
                                  await setStatus(
                                    r.id,
                                    "UNDER_PRELIMINARY_TESTING_REVIEW",
                                    "Move to prelim testing"
                                  );
                                } else if (
                                  r.status ===
                                  "CLIENT_NEEDS_PRELIMINARY_CORRECTION"
                                ) {
                                  await setStatus(
                                    r.id,
                                    "UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW",
                                    "Move to RESUBMISSION "
                                  );
                                } else if (
                                  r.status === "PRELIMINARY_APPROVED"
                                ) {
                                  await setStatus(
                                    r.id,
                                    "UNDER_FINAL_TESTING_REVIEW",
                                    "Move to final testing"
                                  );
                                } else if (
                                  r.status ===
                                  "PRELIMINARY_RESUBMISSION_BY_CLIENT"
                                ) {
                                  await setStatus(
                                    r.id,
                                    "UNDER_PRELIMINARY_TESTING_REVIEW",
                                    "Resubmitted by client"
                                  );
                                }
                                // optimistic UI
                                setReports((prev) =>
                                  prev.map((x) =>
                                    x.id === r.id
                                      ? {
                                          ...x,
                                          status:
                                            r.status === "SUBMITTED_BY_CLIENT"
                                              ? "UNDER_PRELIMINARY_TESTING_REVIEW"
                                              : r.status ===
                                                "PRELIMINARY_APPROVED"
                                              ? "UNDER_FINAL_TESTING_REVIEW"
                                              : r.status ===
                                                "PRELIMINARY_RESUBMISSION_BY_CLIENT"
                                              ? "UNDER_PRELIMINARY_TESTING_REVIEW"
                                              : x.status,
                                        }
                                      : x
                                  )
                                );
                                navigate(`/reports/micro-mix/${r.id}`);
                              } catch (e: any) {
                                alert(e?.message || "Failed to update status");
                              }
                            }}
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
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-slate-500"
                  >
                    No reports found for{" "}
                    <span className="font-medium">
                      {niceStatus(String(statusFilter))}
                    </span>
                    {search ? (
                      <>
                        {" "}
                        matching <span className="font-medium">“{search}”</span>
                        .
                      </>
                    ) : (
                      "."
                    )}
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
              <span className="tabular-nums">
                {pageClamped} / {totalPages}
              </span>
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
            if (e.target === e.currentTarget) setSelectedReport(null);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
              <h2 className="text-lg font-semibold">
                Report ({displayReportNo(selectedReport)})
              </h2>
              <div className="flex items-center gap-2">
                {canUpdate && (
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
              <MicroMixReportFormView
                report={selectedReport}
                onClose={() => setSelectedReport(null)}
                showSwitcher={false}
                pane="FORM"
              />
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

// type Report = {
//   id: string;
//   client: string;
//   dateSent: string | null;
//   status: string;
//   reportNumber: number;
//   prefix?: string;
// };

// const CLIENT_STATUSES = [
//   "ALL", // 👈 added ALL option
//   "SUBMITTED_BY_CLIENT",
//   "UNDER_PRELIMINARY_TESTING_REVIEW",
//   "PRELIMINARY_APPROVED",
//   "UNDER_FINAL_TESTING_REVIEW"
// ];

// export default function MicroDashboard() {
//   const [reports, setReports] = useState<Report[]>([]);
//   const [filter, setFilter] = useState("ALL"); // 👈 default to ALL
//   const [selectedReport, setSelectedReport] = useState<Report | null>(null);
//   const navigate = useNavigate();

//   useEffect(() => {
//     async function fetchReports() {
//       const token = localStorage.getItem("token");
//       if (!token) return;

//       const res = await fetch("http://localhost:3000/reports/micro-mix", {
//         headers: { Authorization: `Bearer ${token}` },
//       });

//       if (res.ok) {
//         const all = await res.json();
//         // Only keep reports in the 3 statuses (ignore others from backend)
//         setReports(
//           all.filter((r: Report) =>
//             [
//               "SUBMITTED_BY_CLIENT",
//               "UNDER_PRELIMINARY_TESTING_REVIEW",
//               "PRELIMINARY_APPROVED",
//               "UNDER_FINAL_TESTING_REVIEW"
//             ].includes(r.status)
//           )
//         );
//       } else {
//         console.error("Failed to fetch reports", res.status);
//       }
//     }
//     fetchReports();
//   }, []);

//   // 👇 filtering logic with ALL option
//   const filtered =
//     filter === "ALL" ? reports : reports.filter((r) => r.status === filter);

//   // replace your markAsReceived() with a generic helper:
//   async function setStatus(
//     reportId: string,
//     newStatus: string,
//     reason = "Common Status Change"
//   ) {
//     const token = localStorage.getItem("token");
//     if (!token) return;

//     const res = await fetch(
//       `http://localhost:3000/reports/micro-mix/${reportId}/status`,
//       {
//         method: "PATCH",
//         headers: {
//           "Content-Type": "application/json",
//           Authorization: `Bearer ${token}`,
//         },
//         body: JSON.stringify({ reason, status: newStatus }),
//       }
//     );

//     if (!res.ok) {
//       const msg = await res.text().catch(() => "");
//       throw new Error(
//         msg || `Failed to set status to ${newStatus} (${res.status})`
//       );
//     }

//     // optional: keep the table UI in sync right away
//     setReports((prev) =>
//       prev.map((r) => (r.id === reportId ? { ...r, status: newStatus } : r))
//     );
//   }

//   // async function markAsReceived(reportId: string) {
//   //   const token = localStorage.getItem("token");
//   //   if (!token) return;
//   //   console.log(reportId);

//   //   await fetch(`http://localhost:3000/reports/micro-mix/${reportId}/status`, {
//   //     method: "PATCH",
//   //     headers: {
//   //       "Content-Type": "application/json",
//   //       Authorization: `Bearer ${token}`,
//   //     },
//   //     body: JSON.stringify({ reason: "Common Status Change",status: "UNDER_PRELIMINARY_TESTING_REVIEW" }),
//   //   });
//   // }

//   return (
//     <div className="p-6">
//       <h1 className="text-2xl font-bold mb-4">Micro Dashboard</h1>

//       {/* Tabs */}
//       <div className="flex gap-2 mb-4">
//         {CLIENT_STATUSES.map((s) => (
//           <button
//             key={s}
//             onClick={() => setFilter(s)}
//             className={`px-4 py-2 rounded-md border ${
//               filter === s ? "bg-blue-600 text-white" : "bg-gray-100"
//             }`}
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
//               <th className="p-2 text-left">Report #</th>
//               <th className="p-2 text-left">Client</th>
//               <th className="p-2 text-left">Date Sent</th>
//               <th className="p-2 text-left">Status</th>
//               <th className="p-2 text-left">Actions</th>
//             </tr>
//           </thead>
//           <tbody>
//             {filtered.map((r) => (
//               <tr key={r.id} className="border-b hover:bg-gray-50">
//                 <td className="p-2">{r.reportNumber}</td>
//                 <td className="p-2">{r.client}</td>
//                 <td className="p-2">
//                   {r.dateSent ? new Date(r.dateSent).toLocaleDateString() : "-"}
//                 </td>
//                 <td className="p-2">{r.status.replace(/_/g, " ")}</td>
//                 <td className="p-2 flex gap-2">
//                   <button
//                     className="px-3 py-1 text-sm bg-green-600 text-white rounded"
//                     onClick={async () => {
//                       // if (r.status === "SUBMITTED_BY_CLIENT") {
//                       //   await markAsReceived(r.id);
//                       // }
//                       setSelectedReport(r);
//                     }}
//                   >
//                     View
//                   </button>
//                   <button
//                     className="px-3 py-1 text-sm bg-blue-600 text-white rounded"
//                     onClick={async () => {
//                       try {
//                         if (r.status === "SUBMITTED_BY_CLIENT") {
//                           await setStatus(
//                             r.id,
//                             "UNDER_PRELIMINARY_TESTING_REVIEW",
//                             "Move to prelim testing"
//                           );
//                         } else if (r.status === "PRELIMINARY_APPROVED") {
//                           await setStatus(
//                             r.id,
//                             "UNDER_FINAL_TESTING_REVIEW",
//                             "Move to final testing"
//                           );
//                         }
//                         navigate(`/reports/micro-mix/${r.id}`);
//                       } catch (e: any) {
//                         alert(e?.message || "Failed to update status");
//                       }
//                     }}
//                   >
//                     Update
//                   </button>

//                   {/* <button
//                     className="px-3 py-1 text-sm bg-blue-600 text-white rounded"
//                     onClick={async () => {
//                       if (r.status === "SUBMITTED_BY_CLIENT") {
//                         await markAsReceived(r.id);
//                       }
//                       navigate(`/reports/micro-mix/${r.id}`);
//                     }} >
//                     Update
//                   </button> */}
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
//               Report
//               {selectedReport.reportNumber}
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
