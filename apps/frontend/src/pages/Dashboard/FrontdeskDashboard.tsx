import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import MicroMixReportFormView from "../Reports/MicroMixReportFormView";
import { useAuth } from "../../context/AuthContext";
import type {
  Role,
  ReportStatus,
} from "../../utils/microMixReportFormWorkflow";
import {
  canShowUpdateButton,
  STATUS_COLORS,
} from "../../utils/microMixReportFormWorkflow";
import { api } from "../../lib/api";
import MicroMixWaterReportFormView from "../Reports/MicroMixWaterReportFormView";
import MicroGeneralReportFormView from "../Reports/MicroGeneralReportFormView";
import MicroGeneralWaterReportFormView from "../Reports/MicroGeneralWaterReportFormView";

// -----------------------------
// Types
// -----------------------------

type Report = {
  id: string;
  formNumber: string;
  formType: string;
  dateSent: string | null;
  status: ReportStatus | string;
  reportNumber: string;
};

const FRONTDESK_STATUSES: ("ALL" | ReportStatus)[] = [
  "ALL",
  "RECEIVED_BY_FRONTDESK",
  "FRONTDESK_ON_HOLD",
  "FRONTDESK_NEEDS_CORRECTION",
];

// used to know which viewer to render
const formTypeToSlug: Record<string, string> = {
  MICRO_MIX: "micro-mix",
  MICRO_MIX_WATER: "micro-mix-water",
  MICRO_GENERAL: "micro-general",
  MICRO_GENERAL_WATER: "micro-general-water",
};

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

function canUpdateThisReport(r: Report, user?: any) {
  if (user?.role !== "CLIENT") return false;
  if (r.formNumber !== user?.clientCode) return false;
  return canShowUpdateButton(user?.role as Role, r.status as ReportStatus);
}

