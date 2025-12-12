import { useEffect, useMemo, useState } from "react";
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
import toast from "react-hot-toast";
import MicroMixWaterReportFormView from "../Reports/MicroMixWaterReportFormView";
import React from "react";
import { createPortal } from "react-dom";
import ChemistryMixReportFormView from "../Reports/ChemistryMixReportFormView";
import {
  canShowChemistryUpdateButton,
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
  status: ReportStatus | string; // Some backends may still send raw string
  formNumber: string;
};

// A status filter can be micro OR chemistry OR "ALL"
type DashboardStatus = "ALL" | ReportStatus | ChemistryReportStatus;

// Micro client statuses (what you already had)
const CLIENT_MICRO_STATUSES: DashboardStatus[] = [
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
  "PRELIMINARY_RESUBMISSION_BY_CLIENT",
  "FINAL_RESUBMISSION_BY_CLIENT",
  "LOCKED",
];

// Chemistry client statuses – adjust to your real flow
const CLIENT_CHEM_STATUSES: DashboardStatus[] = [
  "ALL",
  "APPROVED",
  "DRAFT",
  "SUBMITTED_BY_CLIENT",
  "CLIENT_NEEDS_CORRECTION",
  "UNDER_CLIENT_CORRECTION",
  "RESUBMISSION_BY_CLIENT",
  "LOCKED",
];

// // Include an "ALL" pseudo-status for filtering
// const CLIENT_STATUSES: ("ALL" | ReportStatus)[] = [
//   "ALL",
//   "FINAL_APPROVED",
//   "DRAFT",
//   "SUBMITTED_BY_CLIENT",
//   "UNDER_CLIENT_PRELIMINARY_REVIEW",
//   "UNDER_CLIENT_FINAL_REVIEW",
//   "CLIENT_NEEDS_PRELIMINARY_CORRECTION",
//   "CLIENT_NEEDS_FINAL_CORRECTION",
//   "UNDER_CLIENT_PRELIMINARY_CORRECTION",
//   "UNDER_CLIENT_FINAL_CORRECTION",
//   "PRELIMINARY_RESUBMISSION_BY_CLIENT",
//   "FINAL_RESUBMISSION_BY_CLIENT",
//   "LOCKED",
// ];

// -----------------------------
// Utilities
// -----------------------------

const formTypeToSlug: Record<string, string> = {
  MICRO_MIX: "micro-mix",
  MICRO_MIX_WATER: "micro-mix-water",
  CHEMISTRY_MIX: "chemistry-mix",
  // CHEMISTRY_* can be added when you wire those forms
};

// const isMicro = (ft?: string) =>
//   typeof ft === "string" && ft.startsWith("MICRO");

function getFormPrefix(formNumber?: string): string | null {
  if (!formNumber) return null;
  const m = formNumber.trim().match(/^[A-Za-z]{3}/);
  return m ? m[0].toUpperCase() : null;
}
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
  if (getFormPrefix(r.formNumber) !== user?.clientCode) return false;

  const fieldsUsedOnForm = [
    "client",
    "dateSent",
    "typeOfTest",
    "sampleType",
    "formulaNo",
    "idNo",
    "description",
    "lotNo",
    "manufactureDate",
    "samplingDate",
    "pathogens",
  ];

  return canShowUpdateButton(
    user?.role as Role,
    r.status as ReportStatus,
    fieldsUsedOnForm
  );
}

function canUpdateThisChemistryReport(r: Report, user?: any) {
  if (user?.role !== "CLIENT") return false;
  if (getFormPrefix(r.formNumber) !== user?.clientCode) return false;

  const chemistryFieldsUsedOnForm = [
    "client",
    "dateSent",
    "sampleDescription",
    "testTypes",
    "samplePosition",
    "lotBatchNo",
    "manufactureDate",
    "formulaId",
    "sampleSize",
    "numberOfActives",
    "sampleTypes",
    "comments",
    "activeToBeTested",
    "formulaContent",
  ];

  return canShowChemistryUpdateButton(
    user?.role,
    r.status as ChemistryReportStatus,
    chemistryFieldsUsedOnForm
  );
}

const paneFor = (status: string): "FORM" | "ATTACHMENTS" =>
  status === "UNDER_CLIENT_FINAL_REVIEW" || status === "FINAL_APPROVED"
    ? "ATTACHMENTS"
    : "FORM";

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

        if (r.formType === "MICRO_MIX") {
          return (
            <div key={r.id} className="report-page">
              <MicroMixReportFormView
                report={r}
                onClose={() => {}}
                showSwitcher={false}
                isBulkPrint={true}
                isSingleBulk={isSingle}
              />
            </div>
          );
        } else if (r.formType === "MICRO_MIX_WATER") {
          return (
            <div key={r.id} className="report-page">
              <MicroMixWaterReportFormView
                report={r}
                onClose={() => {}}
                showSwitcher={false}
                isBulkPrint={true}
                isSingleBulk={isSingle}
              />
            </div>
          );
        } else if (r.formType === "CHEMISTRY_MIX") {
          return (
            <div key={r.id} className="report-page">
              <ChemistryMixReportFormView report={r} onClose={() => {}} />
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

export default function ClientDashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // const [statusFilter, setStatusFilter] = useState<"ALL" | ReportStatus>("ALL");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"dateSent" | "formNumber">("dateSent");
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

  const [formFilter, setFormFilter] = useState<"ALL" | "MICRO" | "CHEMISTRY">(
    "ALL"
  );

  // status filter now uses combined type
  const [statusFilter, setStatusFilter] = useState<DashboardStatus>("ALL");

  const statusOptions =
    formFilter === "CHEMISTRY" ? CLIENT_CHEM_STATUSES : CLIENT_MICRO_STATUSES;

  // // status filter now uses combined type
  // const [statusFilter, setStatusFilter] = useState<DashboardStatus>("ALL");

  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    let abort = false;
    async function fetchReports() {
      try {
        setLoading(true);
        setError(null);

        const micro = await api<Report[]>("/reports");
        const chemistry = await api<Report[]>("/chemistry-reports");

        const all = [...micro, ...chemistry];

        if (abort) return;

        const clientReports = all.filter(
          (r) => getFormPrefix(r.formNumber) === user?.clientCode
        );
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
    // 1) form type filter
    const byForm =
      formFilter === "ALL"
        ? reports
        : reports.filter((r) =>
            formFilter === "MICRO"
              ? r.formType === "MICRO_MIX" || r.formType === "MICRO_MIX_WATER"
              : r.formType === "CHEMISTRY_MIX"
          );

    // 2) status filter – compare as strings so enums from both worlds work
    const byStatus =
      statusFilter === "ALL"
        ? byForm
        : byForm.filter((r) => String(r.status) === String(statusFilter));

    // 3) search
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

    // 4) sort (same as you already have)
    const sorted = [...bySearch].sort((a, b) => {
      if (sortBy === "formNumber") {
        const aN = a.formNumber.toLowerCase();
        const bN = b.formNumber.toLowerCase();
        return sortDir === "asc" ? aN.localeCompare(bN) : bN.localeCompare(aN);
      }
      const aT = a.dateSent ? new Date(a.dateSent).getTime() : 0;
      const bT = b.dateSent ? new Date(b.dateSent).getTime() : 0;
      return sortDir === "asc" ? aT - bT : bT - aT;
    });

    return sorted;
  }, [reports, formFilter, statusFilter, search, sortBy, sortDir]);

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

  async function setStatus(
    r: Report,
    newStatus: string,
    reason = "Client correction update"
  ) {
    // const slug = formTypeToSlug[r.formType] || "micro-mix";
    await api(`/reports/${r.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ reason, status: newStatus }),
    });

    // Update local state immediately so the UI stays in sync
    setReports((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, status: newStatus } : x))
    );
    // return res;
  }

  function goToReportEditor(r: Report) {
    const slug = formTypeToSlug[r.formType] || "micro-mix"; // default for legacy
    navigate(`/reports/${slug}/${r.id}`);
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
      {/* Header */}
      <div className="mb-2 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Client Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            View and manage your lab reports
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

      {/* Form type tabs */}
      <div className="mb-4 border-b border-slate-200">
        <nav className="-mb-px flex gap-6 text-sm">
          {(["ALL", "MICRO", "CHEMISTRY"] as const).map((ft) => {
            const isActive = formFilter === ft;
            return (
              <button
                key={ft}
                type="button"
                onClick={() => setFormFilter(ft)}
                className={classNames(
                  "pb-2 border-b-2 text-sm font-medium",
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                )}
              >
                {ft === "ALL"
                  ? "All forms"
                  : ft === "MICRO"
                  ? "Micro"
                  : "Chemistry"}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Controls Card */}
      <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
        {/* Status filter chips (scrollable) */}
        {/* Status filter chips (scrollable) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {statusOptions.map((s) => (
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
                <th className="px-4 py-3 font-medium w-10">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectPage}
                  />
                </th>
                <th className="px-4 py-3 font-medium">Form #</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Form @</th>
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
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isRowSelected(r.id)}
                        onChange={() => toggleRow(r.id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium">{r.formNumber}</td>
                    <td className="px-4 py-3">{r.client}</td>
                    <td className="px-4 py-3">{r.formType}</td>
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
                            // onClick={() =>
                            //   navigate(`/reports/${r.id}`)
                            // }
                            onClick={async () => {
                              try {
                                if (
                                  r.status ===
                                  "PRELIMINARY_TESTING_NEEDS_CORRECTION"
                                ) {
                                  await setStatus(
                                    r,
                                    "UNDER_CLIENT_PRELIMINARY_CORRECTION",
                                    "Sent back to client for correction"
                                  );
                                  toast.success("Report status updated");
                                } else if (
                                  r.status ===
                                  "PRELIMINARY_RESUBMISSION_BY_TESTING"
                                ) {
                                  await setStatus(
                                    r,
                                    "UNDER_CLIENT_PRELIMINARY_REVIEW",
                                    "Resubmission under Review"
                                  );
                                }
                                // navigate(`/reports/${r.id}`);
                                goToReportEditor(r);
                              } catch (e: any) {
                                alert(e?.message || "Failed to update status");
                                toast.error(
                                  e?.message || "Failed to update status"
                                );
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
            // close on backdrop click
            if (e.target === e.currentTarget) setSelectedReport(null);
          }}
        >
          <div className="h-[90vh] max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl flex flex-col">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
              <h2 className="text-lg font-semibold">
                Report ({selectedReport.formNumber})
              </h2>
              <div className="flex items-center gap-2">
                {/* ✅ NEW: Print this report */}
                <button
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                  onClick={() => setSinglePrintReport(selectedReport)}
                >
                  🖨️ Print
                </button>
                {canUpdateThisReport(selectedReport, user) && (
                  <button
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                    // onClick={() => {
                    //   const id = selectedReport.id;
                    //   setSelectedReport(null);
                    //   navigate(`/reports/${id}`);
                    // }}
                    onClick={async () => {
                      try {
                        // const id = selectedReport.id;
                        const r = selectedReport;
                        if (
                          selectedReport.status ===
                          "PRELIMINARY_TESTING_NEEDS_CORRECTION"
                        ) {
                          await setStatus(
                            r,
                            "UNDER_CLIENT_PRELIMINARY_CORRECTION",
                            "Sent back to client for correction"
                          );
                        } else if (
                          selectedReport.status ===
                          "PRELIMINARY_RESUBMISSION_BY_TESTING"
                        ) {
                          await setStatus(
                            r,
                            "UNDER_CLIENT_PRELIMINARY_REVIEW",
                            "Resubmission under Review"
                          );
                        }
                        setSelectedReport(null);
                        // navigate(`/reports/${id}`);
                        goToReportEditor(r);
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
            <div className="modal-body flex-1 min-h-0 overflow-auto px-6 py-4">
              {selectedReport?.formType === "MICRO_MIX" ? (
                <MicroMixReportFormView
                  report={selectedReport}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane={paneFor(String(selectedReport.status))}
                />
              ) : selectedReport?.formType === "MICRO_MIX_WATER" ? (
                <MicroMixWaterReportFormView
                  report={selectedReport}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane={paneFor(String(selectedReport.status))}
                />
              ) : selectedReport?.formType === "CHEMISTRY_MIX" ? (
                <ChemistryMixReportFormView
                  report={selectedReport}
                  onClose={() => setSelectedReport(null)}
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
    </div>
  );
}
