import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import MicroMixReportFormView from "../Reports/MicroMixReportFormView";
import { useAuth } from "../../context/AuthContext";
import { io } from "socket.io-client";
import {
  canShowUpdateButton,
  STATUS_COLORS,
  type ReportStatus,
  type Role,
} from "../../utils/microMixReportFormWorkflow";

// ---------------------------------
// Types
// ---------------------------------

type Report = {
  id: string;
  client: string;
  dateSent: string | null;
  status: ReportStatus | string;
  reportNumber: number;
  prefix?: string;
};

// ---------------------------------
// Constants
// ---------------------------------

const BASE_URL = "http://localhost:3000";

const ALL_STATUSES: ("ALL" | ReportStatus)[] = [
  "ALL",
  "DRAFT",
  "SUBMITTED_BY_CLIENT",
  "CLIENT_NEEDS_PRELIMINARY_CORRECTION",
  "CLIENT_NEEDS_FINAL_CORRECTION",
  "UNDER_CLIENT_PRELIMINARY_CORRECTION",
  "UNDER_CLIENT_FINAL_CORRECTION",
  "PRELIMINARY_RESUBMISSION_BY_CLIENT",
  "FINAL_RESUBMISSION_BY_CLIENT",
  "UNDER_CLIENT_PRELIMINARY_REVIEW",
  "UNDER_CLIENT_FINAL_REVIEW",
  "RECEIVED_BY_FRONTDESK",
  "FRONTDESK_ON_HOLD",
  "FRONTDESK_NEEDS_CORRECTION",
  "UNDER_PRELIMINARY_TESTING_REVIEW",
  "PRELIMINARY_TESTING_ON_HOLD",
  "PRELIMINARY_TESTING_NEEDS_CORRECTION",
  "PRELIMINARY_RESUBMISSION_BY_TESTING",
  "UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW",
  "FINAL_RESUBMISSION_BY_TESTING",
  "PRELIMINARY_APPROVED",
  "UNDER_FINAL_TESTING_REVIEW",
  "FINAL_TESTING_ON_HOLD",
  "FINAL_TESTING_NEEDS_CORRECTION",
  "UNDER_FINAL_RESUBMISSION_TESTING_REVIEW",
  "UNDER_QA_REVIEW",
  "QA_NEEDS_CORRECTION",
  "UNDER_ADMIN_REVIEW",
  "ADMIN_NEEDS_CORRECTION",
  "ADMIN_REJECTED",
  "UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW",
  "FINAL_APPROVED",
  "LOCKED",
];

// const STATUS_STYLES: Record<string, string> = {
//   DRAFT: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
//   SUBMITTED_BY_CLIENT: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",
//   RECEIVED_BY_FRONTDESK: "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200",
//   FRONTDESK_ON_HOLD: "bg-purple-100 text-purple-800 ring-1 ring-purple-200",
//   FRONTDESK_NEEDS_CORRECTION: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
//   UNDER_CLIENT_PRELIMINARY_REVIEW:
//     "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
//   UNDER_CLIENT_FINAL_REVIEW:
//     "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
//   CLIENT_NEEDS_PRELIMINARY_CORRECTION:
//     "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
//   CLIENT_NEEDS_FINAL_CORRECTION:
//     "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
//   UNDER_CLIENT_PRELIMINARY_CORRECTION:
//     "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200",
//   UNDER_CLIENT_FINAL_CORRECTION:
//     "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200",
//   PRELIMINARY_RESUBMISSION_BY_CLIENT:
//     "bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200",
//   FINAL_RESUBMISSION_BY_CLIENT:
//     "bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200",
//   UNDER_PRELIMINARY_TESTING_REVIEW:
//     "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
//   PRELIMINARY_TESTING_ON_HOLD:
//     "bg-yellow-100 text-yellow-900 ring-1 ring-yellow-200",
//   PRELIMINARY_TESTING_NEEDS_CORRECTION:
//     "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
//   UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW:
//     "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
//   PRELIMINARY_APPROVED:
//     "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
//   UNDER_FINAL_TESTING_REVIEW:
//     "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
//   FINAL_TESTING_ON_HOLD: "bg-yellow-100 text-yellow-900 ring-1 ring-yellow-200",
//   FINAL_TESTING_NEEDS_CORRECTION:
//     "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
//   UNDER_FINAL_RESUBMISSION_TESTING_REVIEW:
//     "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
//   UNDER_QA_REVIEW: "bg-sky-100 text-sky-800 ring-1 ring-sky-200",
//   QA_NEEDS_CORRECTION: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
//   UNDER_ADMIN_REVIEW: "bg-violet-100 text-violet-800 ring-1 ring-violet-200",
//   ADMIN_NEEDS_CORRECTION: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
//   ADMIN_REJECTED: "bg-slate-200 text-slate-800 ring-1 ring-slate-300",
//   UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW:
//     "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
//   FINAL_APPROVED: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
//   LOCKED: "bg-slate-200 text-slate-800 ring-1 ring-slate-300",
// };