// --------------- Bulk print helper (renders selected reports + window.print) ---------------
function BulkPrintArea({
  reports,
  onAfterPrint,
}: {
  reports: Report[];
  onAfterPrint: () => void;
}) {
  if (!reports.length) return null;

  useEffect(() => {
    const tid = setTimeout(() => {
      window.print();
    }, 80);

    const handleAfterPrint = () => {
      onAfterPrint();
    };
    window.addEventListener("afterprint", handleAfterPrint);

    return () => {
      clearTimeout(tid);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [reports, onAfterPrint]);

  return (
    <div id="bulk-print-root" className="hidden print:block">
      {reports.map((r) => {
        const pageStyle: React.CSSProperties = {
          pageBreakAfter: "always",
          breakAfter: "page",
        };

        if (r.formType === "MICRO_MIX") {
          return (
            <div key={r.id} className="report-page" style={pageStyle}>
              <MicroMixReportFormView
                report={r}
                onClose={() => {}}
                showSwitcher={false}
                isBulkPrint={true}
              />
            </div>
          );
        } else if (r.formType === "MICRO_MIX_WATER") {
          return (
            <div key={r.id} className="report-page" style={pageStyle}>
              <MicroMixWaterReportFormView
                report={r}
                onClose={() => {}}
                showSwitcher={false}
                isBulkPrint={true}
              />
            </div>
          );
        } else if (r.formType === "MICRO_GENERAL") {
          return (
            <div key={r.id} className="report-page" style={pageStyle}>
              <MicroGeneralReportFormView
                report={r}
                onClose={() => {}}
                showSwitcher={false}
                isBulkPrint={true}
              />
            </div>
          );
        } else if (r.formType === "MICRO_GENERAL_WATER") {
          return (
            <div key={r.id} className="report-page" style={pageStyle}>
              <MicroGeneralWaterReportFormView
                report={r}
                onClose={() => {}}
                showSwitcher={false}
                isBulkPrint={true}
              />
            </div>
          );
        } else {
          return (
            <div key={r.id} className="report-page" style={pageStyle}>
              <h1>{r.reportNumber}</h1>
              <p>Unknown form type: {r.formType}</p>
            </div>
          );
        }
      })}
    </div>
  );
}

// -----------------------------
// Component
// -----------------------------

export default function FrontDeskDashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"ALL" | ReportStatus>("ALL");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"dateSent" | "reportNumber">("dateSent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [modalPane, setModalPane] = useState<"FORM" | "ATTACHMENTS">("FORM");

  // NEW: selected row IDs for bulk print
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // NEW: whether we are currently rendering for print
  const [isBulkPrinting, setIsBulkPrinting] = useState(false);

  const navigate = useNavigate();
  const { user } = useAuth();

  // Fetch all Micro mix reports (match your old code)
  useEffect(() => {
    let abort = false;
    async function fetchReports() {
      try {
        setLoading(true);
        setError(null);
        const all = await api<Report[]>("/reports");

        const keep = new Set(FRONTDESK_STATUSES.filter((s) => s !== "ALL"));
        const filtered = all.filter((r) => keep.has(r.status as any));
        if (!abort) setReports(filtered);
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

  // Derived table data
  const processed = useMemo(() => {
    const byStatus =
      statusFilter === "ALL"
        ? reports
        : reports.filter((r) => r.status === statusFilter);

    const bySearch = search.trim()
      ? byStatus.filter((r) => {
          const q = search.toLowerCase();
          return (
            r.reportNumber.toLowerCase().includes(q) ||
            r.formNumber.toLowerCase().includes(q) ||
            String(r.status).toLowerCase().includes(q)
          );
        })
      : byStatus;

    const sorted = [...bySearch].sort((a, b) => {
      if (sortBy === "reportNumber") {
        const aN = a.reportNumber.toLowerCase();
        const bN = b.reportNumber.toLowerCase();
        return sortDir === "asc" ? aN.localeCompare(bN) : bN.localeCompare(aN);
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

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, search, perPage]);

  async function setStatus(
    r: Report,
    newStatus: string,
    reason = "Common Status Change"
  ) {
    const slug = formTypeToSlug[r.formType] || "micro-mix";
    await api(`/reports/${slug}/${r.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ reason, status: newStatus }),
    });
  }

  function goToReportEditor(r: Report) {
    const slug = formTypeToSlug[r.formType] || "micro-mix";
    navigate(`/reports/${slug}/${r.id}`);
  }

  // checkbox helpers
  const isRowSelected = (id: string) => selectedIds.includes(id);

  const toggleRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // select all on current page
  const allOnPageSelected =
    pageRows.length > 0 && pageRows.every((r) => selectedIds.includes(r.id));

  const toggleSelectPage = () => {
    if (allOnPageSelected) {
      // unselect all page rows
      setSelectedIds((prev) =>
        prev.filter((id) => !pageRows.some((r) => r.id === id))
      );
    } else {
      // add all page rows
      setSelectedIds((prev) => {
        const set = new Set(prev);
        pageRows.forEach((r) => set.add(r.id));
        return Array.from(set);
      });
    }
  };

  // when clicking "Print selected"
  const handlePrintSelected = () => {
    if (!selectedIds.length) return;
    setIsBulkPrinting(true);
  };

  // the reports we are actually going to print
  const selectedReportObjects = selectedIds
    .map((id) => reports.find((r) => r.id === id))
    .filter(Boolean) as Report[];

  return (
    <div className="p-6">
      {isBulkPrinting && (
        <style>
          {`
    @media print {
      /* hide everything */
      body * {
        visibility: hidden !important;
      }

      /* show only our bulk print area */
      #bulk-print-root,
      #bulk-print-root * {
        visibility: visible !important;
      }

      #bulk-print-root {
        position: absolute;
        inset: 0;
        background: white;
      }

      /* make all report "sheets" use the full printable width */
      #bulk-print-root .sheet {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        box-shadow: none !important;
        border: none !important;
      }

      /* make sure each printed report starts on a new page */
      #bulk-print-root .report-page {
        page-break-after: always;
        break-after: page;
      }

      /* optional: reduce default page margins */
      @page {
        size: A4 portrait;
        margin: 6mm 10mm 10mm 10mm;
      }
    }
    `}
        </style>
      )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Frontdesk Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            View and manage your Micro Mix reports
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* NEW: Print selected button */}
          <button
            type="button"
            onClick={handlePrintSelected}
            disabled={!selectedIds.length}
            className={classNames(
              "inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium shadow-sm",
              selectedIds.length
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-slate-200 text-slate-500 cursor-not-allowed"
            )}
          >
            🖨️ Print selected ({selectedIds.length})
          </button>
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
        {/* Status filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {FRONTDESK_STATUSES.map((s) => (
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

        {/* Search & Sort */}
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search form #, formNumber, or status…"
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
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="dateSent">Date Sent</option>
              <option value="reportNumber">Form #</option>
            </select>

            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
              aria-label="Toggle sort direction"
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
        {error && (
          <div className="border-b bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="text-left text-slate-600">
                {/* NEW: checkbox column */}
                <th className="px-4 py-3 font-medium w-10">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectPage}
                  />
                </th>
                <th className="px-4 py-3 font-medium">Report #</th>
                <th className="px-4 py-3 font-medium">Form #</th>
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
                      <div className="h-4 w-4 rounded bg-slate-200" />
                    </td>
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
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isRowSelected(r.id)}
                        onChange={() => toggleRow(r.id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium">{r.reportNumber}</td>
                    <td className="px-4 py-3">{r.formNumber}</td>
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
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                          onClick={() => setSelectedReport(r)}
                        >
                          View
                        </button>

                        <button
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                          onClick={async () => {
                            try {
                              if (
                                r.status ===
                                "PRELIMINARY_TESTING_NEEDS_CORRECTION"
                              ) {
                                await setStatus(
                                  r,
                                  "UNDER_CLIENT_PRELIMINARY_CORRECTION",
                                  "Sent back to formNumber for correction"
                                );
                              }
                              goToReportEditor(r);
                            } catch (e: any) {
                              alert(e?.message || "Failed to update status");
                            }
                          }}
                        >
                          Update
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

              {!loading && pageRows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
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
            <div className="sticky top-0 z-10 relative flex items-center justify-between border-b bg-white px-6 py-4">
              <h2 className="text-lg font-semibold">
                Report ({selectedReport.reportNumber})
              </h2>

              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 no-print">
                <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs shadow-sm">
                  <button
                    type="button"
                    onClick={() => setModalPane("FORM")}
                    className={`px-3 py-1 rounded-full transition ${
                      modalPane === "FORM"
                        ? "bg-blue-600 text-white"
                        : "text-slate-700 hover:bg-white"
                    }`}
                    aria-pressed={modalPane === "FORM"}
                  >
                    Form
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalPane("ATTACHMENTS")}
                    className={`px-3 py-1 rounded-full transition ${
                      modalPane === "ATTACHMENTS"
                        ? "bg-blue-600 text-white"
                        : "text-slate-700 hover:bg-white"
                    }`}
                    aria-pressed={modalPane === "ATTACHMENTS"}
                  >
                    Attachments
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 justify-self-end">
                {canUpdateThisReport(selectedReport, user) && (
                  <button
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                    onClick={async () => {
                      try {
                        if (
                          selectedReport.status ===
                          "PRELIMINARY_TESTING_NEEDS_CORRECTION"
                        ) {
                          await setStatus(
                            selectedReport,
                            "UNDER_CLIENT_PRELIMINARY_CORRECTION",
                            "Sent back to formNumber for correction"
                          );
                        }
                        setSelectedReport(null);
                        goToReportEditor(selectedReport);
                      } catch (e: any) {
                        alert(e?.message || "Failed to update status");
                      }
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
              {selectedReport?.formType === "MICRO_MIX" ? (
                <MicroMixReportFormView
                  report={selectedReport}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane={modalPane}
                  onPaneChange={setModalPane}
                />
              ) : selectedReport?.formType === "MICRO_MIX_WATER" ? (
                <MicroMixWaterReportFormView
                  report={selectedReport}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane={modalPane}
                  onPaneChange={setModalPane}
                />
              ) : selectedReport?.formType === "MICRO_GENERAL" ? (
                <MicroGeneralReportFormView
                  report={selectedReport}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane={modalPane}
                  onPaneChange={setModalPane}
                />
              ) : selectedReport?.formType === "MICRO_GENERAL_WATER" ? (
                <MicroGeneralWaterReportFormView
                  report={selectedReport}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane={modalPane}
                  onPaneChange={setModalPane}
                />
              ) : (
                <div className="text-sm text-slate-600">
                  This form type ({selectedReport?.formType}) doesn’t have a
                  viewer yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* bulk print hidden area */}
      {isBulkPrinting && (
        <BulkPrintArea
          reports={selectedReportObjects}
          onAfterPrint={() => {
            // after print, we can clear printing flag
            setIsBulkPrinting(false);
            // optionally keep selection or clear
            // setSelectedIds([]);
          }}
        />
      )}
    </div>
  );
}

