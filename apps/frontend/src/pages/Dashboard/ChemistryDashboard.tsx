import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";

import { api } from "../../lib/api";

import { createPortal } from "react-dom";
import ChemistryMixReportFormView from "../Reports/ChemistryMixReportFormView";
import {
  canShowChemistryUpdateButton,
  CHEMISTRY_STATUS_COLORS,
  type ChemistryReportStatus,
} from "../../utils/chemistryReportFormWorkflow";

// -----------------------------
// Types
// -----------------------------
type Report = {
  id: string;
  client: string;
  formType: string;
  dateSent: string | null;
  status: string;
  reportNumber: string | null;
  formNumber: string;
  prefix?: string;
};

// -----------------------------
// Statuses
// -----------------------------
const CHEMISTRY_STATUSES = [
  "ALL",
  "SUBMITTED_BY_CLIENT",
  "UNDER_TESTING_REVIEW",
  "TESTING_NEEDS_CORRECTION",
  "RESUBMISSION_BY_CLIENT",
  "CLIENT_NEEDS_CORRECTION",
  "UNDER_RESUBMISSION_TESTING_REVIEW",
  "APPROVED",
] as const;

// -----------------------------
// Utilities
// -----------------------------
const formTypeToSlug: Record<string, string> = {
  CHEMISTRY_MIX: "chemistry-mix",
};

// function getFormPrefix(formNumber?: string): string | null {
//   if (!formNumber) return null;
//   const m = formNumber.trim().match(/^[A-Za-z]{3}/);
//   return m ? m[0].toUpperCase() : null;
// }

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
  return r.reportNumber || "-";
}

// -----------------------------
// API helper
// -----------------------------
async function setStatus(
  r: Report,
  newStatus: string,
  reason = "Common Status Change"
) {
  await api(`/chemistry-reports/${r.id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ reason, status: newStatus }),
  });
}

// -----------------------------
// Reusable bulk/single print area
// -----------------------------
// -----------------------------
// ✅ Bulk print area
// -----------------------------
function BulkPrintArea({
  reports,
  onAfterPrint,
}: {
  reports: Report[];
  onAfterPrint: () => void;
}) {
  if (!reports.length) return null;

  const isSingle = reports.length === 1;
  React.useEffect(() => {
    const tid = setTimeout(() => {
      window.print();
    }, 200);

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
    <div
      id="bulk-print-root"
      className={
        isSingle ? "hidden print:block" : "hidden print:block multi-print"
      }
    >
      {reports.map((r) => {
        // ⬇️ only add page break when we have multiple
        // const pageStyle: React.CSSProperties = {
        //   pageBreakAfter: "always",
        //   breakAfter: "page",
        // };

        if (r.formType === "CHEMISTRY_MIX") {
          return (
            <div key={r.id} className="report-page">
              <ChemistryMixReportFormView
                report={r}
                onClose={() => {}}
                showSwitcher={false}
                isBulkPrint={true}
                isSingleBulk={isSingle}
              />
            </div>
          );
        } else {
          return (
            <div key={r.id} className="report-page">
              <h1>{r.formNumber}</h1>
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
export default function ChemistryDashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] =
    useState<(typeof CHEMISTRY_STATUSES)[number]>("ALL");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"dateSent" | "reportNumber">("dateSent");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  // ✅ multiple selection & bulk print
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkPrinting, setIsBulkPrinting] = useState(false);

  // ✅ NEW: single-report print from modal
  const [singlePrintReport, setSinglePrintReport] = useState<Report | null>(
    null
  );

  const navigate = useNavigate();
  const { user } = useAuth();

  // fetch
  useEffect(() => {
    let abort = false;
    async function fetchReports() {
      try {
        setLoading(true);
        setError(null);
        const all = await api<Report[]>("/chemistry-reports");
        if (abort) return;
        const keep = new Set(CHEMISTRY_STATUSES.filter((s) => s !== "ALL"));
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

  // derived
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
        const aK = (a.reportNumber || "").toLowerCase();
        const bK = (b.reportNumber || "").toLowerCase();
        return sortDir === "asc" ? aK.localeCompare(bK) : bK.localeCompare(aK);
      }
      const aT = a.dateSent ? new Date(a.dateSent).getTime() : 0;
      const bT = b.dateSent ? new Date(b.dateSent).getTime() : 0;
      return sortDir === "asc" ? aT - bT : bT - aT;
    });

    return sorted;
  }, [reports, statusFilter, search, sortBy, sortDir]);

  // pagination
  const total = processed.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageClamped = Math.min(page, totalPages);
  const start = (pageClamped - 1) * perPage;
  const end = start + perPage;
  const pageRows = processed.slice(start, end);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, search, perPage]);

  function canUpdateThisChemistryReportLocal(r: Report, user?: any) {
    const chemistryFieldsUsedOnForm = [
      "sop",
      "results",
      "dateTested",
      "initial",
      "comments",
      "testedBy",
      "testedDate",
    ];

    return canShowChemistryUpdateButton(
      user?.role,
      r.status as ChemistryReportStatus,
      chemistryFieldsUsedOnForm
    );
  }

  function goToReportEditor(r: Report) {
    const slug = formTypeToSlug[r.formType] || "chemistry-mix";
    navigate(`/chemistry-reports/${slug}/${r.id}`);
  }

  // selection
  const isRowSelected = (id: string) => selectedIds.includes(id);
  const toggleRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const allOnPageSelected =
    pageRows.length > 0 && pageRows.every((r) => selectedIds.includes(r.id));

  const toggleSelectPage = () => {
    if (allOnPageSelected) {
      setSelectedIds((prev) =>
        prev.filter((id) => !pageRows.some((r) => r.id === id))
      );
    } else {
      setSelectedIds((prev) => {
        const set = new Set(prev);
        pageRows.forEach((r) => set.add(r.id));
        return Array.from(set);
      });
    }
  };

  const handlePrintSelected = () => {
    if (!selectedIds.length) return;
    setIsBulkPrinting(true);
  };

  const selectedReportObjects = selectedIds
    .map((id) => reports.find((r) => r.id === id))
    .filter(Boolean) as Report[];

  return (
    <div className="p-6">
      {(isBulkPrinting || !!singlePrintReport) &&
        createPortal(
          <>
            <style>
              {`
                  @media print {
                  /* Hide everything in the document body except our print root */
                  body > *:not(#bulk-print-root) { display: none !important; }
                 #bulk-print-root { display: block !important; position: absolute; inset: 0; background: white; }
    
                  /* Page sizing & margins */
                  @page { size: A4 portrait; margin: 8mm 10mm 10mm 10mm; }
    
                  /* Make all report "sheets" fill the width without shadow/padding */
                  #bulk-print-root .sheet {
                    width: 100% !important;
                    max-width: 100% !important;
                    margin: 0 !important;
                    box-shadow: none !important;
                    border: none !important;
                    padding: 0 !important;
                  }
    
                  /* Keep each report together */
                  #bulk-print-root .report-page {
                    break-inside: avoid-page;
                    page-break-inside: avoid;
                  }
    
                  /* Start every report AFTER the first on a new page */
                  #bulk-print-root .report-page + .report-page {
                    break-before: page;
                    page-break-before: always;
                  }
    
                  @supports (margin-trim: block) {
                    @page { margin-trim: block; }
                  }
                }
            `}
            </style>

            <BulkPrintArea
              reports={
                isBulkPrinting ? selectedReportObjects : [singlePrintReport!]
              }
              onAfterPrint={() => {
                if (isBulkPrinting) setIsBulkPrinting(false);
                if (singlePrintReport) setSinglePrintReport(null);
              }}
            />
          </>,
          document.body
        )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Chemistry Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            Queue of Chemistry reports for chemistry team.
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Controls */}
      <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {CHEMISTRY_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={classNames(
                "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ring-1",
                statusFilter === s
                  ? "bg-blue-600 text-white ring-blue-600"
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100 ring-slate-200"
              )}
            >
              {niceStatus(String(s))}
            </button>
          ))}
        </div>

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
              <option value="reportNumber">Report #</option>
            </select>
            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
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
                <th className="px-4 py-3 font-medium w-10">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectPage}
                  />
                </th>
                <th className="px-4 py-3 font-medium">Report #</th>
                <th className="px-4 py-3 font-medium">Form #</th>
                <th className="px-4 py-3 font-medium">Form @</th>
                <th className="px-4 py-3 font-medium">Date Sent</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                [...Array(7)].map((_, i) => (
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
                    <td className="px-4 py-3 font-medium">
                      {displayReportNo(r)}
                    </td>
                    <td className="px-4 py-3">{r.formNumber}</td>
                    <td className="px-4 py-3">{r.formType}</td>
                    <td className="px-4 py-3">{formatDate(r.dateSent)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={classNames(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                          CHEMISTRY_STATUS_COLORS[
                            r.status as ChemistryReportStatus
                          ] ||
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
                        {canUpdateThisChemistryReportLocal(r, user) && (
                          <button
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                            onClick={async () => {
                              try {
                                if (r.status === "SUBMITTED_BY_CLIENT") {
                                  await setStatus(
                                    r,
                                    "UNDER_TESTING_REVIEW",
                                    "Move to prelim testing"
                                  );
                                } else if (
                                  r.status === "CLIENT_NEEDS_CORRECTION"
                                ) {
                                  await setStatus(
                                    r,
                                    "UNDER_RESUBMISSION_TESTING_REVIEW",
                                    "Move to RESUBMISSION "
                                  );
                                } else if (
                                  r.status === "RESUBMISSION_BY_CLIENT"
                                ) {
                                  await setStatus(
                                    r,
                                    "UNDER_TESTING_REVIEW",
                                    "Resubmitted by client"
                                  );
                                }
                                setReports((prev) =>
                                  prev.map((x) =>
                                    x.id === r.id
                                      ? {
                                          ...x,
                                          status:
                                            r.status === "SUBMITTED_BY_CLIENT"
                                              ? "UNDER_TESTING_REVIEW"
                                              : r.status ===
                                                "RESUBMISSION_BY_CLIENT"
                                              ? "UNDER_TESTING_REVIEW"
                                              : x.status,
                                        }
                                      : x
                                  )
                                );
                                goToReportEditor(r);
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
                    colSpan={7}
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

      {/* Modal */}
      {selectedReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
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
                {/* ✅ NEW: Print this report */}
                <button
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                  onClick={() => setSinglePrintReport(selectedReport)}
                >
                  🖨️ Print
                </button>

                {canUpdateThisChemistryReportLocal(selectedReport, user) && (
                  <button
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                    onClick={() => {
                      const r = selectedReport;
                      setSelectedReport(null);
                      goToReportEditor(r);
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
            <div className="overflow-y-auto px-6 py-4 max-h-[calc(90vh-72px)]">
              {selectedReport.formType === "CHEMISTRY_MIX" ? (
                <ChemistryMixReportFormView
                  report={selectedReport}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane="FORM"
                />
              ) : (
                <div className="text-sm text-slate-600">
                  This form type ({selectedReport.formType}) doesn’t have a
                  viewer yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* bulk print hidden area */}
      {/* {isBulkPrinting && (
        <BulkPrintArea
          reports={selectedReportObjects}
          onAfterPrint={() => {
            setIsBulkPrinting(false);
            // setSelectedIds([]);
          }}
        />
      )} */}

      {/* ✅ single-report print hidden area */}
      {/* {singlePrintReport && (
        <BulkPrintArea
          reports={[singlePrintReport]}
          onAfterPrint={() => {
            setSinglePrintReport(null);
          }}
        />
      )} */}
    </div>
  );
}
