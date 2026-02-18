// AdminDashboard.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";

import MicroMixReportFormView from "../Reports/MicroMixReportFormView";
import MicroMixWaterReportFormView from "../Reports/MicroMixWaterReportFormView";
import ChemistryMixReportFormView from "../Reports/ChemistryMixReportFormView";

import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { useLiveReportStatus } from "../../hooks/useLiveReportStatus";
import { logUiEvent } from "../../lib/uiAudit";

import {
  canShowUpdateButton,
  STATUS_COLORS,
  type ReportStatus,
  type Role,
} from "../../utils/microMixReportFormWorkflow";

import {
  canShowChemistryUpdateButton,
  CHEMISTRY_STATUS_COLORS,
  type ChemistryReportStatus,
} from "../../utils/chemistryReportFormWorkflow";

import {
  formatDate,
  matchesDateRange,
  toDateOnlyISO_UTC,
  type DatePreset,
} from "../../utils/dashboardsSharedTypes";
import SterilityReportFormView from "../Reports/SterilityReportFormView";

// ---------------------------------
// Types
// ---------------------------------
type Report = {
  id: string;
  client: string;
  formType: string;
  dateSent: string | null;
  status: ReportStatus | ChemistryReportStatus | string;
  reportNumber: string | number | null;
  formNumber: string | null;
  createdAt: string;
  version?: number; // optional; not required for printing
};

// ---------------------------------
// Constants
// ---------------------------------
const formTypeToSlug: Record<string, string> = {
  MICRO_MIX: "micro-mix",
  MICRO_MIX_WATER: "micro-mix-water",
  STERILITY: "sterility",
  CHEMISTRY_MIX: "chemistry-mix",
};

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
  "UNDER_QA_PRELIMINARY_REVIEW",
  "QA_NEEDS_PRELIMINARY_CORRECTION",
  "UNDER_QA_FINAL_REVIEW",
  "QA_NEEDS_FINAL_CORRECTION",
  "UNDER_ADMIN_REVIEW",
  "ADMIN_NEEDS_CORRECTION",
  "ADMIN_REJECTED",
  "UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW",
  "FINAL_APPROVED",
  "LOCKED",
];

// A status filter can be micro OR chemistry OR "ALL"
type DashboardStatus = "ALL" | ReportStatus | ChemistryReportStatus;

const ADMIN_MICRO_STATUSES: DashboardStatus[] = [
  "ALL",
  ...ALL_STATUSES.filter((s) => s !== "ALL"),
];

const ADMIN_CHEM_STATUSES: DashboardStatus[] = [
  "ALL",
  "DRAFT",
  "SUBMITTED_BY_CLIENT",
  "CLIENT_NEEDS_CORRECTION",
  "UNDER_CLIENT_CORRECTION",
  "RESUBMISSION_BY_CLIENT",
  "UNDER_CLIENT_REVIEW",
  "RECEIVED_BY_FRONTDESK",
  "FRONTDESK_ON_HOLD",
  "FRONTDESK_NEEDS_CORRECTION",
  "UNDER_TESTING_REVIEW",
  "TESTING_ON_HOLD",
  "TESTING_NEEDS_CORRECTION",
  "RESUBMISSION_BY_TESTING",
  "UNDER_RESUBMISSION_TESTING_REVIEW",
  "UNDER_QA_REVIEW",
  "QA_NEEDS_CORRECTION",
  "UNDER_ADMIN_REVIEW",
  "ADMIN_NEEDS_CORRECTION",
  "ADMIN_REJECTED",
  "UNDER_RESUBMISSION_ADMIN_REVIEW",
  "APPROVED",
  "LOCKED",
];

// ---------------------------------
// Utilities
// ---------------------------------
function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function niceStatus(s: string) {
  return s.replace(/_/g, " ");
}

function displayReportNo(r: Report) {
  return r.reportNumber ?? "-";
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white ${className}`}
      aria-hidden="true"
    />
  );
}
function SpinnerDark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 ${className}`}
      aria-hidden="true"
    />
  );
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

// -----------------------------
// Bulk print area (Admin)
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
    const tid = window.setTimeout(() => window.print(), 200);

    const handleAfterPrint = () => onAfterPrint();
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
        if (r.formType === "MICRO_MIX") {
          return (
            <div key={r.id} className="report-page">
              <MicroMixReportFormView
                report={r as any}
                onClose={() => {}}
                showSwitcher={false}
                isBulkPrint={true}
                isSingleBulk={isSingle}
              />
            </div>
          );
        }

        if (r.formType === "MICRO_MIX_WATER") {
          return (
            <div key={r.id} className="report-page">
              <MicroMixWaterReportFormView
                report={r as any}
                onClose={() => {}}
                showSwitcher={false}
                isBulkPrint={true}
                isSingleBulk={isSingle}
              />
            </div>
          );
        }

        if (r.formType === "CHEMISTRY_MIX") {
          return (
            <div key={r.id} className="report-page">
              <ChemistryMixReportFormView
                report={r as any}
                onClose={() => {}}
                showSwitcher={false}
                isBulkPrint={true}
                isSingleBulk={isSingle}
              />
            </div>
          );
        }

        return (
          <div key={r.id} className="report-page">
            <h1>{r.formNumber}</h1>
            <p>Unknown form type: {r.formType}</p>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------
// Component
// ---------------------------------
export default function AdminDashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchClient, setSearchClient] = useState("");
  const [searchReport, setSearchReport] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Modal state
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [changeStatusReport, setChangeStatusReport] = useState<Report | null>(
    null,
  );
  const [newStatus, setNewStatus] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [eSignPassword, setESignPassword] = useState<string>("");
  const [eSignError, setESignError] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);

  const [modalPane, setModalPane] = useState<"FORM" | "ATTACHMENTS">("FORM");

  const [formFilter, setFormFilter] = useState<
    "ALL" | "MICRO" | "MICROWATER" | "STERILITY" | "CHEMISTRY"
  >("ALL");

  // ✅ status filter now uses combined type
  const [statusFilter, setStatusFilter] = useState<DashboardStatus>("ALL");
  const statusOptions =
    formFilter === "CHEMISTRY" ? ADMIN_CHEM_STATUSES : ADMIN_MICRO_STATUSES;

  // Pagination
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // ✅ UX guards
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [datePreset, setDatePreset] = useState<DatePreset>("ALL");

  // -----------------------------
  // Selection + Printing (Admin)
  // -----------------------------
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkPrinting, setIsBulkPrinting] = useState(false);
  const [singlePrintReport, setSinglePrintReport] = useState<Report | null>(
    null,
  );

  const [printingBulk, setPrintingBulk] = useState(false);
  const [printingSingle, setPrintingSingle] = useState(false);

  const navigate = useNavigate();
  const { user } = useAuth();

  async function setStatus(
    r: Report,
    nextStatus: string,
    reasonText = "Common Status Change",
  ) {
    // ✅ IMPORTANT: your chemistry status endpoint expects NO reason (based on your other dashboards)
    const isChem = r.formType === "CHEMISTRY_MIX";
    const endpoint = isChem
      ? `/chemistry-reports/${r.id}/status`
      : `/reports/${r.id}/status`;

    const body = isChem
      ? { status: nextStatus }
      : { reason: reasonText, status: nextStatus };

    await api(endpoint, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  const fetchAll = async () => {
    const microReports = await api<Report[]>("/reports");
    const chemistryReports = await api<Report[]>("/chemistry-reports");
    return [...microReports, ...chemistryReports];
  };

  useEffect(() => {
    let abort = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const allReports = await fetchAll();
        if (!abort) setReports(allReports);
      } catch (e: any) {
        if (!abort) setError(e?.message ?? "Failed to fetch reports");
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => {
      abort = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Reset invalid status when switching formFilter
  useEffect(() => {
    const opts = statusOptions.map(String);
    if (statusFilter !== "ALL" && !opts.includes(String(statusFilter))) {
      setStatusFilter("ALL");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formFilter]);

  // Derived rows
  const processed = useMemo(() => {
    const byForm =
      formFilter === "ALL"
        ? reports
        : reports.filter((r) => {
            if (formFilter === "MICRO") return r.formType === "MICRO_MIX";
            if (formFilter === "MICROWATER")
              return r.formType === "MICRO_MIX_WATER";
            if (formFilter === "CHEMISTRY")
              return r.formType === "CHEMISTRY_MIX";
            return true;
          });

    const byStatus =
      statusFilter === "ALL"
        ? byForm
        : byForm.filter((r) => String(r.status) === String(statusFilter));

    const byClient = searchClient.trim()
      ? byStatus.filter((r) =>
          r.client.toLowerCase().includes(searchClient.toLowerCase()),
        )
      : byStatus;

    const byReport = searchReport.trim()
      ? byClient.filter((r) =>
          String(displayReportNo(r))
            .toLowerCase()
            .includes(searchReport.toLowerCase()),
        )
      : byClient;

    const byDate = byReport.filter((r) =>
      matchesDateRange(r.createdAt, dateFrom || undefined, dateTo || undefined),
    );

    return [...byDate].sort((a, b) => {
      const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bT - aT;
    });
  }, [
    reports,
    formFilter,
    statusFilter,
    searchClient,
    searchReport,
    dateFrom,
    dateTo,
  ]);

  const total = processed.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageClamped = Math.min(page, totalPages);
  const start = (pageClamped - 1) * perPage;
  const end = start + perPage;
  const pageRows = processed.slice(start, end);

  useEffect(() => {
    setPage(1);
  }, [
    statusFilter,
    searchClient,
    searchReport,
    dateFrom,
    dateTo,
    perPage,
    formFilter,
  ]);

  // -----------------------------
  // Selection helpers
  // -----------------------------
  const isRowSelected = (id: string) => selectedIds.includes(id);

  const toggleRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const allOnPageSelected =
    pageRows.length > 0 && pageRows.every((r) => selectedIds.includes(r.id));

  const toggleSelectPage = () => {
    if (allOnPageSelected) {
      setSelectedIds((prev) =>
        prev.filter((id) => !pageRows.some((r) => r.id === id)),
      );
    } else {
      setSelectedIds((prev) => {
        const set = new Set(prev);
        pageRows.forEach((r) => set.add(r.id));
        return Array.from(set);
      });
    }
  };

  const selectedReportObjects = selectedIds
    .map((id) => reports.find((r) => r.id === id))
    .filter(Boolean) as Report[];

  const handlePrintSelected = () => {
    if (printingBulk) return;
    if (!selectedIds.length) return;

    logUiEvent({
      action: "UI_PRINT_SELECTED",
      entity: "Report",
      details: `Printed selected reports (${selectedIds.length})`,
      entityId: selectedIds.join(","),
      meta: { reportIds: selectedIds, count: selectedIds.length },
    });

    setPrintingBulk(true);
    setIsBulkPrinting(true);
  };

  // optional: clear selection when filters change (avoids printing hidden rows)
  useEffect(() => {
    setSelectedIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formFilter,
    statusFilter,
    searchClient,
    searchReport,
    dateFrom,
    dateTo,
    perPage,
  ]);

  // Permissions
  function canUpdateThisMicro(r: Report, userObj?: any) {
    return canShowUpdateButton(
      userObj?.role as Role,
      r.status as ReportStatus,
      ADMIN_FIELDS_ON_FORM,
    );
  }

  function canUpdateThisChem(r: Report, userObj?: any) {
    return canShowChemistryUpdateButton(
      userObj?.role,
      r.status as ChemistryReportStatus,
      ADMIN_FIELDS_ON_FORM,
    );
  }

  const needsESign = (_s: string) => true;

  async function handleChangeStatus(report: Report, nextStatus: string) {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Missing auth token");
      return;
    }

    setSaving(true);
    setESignError("");

    try {
      if (!reason.trim()) {
        setSaving(false);
        alert("Reason for change is required.");
        return;
      }
      if (needsESign(nextStatus) && !eSignPassword) {
        setSaving(false);
        setESignError("E-signature password is required.");
        return;
      }

      const endpoint =
        report.formType === "CHEMISTRY_MIX"
          ? `/chemistry-reports/${report.id}/change-status`
          : `/reports/${report.id}/change-status`;

      await api(endpoint, {
        method: "PATCH",
        body: JSON.stringify({
          status: nextStatus,
          reason,
          eSignPassword,
        }),
      });

      setReports((prev) =>
        prev.map((r) =>
          r.id === report.id ? { ...r, status: nextStatus } : r,
        ),
      );

      setChangeStatusReport(null);
      setReason("");
      setESignPassword("");
      toast.success("Status updated successfully");
    } catch (err: any) {
      const backendMsg =
        err?.message ||
        err?.response?.data?.message ||
        err?.error ||
        err?.toString() ||
        "";

      if (backendMsg.toLowerCase().includes("electronic")) {
        setESignError("❌ Invalid e-signature password. Please try again.");
      } else if (backendMsg.toLowerCase().includes("reason")) {
        setESignError("⚠️ Please provide a valid reason for this change.");
      } else {
        setESignError("⚠️ Something went wrong while changing status.");
        console.error("Status change error:", err);
      }
    } finally {
      setSaving(false);
    }
  }

  function goToReportEditor(r: Report) {
    const slug = formTypeToSlug[r.formType] || "micro-mix";
    if (r.formType === "CHEMISTRY_MIX") {
      navigate(`/chemistry-reports/${slug}/${r.id}`);
    } else {
      navigate(`/reports/${slug}/${r.id}`);
    }
  }

  const badgeClasses = (r: Report) => {
    const isChem = r.formType === "CHEMISTRY_MIX";
    return (
      (isChem
        ? CHEMISTRY_STATUS_COLORS[r.status as ChemistryReportStatus]
        : STATUS_COLORS[r.status as ReportStatus]) ||
      "bg-slate-100 text-slate-800 ring-1 ring-slate-200"
    );
  };

  useEffect(() => {
    const now = new Date();

    const setRange = (from: Date, to: Date) => {
      setDateFrom(toDateOnlyISO_UTC(from));
      setDateTo(toDateOnlyISO_UTC(to));
    };

    if (datePreset === "ALL") {
      setDateFrom("");
      setDateTo("");
      return;
    }

    if (datePreset === "CUSTOM") return;

    if (datePreset === "TODAY") return setRange(now, now);

    if (datePreset === "YESTERDAY") {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return setRange(y, y);
    }

    if (datePreset === "LAST_7_DAYS") {
      const from = new Date(now);
      from.setDate(now.getDate() - 7);
      return setRange(from, now);
    }

    if (datePreset === "LAST_30_DAYS") {
      const from = new Date(now);
      from.setDate(now.getDate() - 30);
      return setRange(from, now);
    }

    if (datePreset === "THIS_MONTH") {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return setRange(from, to);
    }

    if (datePreset === "LAST_MONTH") {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return setRange(from, to);
    }

    if (datePreset === "THIS_YEAR") {
      const from = new Date(now.getFullYear(), 0, 1);
      const to = new Date(now.getFullYear(), 11, 31);
      return setRange(from, to);
    }

    if (datePreset === "LAST_YEAR") {
      const from = new Date(now.getFullYear() - 1, 0, 1);
      const to = new Date(now.getFullYear() - 1, 11, 31);
      return setRange(from, to);
    }
  }, [datePreset]);

  const hasActiveFilters = useMemo(() => {
    return (
      formFilter !== "ALL" ||
      String(statusFilter) !== "ALL" ||
      searchClient.trim() !== "" ||
      searchReport.trim() !== "" ||
      datePreset !== "ALL" ||
      dateFrom !== "" ||
      dateTo !== "" ||
      perPage !== 10
    );
  }, [
    formFilter,
    statusFilter,
    searchClient,
    searchReport,
    datePreset,
    dateFrom,
    dateTo,
    perPage,
  ]);

  const clearFilters = () => {
    setSearchClient("");
    setSearchReport("");
    setDatePreset("ALL");
    setDateFrom("");
    setDateTo("");
    setStatusFilter("ALL");
    setFormFilter("ALL");
    setPerPage(10);
    setPage(1);
  };

  useEffect(() => {
    setPage(1);
  }, [
    statusFilter,
    searchClient,
    searchReport,
    dateFrom,
    dateTo,
    perPage,
    formFilter,
    datePreset,
  ]);

  useLiveReportStatus(setReports);

  return (
    <div className="p-6">
      {/* -----------------------------
          PRINT PORTAL (bulk + single)
         ----------------------------- */}
      {(isBulkPrinting || !!singlePrintReport) &&
        createPortal(
          <>
            <style>
              {`
                @media print {
                  body > *:not(#bulk-print-root) { display: none !important; }
                  #bulk-print-root { display: block !important; position: absolute; inset: 0; background: white; }
                  @page { size: A4 portrait; margin: 8mm 10mm 10mm 10mm; }

                  #bulk-print-root .sheet {
                    width: 100% !important;
                    max-width: 100% !important;
                    margin: 0 !important;
                    box-shadow: none !important;
                    border: none !important;
                    padding: 0 !important;
                  }

                  #bulk-print-root .report-page {
                    break-inside: avoid-page;
                    page-break-inside: avoid;
                  }

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
                setPrintingBulk(false);
                setPrintingSingle(false);
              }}
            />
          </>,
          document.body,
        )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-slate-500">
            Oversee all reports and manage status transitions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* ✅ Print selected */}
          <button
            type="button"
            onClick={handlePrintSelected}
            disabled={!selectedIds.length || printingBulk}
            className={classNames(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm disabled:opacity-60 disabled:cursor-not-allowed",
              selectedIds.length
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-slate-200 text-slate-500",
            )}
          >
            {printingBulk ? <Spinner /> : "🖨️"}
            {printingBulk
              ? "Preparing..."
              : `Print selected (${selectedIds.length})`}
          </button>

          {/* Refresh */}
          <button
            type="button"
            disabled={refreshing}
            onClick={() => {
              if (refreshing) return;
              setRefreshing(true);
              window.location.reload();
            }}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
            aria-label="Refresh"
          >
            {refreshing ? <SpinnerDark /> : "↻"}
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Form type tabs */}
      <div className="mb-4 border-b border-slate-200">
        <nav className="-mb-px flex gap-6 text-sm">
          {(
            ["ALL", "MICRO", "MICROWATER", "STERILITY", "CHEMISTRY"] as const
          ).map((ft) => {
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
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300",
                )}
              >
                {ft === "ALL"
                  ? "All forms"
                  : ft === "MICRO"
                    ? "Micro"
                    : ft === "MICROWATER"
                      ? "Micro Water"
                      : ft === "STERILITY"
                        ? "Sterility"
                        : "Chemistry"}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Status chips */}
      <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {statusOptions.map((s) => (
            <button
              key={String(s)}
              onClick={() => setStatusFilter(s)}
              className={classNames(
                "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ring-1",
                statusFilter === s
                  ? "bg-blue-600 text-white ring-blue-600"
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100 ring-slate-200",
              )}
              aria-pressed={statusFilter === s}
            >
              {niceStatus(String(s))}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status */}
          <select
            value={String(statusFilter)}
            onChange={(e) => setStatusFilter(e.target.value as DashboardStatus)}
            className="w-92 shrink-0 rounded-lg border bg-white px-3 py-2 text-sm
              ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
          >
            {statusOptions.map((s) => (
              <option key={String(s)} value={String(s)}>
                {niceStatus(String(s))}
              </option>
            ))}
          </select>

          {/* Search client */}
          <input
            placeholder="Search by client"
            value={searchClient}
            onChange={(e) => setSearchClient(e.target.value)}
            className="flex-1 min-w-[160px] rounded-lg border px-3 py-2 text-sm
              ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
          />

          {/* Search report */}
          <input
            placeholder="Search by report #"
            value={searchReport}
            onChange={(e) => setSearchReport(e.target.value)}
            className="flex-1 min-w-[180px] rounded-lg border px-3 py-2 text-sm
              ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
          />

          {/* Custom range */}
          <div className="flex gap-5">
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              className="w-52 shrink-0 rounded-lg border bg-white px-3 py-2 text-sm
                ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All dates</option>
              <option value="TODAY">Today</option>
              <option value="YESTERDAY">Yesterday</option>
              <option value="LAST_7_DAYS">Last 7 days</option>
              <option value="LAST_30_DAYS">Last 30 days</option>
              <option value="THIS_MONTH">This month</option>
              <option value="LAST_MONTH">Last month</option>
              <option value="THIS_YEAR">This year</option>
              <option value="LAST_YEAR">Last year</option>
              <option value="CUSTOM">Custom range</option>
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setDatePreset("CUSTOM");
              }}
              disabled={datePreset !== "CUSTOM"}
              className={classNames(
                "w-40 rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500",
                datePreset !== "CUSTOM" && "opacity-60 cursor-not-allowed",
              )}
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setDatePreset("CUSTOM");
              }}
              disabled={datePreset !== "CUSTOM"}
              className={classNames(
                "w-40 rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500",
                datePreset !== "CUSTOM" && "opacity-60 cursor-not-allowed",
              )}
            />
          </div>

          {/* Clear */}
          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            className={classNames(
              "ml-auto inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition",
              hasActiveFilters
                ? "bg-rose-600 text-white hover:bg-rose-700 ring-2 ring-rose-300"
                : "border bg-slate-100 text-slate-400 cursor-not-allowed",
            )}
            title={hasActiveFilters ? "Clear filters" : "No filters applied"}
          >
            ✕ Clear
          </button>
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
                <th className="px-4 py-3 font-medium w-10">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectPage}
                  />
                </th>
                <th className="px-4 py-3 font-medium">Report #</th>
                <th className="px-4 py-3 font-medium">Form #</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Created At</th>
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
                      <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-5 w-56 animate-pulse rounded bg-slate-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-8 w-28 animate-pulse rounded bg-slate-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-8 w-40 animate-pulse rounded bg-slate-200" />
                    </td>
                  </tr>
                ))}

              {!loading &&
                pageRows.map((r) => {
                  const isMicro =
                    r.formType === "MICRO_MIX" ||
                    r.formType === "MICRO_MIX_WATER";
                  const isChemistry = r.formType === "CHEMISTRY_MIX";
                  const rowBusy = updatingId === r.id;

                  return (
                    <tr key={r.id} className="border-t hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isRowSelected(r.id)}
                          onChange={() => toggleRow(r.id)}
                          disabled={rowBusy}
                        />
                      </td>

                      <td className="px-4 py-3 font-medium">
                        {displayReportNo(r)}
                      </td>
                      <td className="px-4 py-3">{r.formNumber}</td>
                      <td className="px-4 py-3">{r.client}</td>
                      <td className="px-4 py-3">{formatDate(r.createdAt)}</td>

                      <td className="px-4 py-3">
                        <span
                          className={classNames(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                            badgeClasses(r),
                          )}
                        >
                          {niceStatus(String(r.status))}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                            onClick={() => {
                              logUiEvent({
                                action: "UI_VIEW",
                                entity:
                                  r.formType === "CHEMISTRY_MIX"
                                    ? "ChemistryReport"
                                    : "Micro Report",
                                entityId: r.id,
                                details: `Viewed ${r.formNumber}`,
                                meta: {
                                  formNumber: r.formNumber,
                                  formType: r.formType,
                                  status: r.status,
                                },
                              });
                              setSelectedReport(r);
                            }}
                            disabled={rowBusy}
                          >
                            View
                          </button>

                          {isMicro && canUpdateThisMicro(r, user) && (
                            <button
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                              disabled={rowBusy}
                              onClick={async () => {
                                if (rowBusy) return;
                                setUpdatingId(r.id);
                                try {
                                  if (
                                    r.status === "CLIENT_NEEDS_FINAL_CORRECTION"
                                  ) {
                                    const next =
                                      "UNDER_FINAL_RESUBMISSION_TESTING_REVIEW";
                                    await setStatus(r, next, "set by admin");
                                    setReports((prev) =>
                                      prev.map((x) =>
                                        x.id === r.id
                                          ? { ...x, status: next }
                                          : x,
                                      ),
                                    );
                                    toast.success("Report Status Updated");
                                  }
                                  goToReportEditor(r);
                                } catch (e: any) {
                                  toast.error(
                                    e?.message || "Failed to update status",
                                  );
                                } finally {
                                  setUpdatingId(null);
                                }
                              }}
                            >
                              {rowBusy ? <Spinner /> : null}
                              {rowBusy ? "Updating..." : "Update"}
                            </button>
                          )}

                          {isChemistry && canUpdateThisChem(r, user) && (
                            <button
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                              disabled={rowBusy}
                              onClick={async () => {
                                if (rowBusy) return;
                                setUpdatingId(r.id);
                                try {
                                  if (r.status === "CLIENT_NEEDS_CORRECTION") {
                                    const next =
                                      "UNDER_RESUBMISSION_TESTING_REVIEW";
                                    await setStatus(r, next, "set by admin");
                                    setReports((prev) =>
                                      prev.map((x) =>
                                        x.id === r.id
                                          ? { ...x, status: next }
                                          : x,
                                      ),
                                    );
                                    toast.success("Report Status Updated");
                                  }
                                  goToReportEditor(r);
                                } catch (e: any) {
                                  toast.error(
                                    e?.message || "Failed to update status",
                                  );
                                } finally {
                                  setUpdatingId(null);
                                }
                              }}
                            >
                              {rowBusy ? <Spinner /> : null}
                              {rowBusy ? "Updating..." : "Update"}
                            </button>
                          )}

                          <button
                            className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-purple-700"
                            onClick={() => {
                              setChangeStatusReport(r);
                              const options =
                                r.formType === "CHEMISTRY_MIX"
                                  ? ADMIN_CHEM_STATUSES
                                  : ADMIN_MICRO_STATUSES;

                              const current = String(r.status);
                              setNewStatus(
                                options.map(String).includes(current)
                                  ? current
                                  : String(options[0] ?? "DRAFT"),
                              );
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
                  );
                })}

              {!loading && pageRows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
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
              Showing <span className="font-medium">{start + 1}</span>–{" "}
              <span className="font-medium">{Math.min(end, total)}</span> of{" "}
              <span className="font-medium">{total}</span>
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
          <div className="h-[90vh] max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl flex flex-col">
            <div className="sticky top-0 z-10 relative flex items-center justify-between border-b bg-white px-6 py-4">
              <h2 className="text-lg font-semibold">
                Report #{displayReportNo(selectedReport)}
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
                {/* ✅ Print single */}
                <button
                  disabled={printingSingle}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  onClick={() => {
                    if (printingSingle) return;

                    logUiEvent({
                      action: "UI_PRINT_SINGLE",
                      entity:
                        selectedReport.formType === "CHEMISTRY_MIX"
                          ? "ChemistryReport"
                          : "MicroReport",
                      entityId: selectedReport.id,
                      details: `Printed ${selectedReport.formNumber ?? selectedReport.id}`,
                      meta: {
                        formNumber: selectedReport.formNumber,
                        formType: selectedReport.formType,
                        status: selectedReport.status,
                      },
                    });

                    setPrintingSingle(true);
                    setSinglePrintReport(selectedReport);
                  }}
                >
                  {printingSingle ? <SpinnerDark /> : "🖨️"}
                  {printingSingle ? "Preparing..." : "Print"}
                </button>

                {/* ✅ show Update in modal for micro or chem */}
                {(selectedReport.formType === "CHEMISTRY_MIX"
                  ? canUpdateThisChem(selectedReport, user)
                  : canUpdateThisMicro(selectedReport, user)) && (
                  <button
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                    onClick={async () => {
                      try {
                        const r = selectedReport;

                        // keep your existing micro transition
                        if (
                          r.formType !== "CHEMISTRY_MIX" &&
                          r.status === "PRELIMINARY_TESTING_NEEDS_CORRECTION"
                        ) {
                          const next = "UNDER_CLIENT_PRELIMINARY_CORRECTION";
                          await setStatus(
                            r,
                            next,
                            "Sent back to client for correction",
                          );
                          setReports((prev) =>
                            prev.map((x) =>
                              x.id === r.id ? { ...x, status: next } : x,
                            ),
                          );
                        }

                        setSelectedReport(null);
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

            <div className="modal-body flex-1 min-h-0 overflow-y-auto px-6 py-4 max-h-[calc(90vh-72px)]">
              {selectedReport?.formType === "MICRO_MIX" ? (
                <MicroMixReportFormView
                  report={selectedReport as any}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane={modalPane}
                  onPaneChange={setModalPane}
                />
              ) : selectedReport?.formType === "MICRO_MIX_WATER" ? (
                <MicroMixWaterReportFormView
                  report={selectedReport as any}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane={modalPane}
                  onPaneChange={setModalPane}
                />
              ) : selectedReport?.formType === "STERILITY" ? (
                <SterilityReportFormView
                  report={selectedReport as any}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane={modalPane}
                  onPaneChange={setModalPane}
                />
              ) : selectedReport?.formType === "CHEMISTRY_MIX" ? (
                <ChemistryMixReportFormView
                  report={selectedReport as any}
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

      {/* Change Status Dialog */}
      {changeStatusReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Change status"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-2">
              Change Status of {changeStatusReport.formType}
            </h2>
            <p className="mb-3 text-sm text-slate-600">
              <strong>Current:</strong>{" "}
              {niceStatus(String(changeStatusReport.status))}
            </p>

            <form
              autoComplete="off"
              name="status-change-form"
              action="about:blank"
              onSubmit={(e) => {
                e.preventDefault();
                handleChangeStatus(changeStatusReport, newStatus);
              }}
            >
              <select
                value={newStatus}
                onChange={(e) => {
                  setNewStatus(e.target.value);
                  setESignError("");
                }}
                className="mb-3 w-full rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
              >
                {(changeStatusReport.formType === "CHEMISTRY_MIX"
                  ? ADMIN_CHEM_STATUSES
                  : ADMIN_MICRO_STATUSES
                )
                  .filter((s) => s !== "ALL")
                  .map((s) => (
                    <option key={String(s)} value={String(s)}>
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
                    <span>E-signature password</span>
                  </div>

                  {/* Decoys to reduce aggressive autofill */}
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      opacity: 0,
                      height: 0,
                      width: 0,
                    }}
                  />
                  <input
                    type="password"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      opacity: 0,
                      height: 0,
                      width: 0,
                    }}
                  />

                  <div className="mb-2 flex items-stretch gap-2">
                    <input
                      type="password"
                      placeholder="Enter e-signature password"
                      value={eSignPassword}
                      onChange={(e) => {
                        setESignPassword(e.target.value);
                        setESignError("");
                      }}
                      className="w-full rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
                      aria-invalid={!!eSignError}
                      autoComplete="off"
                      name="esign_pwd_manual_only"
                      inputMode="text"
                      spellCheck={false}
                      autoCapitalize="off"
                      autoCorrect="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      data-bwignore="true"
                      data-form-type="other"
                    />
                  </div>

                  {eSignError && (
                    <p className="mb-2 text-xs text-rose-600">{eSignError}</p>
                  )}
                </div>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50"
                  onClick={() => setChangeStatusReport(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50 inline-flex items-center gap-2"
                  disabled={
                    saving ||
                    !reason.trim() ||
                    (needsESign(newStatus) && !eSignPassword)
                  }
                >
                  {saving ? <Spinner /> : null}
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