// ---------------------------------
// Utilities
// ---------------------------------

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
  return r.prefix ? `${r.reportNumber}` : String(r.reportNumber ?? "");
}

// Admin fields that are actually edited in Update view
const ADMIN_FIELDS_ON_FORM = [
  "comments",
  "reviewedBy",
  "reviewedDate",
  "approvedBy",
  "approvedDate",
  "adminNotes",
];

// ---------------------------------
// API helpers
// ---------------------------------

// ---------------------------------
// Component
// ---------------------------------

export default function AdminDashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchClient, setSearchClient] = useState("");
  const [searchReport, setSearchReport] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Modal state
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [changeStatusReport, setChangeStatusReport] = useState<Report | null>(
    null
  );
  const [newStatus, setNewStatus] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [eSignPassword, setESignPassword] = useState<string>("");
  const [eSignError, setESignError] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);

  const navigate = useNavigate();
  const { user } = useAuth();

  // Socket (live updates)
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  useEffect(() => {
    const token = localStorage.getItem("token");
    socketRef.current = io(BASE_URL, {
      transports: ["websocket"],
      auth: { token },
    });

    socketRef.current.on("microMix:statusChanged", (payload: Report) => {
      setReports((prev) =>
        prev.map((r) =>
          r.id === payload.id ? { ...r, status: payload.status } : r
        )
      );
    });

    socketRef.current.on("microMix:created", (payload: Report) => {
      setReports((prev) => [payload, ...prev]);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  // Fetch
  useEffect(() => {
    let abort = false;
    async function fetchReports() {
      try {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem("token");
        if (!token) throw new Error("Missing auth token. Please log in again.");

        const res = await fetch(`${BASE_URL}/reports/micro-mix`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
        const data: Report[] = await res.json();
        if (abort) return;
        setReports(data);
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

  // Derived rows (filter → search → sort)
  const processed = useMemo(() => {
    const byStatus = reports.filter((r) =>
      filterStatus === "ALL" ? true : r.status === filterStatus
    );

    const byClient = searchClient.trim()
      ? byStatus.filter((r) =>
          r.client.toLowerCase().includes(searchClient.toLowerCase())
        )
      : byStatus;

    const byReport = searchReport.trim()
      ? byClient.filter((r) =>
          displayReportNo(r).toLowerCase().includes(searchReport.toLowerCase())
        )
      : byClient;

    const byDateFrom = dateFrom
      ? byReport.filter(
          (r) => !r.dateSent || new Date(r.dateSent) >= new Date(dateFrom)
        )
      : byReport;
    const byDateTo = dateTo
      ? byDateFrom.filter(
          (r) => !r.dateSent || new Date(r.dateSent) <= new Date(dateTo)
        )
      : byDateFrom;

    // Sort default: newest first
    return [...byDateTo].sort((a, b) => {
      const aT = a.dateSent ? new Date(a.dateSent).getTime() : 0;
      const bT = b.dateSent ? new Date(b.dateSent).getTime() : 0;
      return bT - aT;
    });
  }, [reports, filterStatus, searchClient, searchReport, dateFrom, dateTo]);

  // Pagination
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const total = processed.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageClamped = Math.min(page, totalPages);
  const start = (pageClamped - 1) * perPage;
  const end = start + perPage;
  const pageRows = processed.slice(start, end);

  useEffect(() => {
    setPage(1);
  }, [filterStatus, searchClient, searchReport, dateFrom, dateTo, perPage]);

  // Permissions
  function canUpdateThisReport(r: Report, user?: any) {
    return canShowUpdateButton(
      user?.role as Role,
      r.status as ReportStatus,
      ADMIN_FIELDS_ON_FORM
    );
  }

  // Require e-sign for ALL status changes (incl. UNDER_CLIENT_FINAL_REVIEW)
  const needsESign = (_s: string) => true;

  // Save status change – send reason + eSignPassword directly to backend
  async function handleChangeStatus(report: Report, nextStatus: string) {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Missing auth token");
      return;
    }

    setSaving(true);
    setESignError("");

    try {
      // Frontend rule: reason and e-sign password are mandatory for all changes
      if (!reason.trim()) {
        setSaving(false);
        setESignError("");
        alert("Reason for change is required.");
        return;
      }
      if (needsESign(nextStatus) && !eSignPassword) {
        setSaving(false);
        setESignError("E-signature password is required.");
        return;
      }

      const res = await fetch(
        `${BASE_URL}/reports/micro-mix/${report.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            status: nextStatus,
            reason, // ← always provide a reason (backend requires for critical fields)
            eSignPassword, // ← send raw password; backend verifies against current user
          }),
        }
      );

      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || "Failed to update status");
      }

      // Optimistic update
      setReports((prev) =>
        prev.map((r) => (r.id === report.id ? { ...r, status: nextStatus } : r))
      );
      setChangeStatusReport(null);
      setReason("");
      setESignPassword("");
      alert("Status updated successfully");
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (
        msg.toLowerCase().includes("electronic") ||
        msg.toLowerCase().includes("sign")
      ) {
        setESignError(msg); // e.g., "Electronic signature failed"
      } else {
        console.error("Failed to update status", err);
        alert(msg || "Failed to update status");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-slate-500">
            Oversee all Micro Mix reports and manage status transitions.
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

      {/* Filters */}
      <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm overflow-hidden">
        <div className="flex flex-wrap gap-3">
          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-44 shrink-0 rounded-lg border bg-white px-3 py-2 text-sm 
                 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {niceStatus(String(s))}
              </option>
            ))}
          </select>

          {/* Client search */}
          <input
            placeholder="Search by client"
            value={searchClient}
            onChange={(e) => setSearchClient(e.target.value)}
            className="flex-1 min-w-[140px] rounded-lg border px-3 py-2 text-sm 
                 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
          />

          {/* Report search */}
          <input
            placeholder="Search by report # (e.g., MMX-1234)"
            value={searchReport}
            onChange={(e) => setSearchReport(e.target.value)}
            className="flex-1 min-w-[160px] rounded-lg border px-3 py-2 text-sm 
                 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
          />

          {/* Date range */}
          <div className="flex gap-2 min-w-[200px]">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-40 rounded-lg border px-3 py-2 text-sm 
                   ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-40 rounded-lg border px-3 py-2 text-sm 
                   ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border bg-white shadow-sm">
        {error && (
          <div className="border-b bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

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

                        {canUpdateThisReport(r, user) && (
                          <button
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                            onClick={() =>
                              navigate(`/reports/micro-mix/${r.id}`)
                            }
                          >
                            Update
                          </button>
                        )}

                        <button
                          className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-purple-700"
                          onClick={() => {
                            setChangeStatusReport(r);
                            setNewStatus(String(r.status));
                            setReason("");
                            setESignPassword("");
                            setESignError("");
                          }}
                        >
                          Change Status
                        </button>
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
                    No reports match filters.
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
              <label htmlFor="perPage" className="sr-only">
                Rows
              </label>
              <select
                id="perPage"
                value={perPage}
                onChange={(e) => setPerPage(Number(e.target.value))}
                className="rounded-lg border bg-white px-3 py-1.5 text-sm ring-1 ring-inset ring-slate-200"
              >
                {[10, 20, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
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
              <MicroMixReportFormView
                report={selectedReport}
                onClose={() => setSelectedReport(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Change Status Dialog */}
      {changeStatusReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Change status"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-2">Change Status</h2>
            <p className="mb-3 text-sm text-slate-600">
              <strong>Current:</strong>{" "}
              {niceStatus(String(changeStatusReport.status))}
            </p>

            <select
              value={newStatus}
              onChange={(e) => {
                setNewStatus(e.target.value);
                setESignError("");
              }}
              className="mb-3 w-full rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              {ALL_STATUSES.filter((s) => s !== "ALL").map((s) => (
                <option key={s} value={s}>
                  {niceStatus(String(s))}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Reason for change"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mb-3 w-full rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />

            {needsESign(newStatus) && (
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                  <span>E‑signature password</span>
                </div>
                <div className="mb-2 flex items-stretch gap-2">
                  <input
                    type="password"
                    placeholder="Enter e‑signature password"
                    value={eSignPassword}
                    onChange={(e) => {
                      setESignPassword(e.target.value);
                      setESignError("");
                    }}
                    className="w-full rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
                    aria-invalid={!!eSignError}
                  />
                </div>
                {eSignError && (
                  <p className="mb-2 text-xs text-rose-600">{eSignError}</p>
                )}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50"
                onClick={() => setChangeStatusReport(null)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                onClick={() =>
                  handleChangeStatus(changeStatusReport, newStatus)
                }
                disabled={
                  saving ||
                  !reason.trim() ||
                  (needsESign(newStatus) && !eSignPassword)
                }
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// import { useEffect, useMemo, useRef, useState } from "react";
// import { useNavigate } from "react-router-dom";
// import MicroMixReportFormView from "../Reports/MicroMixReportFormView";
// import { useAuth } from "../../context/AuthContext";
// import { io } from "socket.io-client";
// import {
//   canShowUpdateButton,
//   type ReportStatus,
//   type Role,
// } from "../../utils/microMixReportFormWorkflow";

// // ---------------------------------
// // Types
// // ---------------------------------

// type Report = {
//   id: string;
//   client: string;
//   dateSent: string | null;
//   status: ReportStatus | string;
//   reportNumber: number;
//   prefix?: string;
// };

// // ---------------------------------
// // Constants
// // ---------------------------------

// const BASE_URL = "http://localhost:3000";

// const ALL_STATUSES: ("ALL" | ReportStatus)[] = [
//   "ALL",
//   "DRAFT",
//   "SUBMITTED_BY_CLIENT",
//   "CLIENT_NEEDS_PRELIMINARY_CORRECTION",
//   "CLIENT_NEEDS_FINAL_CORRECTION",
//   "UNDER_CLIENT_PRELIMINARY_CORRECTION",
//   "UNDER_CLIENT_FINAL_CORRECTION",
//   "PRELIMINARY_RESUBMISSION_BY_CLIENT",
//   "FINAL_RESUBMITTION_BY_CLIENT",
//   "UNDER_CLIENT_PRELIMINARY_REVIEW",
//   "UNDER_CLIENT_FINAL_REVIEW",
//   "RECEIVED_BY_FRONTDESK",
//   "FRONTDESK_ON_HOLD",
//   "FRONTDESK_NEEDS_CORRECTION",
//   "UNDER_PRELIMINARY_TESTING_REVIEW",
//   "PRELIMINARY_TESTING_ON_HOLD",
//   "PRELIMINARY_TESTING_NEEDS_CORRECTION",
//   "PRELIMINARY_RESUBMITTION_BY_TESTING",
//   "UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW",
//   "FINAL_RESUBMITTION_BY_TESTING",
//   "PRELIMINARY_APPROVED",
//   "UNDER_FINAL_TESTING_REVIEW",
//   "FINAL_TESTING_ON_HOLD",
//   "FINAL_TESTING_NEEDS_CORRECTION",
//   "FINAL_RESUBMITTION_BY_TESTING",
//   "UNDER_FINAL_RESUBMISSION_TESTING_REVIEW",
//   "UNDER_QA_REVIEW",
//   "QA_NEEDS_CORRECTION",
//   "UNDER_ADMIN_REVIEW",
//   "ADMIN_NEEDS_CORRECTION",
//   "ADMIN_REJECTED",
//   "UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW",
//   "FINAL_APPROVED",
//   "LOCKED",
// ];

// const STATUS_STYLES: Record<string, string> = {
//   DRAFT: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
//   SUBMITTED_BY_CLIENT: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",
//   RECEIVED_BY_FRONTDESK: "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200",
//   FRONTDESK_ON_HOLD: "bg-purple-100 text-purple-800 ring-1 ring-purple-200",
//   FRONTDESK_NEEDS_CORRECTION: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
//   UNDER_CLIENT_PRELIMINARY_REVIEW:
//     "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
//   UNDER_CLIENT_FINAL_REVIEW:
//     "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
//   CLIENT_NEEDS_PRELIMINARY_CORRECTION:
//     "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
//   CLIENT_NEEDS_FINAL_CORRECTION:
//     "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
//   UNDER_CLIENT_PRELIMINARY_CORRECTION:
//     "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200",
//   UNDER_CLIENT_FINAL_CORRECTION:
//     "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200",
//   PRELIMINARY_RESUBMISSION_BY_CLIENT:
//     "bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200",
//   FINAL_RESUBMITTION_BY_CLIENT:
//     "bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200",
//   UNDER_PRELIMINARY_TESTING_REVIEW:
//     "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
//   PRELIMINARY_TESTING_ON_HOLD:
//     "bg-yellow-100 text-yellow-900 ring-1 ring-yellow-200",
//   PRELIMINARY_TESTING_NEEDS_CORRECTION:
//     "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
//   UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW:
//     "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
//   PRELIMINARY_APPROVED:
//     "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
//   UNDER_FINAL_TESTING_REVIEW:
//     "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
//   FINAL_TESTING_ON_HOLD: "bg-yellow-100 text-yellow-900 ring-1 ring-yellow-200",
//   FINAL_TESTING_NEEDS_CORRECTION:
//     "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
//   UNDER_FINAL_RESUBMISSION_TESTING_REVIEW:
//     "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
//   UNDER_QA_REVIEW: "bg-sky-100 text-sky-800 ring-1 ring-sky-200",
//   QA_NEEDS_CORRECTION: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
//   UNDER_ADMIN_REVIEW: "bg-violet-100 text-violet-800 ring-1 ring-violet-200",
//   ADMIN_NEEDS_CORRECTION: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
//   ADMIN_REJECTED: "bg-slate-200 text-slate-800 ring-1 ring-slate-300",
//   UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW:
//     "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
//   FINAL_APPROVED: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
//   LOCKED: "bg-slate-200 text-slate-800 ring-1 ring-slate-300",
// };

// // ---------------------------------
// // Utilities
// // ---------------------------------

// function classNames(...xs: Array<string | false | null | undefined>) {
//   return xs.filter(Boolean).join(" ");
// }

// function niceStatus(s: string) {
//   return s.replace(/_/g, " ");
// }

// function formatDate(iso: string | null) {
//   if (!iso) return "-";
//   const d = new Date(iso);
//   if (Number.isNaN(d.getTime())) return "-";
//   return d.toLocaleDateString(undefined, {
//     year: "numeric",
//     month: "short",
//     day: "2-digit",
//   });
// }

// function displayReportNo(r: Report) {
//   return r.prefix
//     ? `${r.reportNumber}`
//     : String(r.reportNumber ?? "");
// }

// // Admin fields that are actually edited in Update view
// const ADMIN_FIELDS_ON_FORM = [
//   "comments",
//   "reviewedBy",
//   "reviewedDate",
//   "approvedBy",
//   "approvedDate",
//   "adminNotes",
// ];

// // ---------------------------------
// // Component
// // ---------------------------------

// export default function AdminDashboard() {
//   const [reports, setReports] = useState<Report[]>([]);
//   const [loading, setLoading] = useState<boolean>(true);
//   const [error, setError] = useState<string | null>(null);

//   // Filters
//   const [filterStatus, setFilterStatus] = useState<string>("ALL");
//   const [searchClient, setSearchClient] = useState("");
//   const [searchReport, setSearchReport] = useState("");
//   const [dateFrom, setDateFrom] = useState("");
//   const [dateTo, setDateTo] = useState("");

//   // Modal state
//   const [selectedReport, setSelectedReport] = useState<Report | null>(null);
//   const [changeStatusReport, setChangeStatusReport] = useState<Report | null>(
//     null
//   );
//   const [newStatus, setNewStatus] = useState<string>("");
//   const [reason, setReason] = useState<string>("");
//   const [eSignPassword, setESignPassword] = useState<string>("");

//   const navigate = useNavigate();
//   const { user } = useAuth();

//   // Socket (live updates)
//   const socketRef = useRef<ReturnType<typeof io> | null>(null);
//   useEffect(() => {
//     const token = localStorage.getItem("token");
//     socketRef.current = io(BASE_URL, {
//       transports: ["websocket"],
//       auth: { token },
//     });

//     socketRef.current.on("microMix:statusChanged", (payload: Report) => {
//       setReports((prev) =>
//         prev.map((r) =>
//           r.id === payload.id ? { ...r, status: payload.status } : r
//         )
//       );
//     });

//     socketRef.current.on("microMix:created", (payload: Report) => {
//       setReports((prev) => [payload, ...prev]);
//     });

//     return () => {
//       socketRef.current?.disconnect();
//     };
//   }, []);

//   // Fetch
//   useEffect(() => {
//     let abort = false;
//     async function fetchReports() {
//       try {
//         setLoading(true);
//         setError(null);
//         const token = localStorage.getItem("token");
//         if (!token) throw new Error("Missing auth token. Please log in again.");

//         const res = await fetch(`${BASE_URL}/reports/micro-mix`, {
//           headers: { Authorization: `Bearer ${token}` },
//         });
//         if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
//         const data: Report[] = await res.json();
//         if (abort) return;
//         setReports(data);
//       } catch (e: any) {
//         if (!abort) setError(e?.message ?? "Failed to fetch reports");
//       } finally {
//         if (!abort) setLoading(false);
//       }
//     }

//     fetchReports();
//     return () => {
//       abort = true;
//     };
//   }, []);

//   // Derived rows (filter → search → sort)
//   const processed = useMemo(() => {
//     const byStatus = reports.filter((r) =>
//       filterStatus === "ALL" ? true : r.status === filterStatus
//     );

//     const byClient = searchClient.trim()
//       ? byStatus.filter((r) =>
//           r.client.toLowerCase().includes(searchClient.toLowerCase())
//         )
//       : byStatus;

//     const byReport = searchReport.trim()
//       ? byClient.filter((r) =>
//           displayReportNo(r).toLowerCase().includes(searchReport.toLowerCase())
//         )
//       : byClient;

//     const byDateFrom = dateFrom
//       ? byReport.filter(
//           (r) => !r.dateSent || new Date(r.dateSent) >= new Date(dateFrom)
//         )
//       : byReport;
//     const byDateTo = dateTo
//       ? byDateFrom.filter(
//           (r) => !r.dateSent || new Date(r.dateSent) <= new Date(dateTo)
//         )
//       : byDateFrom;

//     // Sort default: newest first
//     return [...byDateTo].sort((a, b) => {
//       const aT = a.dateSent ? new Date(a.dateSent).getTime() : 0;
//       const bT = b.dateSent ? new Date(b.dateSent).getTime() : 0;
//       return bT - aT;
//     });
//   }, [reports, filterStatus, searchClient, searchReport, dateFrom, dateTo]);

//   // Pagination
//   const [page, setPage] = useState(1);
//   const [perPage, setPerPage] = useState(10);
//   const total = processed.length;
//   const totalPages = Math.max(1, Math.ceil(total / perPage));
//   const pageClamped = Math.min(page, totalPages);
//   const start = (pageClamped - 1) * perPage;
//   const end = start + perPage;
//   const pageRows = processed.slice(start, end);

//   useEffect(() => {
//     setPage(1);
//   }, [filterStatus, searchClient, searchReport, dateFrom, dateTo, perPage]);

//   // Permissions
//   function canUpdateThisReport(r: Report, user?: any) {
//     return canShowUpdateButton(
//       user?.role as Role,
//       r.status as ReportStatus,
//       ADMIN_FIELDS_ON_FORM
//     );
//   }

//   // Save status change
//   async function handleChangeStatus(report: Report, nextStatus: string) {
//     const token = localStorage.getItem("token");
//     if (!token) {
//       alert("Missing auth token");
//       return;
//     }

//     try {
//       const res = await fetch(
//         `${BASE_URL}/reports/micro-mix/${report.id}/status`,
//         {
//           method: "PATCH",
//           headers: {
//             "Content-Type": "application/json",
//             Authorization: `Bearer ${token}`,
//           },
//           body: JSON.stringify({
//             status: nextStatus,
//             reason: reason || "Admin changed status",
//             eSignPassword: eSignPassword || "",
//           }),
//         }
//       );

//       if (!res.ok) {
//         const msg = await res.text().catch(() => "");
//         throw new Error(msg || "Failed to update status");
//       }

//       // Optimistic update
//       setReports((prev) =>
//         prev.map((r) => (r.id === report.id ? { ...r, status: nextStatus } : r))
//       );
//       setChangeStatusReport(null);
//       setReason("");
//       setESignPassword("");
//       alert("Status updated successfully");
//     } catch (err: any) {
//       console.error("Failed to update status", err);
//       alert(err?.message || "Failed to update status");
//     }
//   }

//   const needsESign = (s: string) => s === "UNDER_CLIENT_FINAL_REVIEW" || s === "LOCKED";

//   return (
//     <div className="p-6">
//       {/* Header */}
//       <div className="mb-6 flex items-center justify-between gap-4">
//         <div>
//           <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
//           <p className="text-sm text-slate-500">
//             Oversee all Micro Mix reports and manage status transitions.
//           </p>
//         </div>
//         <div className="flex items-center gap-2">
//           <button
//             type="button"
//             onClick={() => window.location.reload()}
//             className="inline-flex items-center rounded-lg border px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
//             aria-label="Refresh"
//           >
//             ↻ Refresh
//           </button>
//         </div>
//       </div>

//       {/* Filters */}
//       {/* Filters */}
//       <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm overflow-hidden">
//         <div className="flex flex-wrap gap-3">
//           {/* Status filter */}
//           <select
//             value={filterStatus}
//             onChange={(e) => setFilterStatus(e.target.value)}
//             className="w-44 shrink-0 rounded-lg border bg-white px-3 py-2 text-sm
//                  ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
//           >
//             {ALL_STATUSES.map((s) => (
//               <option key={s} value={s}>
//                 {niceStatus(String(s))}
//               </option>
//             ))}
//           </select>

//           {/* Client search */}
//           <input
//             placeholder="Search by client"
//             value={searchClient}
//             onChange={(e) => setSearchClient(e.target.value)}
//             className="flex-1 min-w-[140px] rounded-lg border px-3 py-2 text-sm
//                  ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
//           />

//           {/* Report search */}
//           <input
//             placeholder="Search by report # (e.g., MMX-1234)"
//             value={searchReport}
//             onChange={(e) => setSearchReport(e.target.value)}
//             className="flex-1 min-w-[160px] rounded-lg border px-3 py-2 text-sm
//                  ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
//           />

//           {/* Date range */}
//           <div className="flex gap-2 min-w-[200px]">
//             <input
//               type="date"
//               value={dateFrom}
//               onChange={(e) => setDateFrom(e.target.value)}
//               className="w-40 rounded-lg border px-3 py-2 text-sm
//                    ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
//             />
//             <input
//               type="date"
//               value={dateTo}
//               onChange={(e) => setDateTo(e.target.value)}
//               className="w-40 rounded-lg border px-3 py-2 text-sm
//                    ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
//             />
//           </div>
//         </div>
//       </div>

//       {/* Table */}
//       <div className="rounded-2xl border bg-white shadow-sm">
//         {error && (
//           <div className="border-b bg-rose-50 p-3 text-sm text-rose-700">
//             {error}
//           </div>
//         )}

//         <div className="overflow-x-auto">
//           <table className="w-full border-separate border-spacing-0 text-sm">
//             <thead className="sticky top-0 z-10 bg-slate-50">
//               <tr className="text-left text-slate-600">
//                 <th className="px-4 py-3 font-medium">Report #</th>
//                 <th className="px-4 py-3 font-medium">Client</th>
//                 <th className="px-4 py-3 font-medium">Date Sent</th>
//                 <th className="px-4 py-3 font-medium">Status</th>
//                 <th className="px-4 py-3 font-medium">Actions</th>
//               </tr>
//             </thead>
//             <tbody>
//               {loading &&
//                 [...Array(6)].map((_, i) => (
//                   <tr key={`skel-${i}`} className="border-t">
//                     <td className="px-4 py-3">
//                       <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
//                     </td>
//                     <td className="px-4 py-3">
//                       <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
//                     </td>
//                     <td className="px-4 py-3">
//                       <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
//                     </td>
//                     <td className="px-4 py-3">
//                       <div className="h-5 w-56 animate-pulse rounded bg-slate-200" />
//                     </td>
//                     <td className="px-4 py-3">
//                       <div className="h-8 w-28 animate-pulse rounded bg-slate-200" />
//                     </td>
//                   </tr>
//                 ))}

//               {!loading &&
//                 pageRows.map((r) => (
//                   <tr key={r.id} className="border-t hover:bg-slate-50">
//                     <td className="px-4 py-3 font-medium">
//                       {displayReportNo(r)}
//                     </td>
//                     <td className="px-4 py-3">{r.client}</td>
//                     <td className="px-4 py-3">{formatDate(r.dateSent)}</td>
//                     <td className="px-4 py-3">
//                       <span
//                         className={classNames(
//                           "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
//                           STATUS_STYLES[String(r.status)] ||
//                             "bg-slate-100 text-slate-800 ring-1 ring-slate-200"
//                         )}
//                       >
//                         {niceStatus(String(r.status))}
//                       </span>
//                     </td>
//                     <td className="px-4 py-3">
//                       <div className="flex items-center gap-2">
//                         <button
//                           className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
//                           onClick={() => setSelectedReport(r)}
//                         >
//                           View
//                         </button>

//                         {canUpdateThisReport(r, user) && (
//                           <button
//                             className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
//                             onClick={() =>
//                               navigate(`/reports/micro-mix/${r.id}`)
//                             }
//                           >
//                             Update
//                           </button>
//                         )}

//                         <button
//                           className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-purple-700"
//                           onClick={() => {
//                             setChangeStatusReport(r);
//                             setNewStatus(String(r.status));
//                             setReason("");
//                             setESignPassword("");
//                           }}
//                         >
//                           Change Status
//                         </button>
//                       </div>
//                     </td>
//                   </tr>
//                 ))}

//               {!loading && pageRows.length === 0 && (
//                 <tr>
//                   <td
//                     colSpan={5}
//                     className="px-4 py-12 text-center text-slate-500"
//                   >
//                     No reports match filters.
//                   </td>
//                 </tr>
//               )}
//             </tbody>
//           </table>
//         </div>

//         {/* Pagination */}
//         {!loading && total > 0 && (
//           <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 text-sm md:flex-row">
//             <div className="text-slate-600">
//               Showing <span className="font-medium">{start + 1}</span>–
//               <span className="font-medium">{Math.min(end, total)}</span> of
//               <span className="font-medium"> {total}</span>
//             </div>
//             <div className="flex items-center gap-2">
//               <label htmlFor="perPage" className="sr-only">
//                 Rows
//               </label>
//               <select
//                 id="perPage"
//                 value={perPage}
//                 onChange={(e) => setPerPage(Number(e.target.value))}
//                 className="rounded-lg border bg-white px-3 py-1.5 text-sm ring-1 ring-inset ring-slate-200"
//               >
//                 {[10, 20, 50].map((n) => (
//                   <option key={n} value={n}>
//                     {n}
//                   </option>
//                 ))}
//               </select>
//               <button
//                 className="rounded-lg border px-3 py-1.5 disabled:opacity-50"
//                 onClick={() => setPage((p) => Math.max(1, p - 1))}
//                 disabled={pageClamped === 1}
//               >
//                 Prev
//               </button>
//               <span className="tabular-nums">
//                 {pageClamped} / {totalPages}
//               </span>
//               <button
//                 className="rounded-lg border px-3 py-1.5 disabled:opacity-50"
//                 onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
//                 disabled={pageClamped === totalPages}
//               >
//                 Next
//               </button>
//             </div>
//           </div>
//         )}
//       </div>

//       {/* Modal: read-only full form */}
//       {selectedReport && (
//         <div
//           className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
//           role="dialog"
//           aria-modal="true"
//           aria-label="Report details"
//           onClick={(e) => {
//             if (e.target === e.currentTarget) setSelectedReport(null);
//           }}
//         >
//           <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl">
//             <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
//               <h2 className="text-lg font-semibold">
//                 Report ({displayReportNo(selectedReport)})
//               </h2>
//               <div className="flex items-center gap-2">
//                 {canUpdateThisReport(selectedReport, user) && (
//                   <button
//                     className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
//                     onClick={() => {
//                       const id = selectedReport.id;
//                       setSelectedReport(null);
//                       navigate(`/reports/micro-mix/${id}`);
//                     }}
//                   >
//                     Update
//                   </button>
//                 )}
//                 <button
//                   className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
//                   onClick={() => setSelectedReport(null)}
//                 >
//                   Close
//                 </button>
//               </div>
//             </div>
//             <div className="overflow-auto px-6 py-4">
//               <MicroMixReportFormView
//                 report={selectedReport}
//                 onClose={() => setSelectedReport(null)}
//               />
//             </div>
//           </div>
//         </div>
//       )}

//       {/* Change Status Dialog */}
//       {changeStatusReport && (
//         <div
//           className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
//           role="dialog"
//           aria-modal="true"
//           aria-label="Change status"
//         >
//           <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
//             <h2 className="text-lg font-semibold mb-2">Change Status</h2>
//             <p className="mb-3 text-sm text-slate-600">
//               <strong>Current:</strong>{" "}
//               {niceStatus(String(changeStatusReport.status))}
//             </p>

//             <select
//               value={newStatus}
//               onChange={(e) => setNewStatus(e.target.value)}
//               className="mb-3 w-full rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
//             >
//               {ALL_STATUSES.filter((s) => s !== "ALL").map((s) => (
//                 <option key={s} value={s}>
//                   {niceStatus(String(s))}
//                 </option>
//               ))}
//             </select>

//             <input
//               type="text"
//               placeholder="Reason for change"
//               value={reason}
//               onChange={(e) => setReason(e.target.value)}
//               className="mb-3 w-full rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
//             />

//             {needsESign(newStatus) && (
//               <input
//                 type="password"
//                 placeholder="E‑signature password"
//                 value={eSignPassword}
//                 onChange={(e) => setESignPassword(e.target.value)}
//                 className="mb-3 w-full rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
//                 required
//               />
//             )}

//             <div className="mt-4 flex justify-end gap-2">
//               <button
//                 className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50"
//                 onClick={() => setChangeStatusReport(null)}
//               >
//                 Cancel
//               </button>
//               <button
//                 className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
//                 onClick={() =>
//                   handleChangeStatus(changeStatusReport, newStatus)
//                 }
//               >
//                 Save
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }
