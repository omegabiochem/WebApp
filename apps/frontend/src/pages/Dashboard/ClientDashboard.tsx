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
  CHEMISTRY_STATUS_COLORS,
  type ChemistryReportStatus,
} from "../../utils/chemistryReportFormWorkflow";
import {
  matchesDateRange,
  toDateOnlyISO_UTC,
  type DatePreset,
} from "../../utils/dashboardsSharedTypes";
import { useLiveReportStatus } from "../../hooks/useLiveReportStatus";
import { logUiEvent } from "../../lib/uiAudit";

import SterilityReportFormView from "../Reports/SterilityReportFormView";
import { COLS, MAX_COLS, type ColKey } from "../../utils/clientDashboardutils";

// -----------------------------
// Types
// -----------------------------

type Report = {
  id: string;
  client: string;
  formType: string;
  dateSent: string | null;
  status: ReportStatus | ChemistryReportStatus | string; // Some backends may still send raw string
  formNumber: string;
  version: number;

  // ✅ optional extra columns (if backend returns them)
  typeOfTest?: string | null;
  sampleType?: string | null;
  formulaNo?: string | null;
  description?: string | null;
  lotNo?: string | null;
  manufactureDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
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

// -----------------------------
// Utilities
// -----------------------------

const formTypeToSlug: Record<string, string> = {
  MICRO_MIX: "micro-mix",
  MICRO_MIX_WATER: "micro-mix-water",
  STERILITY: "sterility",
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

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  }).format(d);
}

function canUpdateThisReport(r: Report, user?: any) {
  const isMicro =
    r.formType === "MICRO_MIX" ||
    r.formType === "MICRO_MIX_WATER" ||
    r.formType === "STERILITY";
  if (!isMicro) return false;
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
    fieldsUsedOnForm,
  );
}

function canUpdateThisChemistryReport(r: Report, user?: any) {
  const isChemistry = r.formType === "CHEMISTRY_MIX";
  if (!isChemistry) return false;
  if (user?.role !== "CLIENT") return false;
  if (getFormPrefix(r.formNumber) !== user?.clientCode) return false;

  const chemistryFieldsUsedOnForm = [
    "client",
    "dateSent",
    "sampleDescription",
    "testTypes",
    "sampleCollected",
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
    chemistryFieldsUsedOnForm,
  );
}

const paneFor = (status: string): "FORM" | "ATTACHMENTS" =>
  status === "UNDER_CLIENT_FINAL_REVIEW" ||
  status === "FINAL_APPROVED" ||
  status === "UNDER_CLIENT_REVIEW"
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
        } else if (r.formType === "STERILITY") {
          return (
            <div key={r.id} className="report-page">
              <SterilityReportFormView
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
    null,
  );

  const [formFilter, setFormFilter] = useState<
    "ALL" | "MICRO" | "MICROWATER" | "STERILITY" | "CHEMISTRY"
  >("ALL");

  // status filter now uses combined type
  const [statusFilter, setStatusFilter] = useState<DashboardStatus>("ALL");

  const statusOptions =
    formFilter === "CHEMISTRY" ? CLIENT_CHEM_STATUSES : CLIENT_MICRO_STATUSES;

  // // status filter now uses combined type
  // const [statusFilter, setStatusFilter] = useState<DashboardStatus>("ALL");

  // per-row update loading (table buttons)
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // modal update loading
  const [modalUpdating, setModalUpdating] = useState(false);

  // print loading (bulk + single)
  const [printingBulk, setPrintingBulk] = useState(false);
  const [printingSingle, setPrintingSingle] = useState(false);

  // optional: refresh loading
  const [refreshing, setRefreshing] = useState(false);

  const [datePreset, setDatePreset] = useState<DatePreset>("ALL");
  const [fromDate, setFromDate] = useState<string>(""); // yyyy-mm-dd
  const [toDate, setToDate] = useState<string>(""); // yyyy-mm-dd

  const navigate = useNavigate();
  const { user, token } = useAuth();

  const userKey =
    (user as any)?.id ||
    (user as any)?.userId ||
    (user as any)?.sub ||
    (user as any)?.uid;

  const COL_STORAGE_KEY = userKey
    ? `clientDashboardCols:user:${userKey}`
    : null;
  const [colOpen, setColOpen] = useState(false);

  const DEFAULT_COLS: ColKey[] = [
    "formNumber",
    "client",
    "formType",
    "dateSent",
  ];

  const [selectedCols, setSelectedCols] = useState<ColKey[]>(DEFAULT_COLS);
  const [colsHydrated, setColsHydrated] = useState(false);

  useEffect(() => {
    // ✅ IMPORTANT: don't get stuck if key isn't ready yet
    if (!COL_STORAGE_KEY) {
      setColsHydrated(true);
      return;
    }

    try {
      const raw = localStorage.getItem(COL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ColKey[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSelectedCols(parsed.slice(0, MAX_COLS));
        }
      }
    } catch {
      // ignore
    } finally {
      setColsHydrated(true);
    }
  }, [COL_STORAGE_KEY]);

  useEffect(() => {
    if (!COL_STORAGE_KEY) return;
    if (!colsHydrated) return; // ✅ don't overwrite before loading
    localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(selectedCols));
  }, [COL_STORAGE_KEY, colsHydrated, selectedCols]);

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
          (r) => getFormPrefix(r.formNumber) === user?.clientCode,
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
        : reports.filter((r) => {
            if (formFilter === "MICRO") return r.formType === "MICRO_MIX";
            if (formFilter === "MICROWATER")
              return r.formType === "MICRO_MIX_WATER";
            if (formFilter === "STERILITY") return r.formType === "STERILITY";
            if (formFilter === "CHEMISTRY")
              return r.formType === "CHEMISTRY_MIX";
            return true;
          });

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

    // 3.5) date range filter (by dateSent)
    const byDate = bySearch.filter((r) =>
      matchesDateRange(r.dateSent, fromDate || undefined, toDate || undefined),
    );

    // 4) sort (same as you already have)
    const sorted = [...byDate].sort((a, b) => {
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
  }, [
    reports,
    formFilter,
    statusFilter,
    search,
    sortBy,
    sortDir,
    fromDate,
    toDate,
  ]);

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

  useEffect(() => {
    if (!colOpen) return;

    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      // close if click is outside the dropdown container
      if (!t.closest("[data-col-dropdown]")) setColOpen(false);
    };

    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [colOpen]);

  async function setStatus(
    r: Report,
    newStatus: string,
    reason = "Client correction update",
  ) {
    const isChemistry = r.formType === "CHEMISTRY_MIX";

    const url = isChemistry
      ? `/chemistry-reports/${r.id}/status`
      : `/reports/${r.id}/status`;

    const body = isChemistry
      ? { reason, status: newStatus, expectedVersion: r.version }
      : { reason, status: newStatus, expectedVersion: r.version };

    // const slug = formTypeToSlug[r.formType] || "micro-mix";
    await api(url, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    // Update local state immediately so the UI stays in sync
    setReports((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, status: newStatus } : x)),
    );
    // return res;
  }

  function goToReportEditor(r: Report) {
    const slug = formTypeToSlug[r.formType] || "micro-mix"; // default for legacy
    if (r.formType === "CHEMISTRY_MIX") {
      navigate(`/chemistry-reports/${slug}/${r.id}`);
    } else {
      navigate(`/reports/${slug}/${r.id}`);
    }
  }

  // selection
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

  const handlePrintSelected = () => {
    if (printingBulk) return; // 🚫 prevent double
    if (!selectedIds.length) return;

    // ✅ AUDIT: bulk print
    logUiEvent({
      action: "UI_PRINT_SELECTED",
      entity: "Report",
      details: `Printed selected reports (${selectedIds.length})`,
      entityId: selectedIds.join(","),
      meta: {
        reportIds: selectedIds,
        count: selectedIds.length,
      },
    });

    setPrintingBulk(true);
    setIsBulkPrinting(true);
  };
  const selectedReportObjects = selectedIds
    .map((id) => reports.find((r) => r.id === id))
    .filter(Boolean) as Report[];

  useEffect(() => {
    const now = new Date();

    const setRange = (from: Date, to: Date) => {
      setFromDate(toDateOnlyISO_UTC(from));
      setToDate(toDateOnlyISO_UTC(to));
    };

    if (datePreset === "ALL") {
      setFromDate("");
      setToDate("");
      return;
    }

    if (datePreset === "CUSTOM") return;

    if (datePreset === "TODAY") {
      setRange(now, now);
      return;
    }

    if (datePreset === "YESTERDAY") {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      setRange(y, y);
      return;
    }

    if (datePreset === "LAST_7_DAYS") {
      const from = new Date(now);
      from.setDate(now.getDate() - 7);
      setRange(from, now);
      return;
    }

    if (datePreset === "LAST_30_DAYS") {
      const from = new Date(now);
      from.setDate(now.getDate() - 30);
      setRange(from, now);
      return;
    }

    if (datePreset === "THIS_MONTH") {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setRange(from, to);
      return;
    }

    if (datePreset === "LAST_MONTH") {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      setRange(from, to);
      return;
    }

    if (datePreset === "THIS_YEAR") {
      const from = new Date(now.getFullYear(), 0, 1);
      const to = new Date(now.getFullYear(), 11, 31);
      setRange(from, to);
      return;
    }

    if (datePreset === "LAST_YEAR") {
      const from = new Date(now.getFullYear() - 1, 0, 1);
      const to = new Date(now.getFullYear() - 1, 11, 31);
      setRange(from, to);
      return;
    }
  }, [datePreset]);

  const hasActiveFilters = useMemo(() => {
    return (
      formFilter !== "ALL" ||
      statusFilter !== "ALL" ||
      search.trim() !== "" ||
      sortBy !== "dateSent" ||
      sortDir !== "desc" ||
      perPage !== 10 ||
      datePreset !== "ALL" ||
      fromDate !== "" ||
      toDate !== ""
    );
  }, [
    formFilter,
    statusFilter,
    search,
    sortBy,
    sortDir,
    perPage,
    datePreset,
    fromDate,
    toDate,
  ]);

  const clearAllFilters = () => {
    setFormFilter("ALL");
    setStatusFilter("ALL");
    setSearch("");
    setSortBy("dateSent");
    setSortDir("desc");
    setPerPage(10);
    setDatePreset("ALL");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  useEffect(() => {
    setStatusFilter("ALL");
  }, [formFilter]);

  useLiveReportStatus(setReports, {
    acceptCreated: (r: Report) => {
      // ✅ only show reports that belong to THIS logged-in client
      return getFormPrefix(r.formNumber) === user?.clientCode;
    },
  });

  function niceFormType(ft?: string) {
    switch (ft) {
      case "MICRO_MIX":
        return "MICRO";
      case "MICRO_MIX_WATER":
        return "MICRO_WATER";
      case "CHEMISTRY_MIX":
        return "CHEMISTRY";
      default:
        return ft || "-";
    }
  }

  function getCellValue(r: Report, key: ColKey) {
    switch (key) {
      case "formNumber":
        return r.formNumber || "-";
      case "client":
        return r.client || "-";
      case "formType":
        return niceFormType(r.formType);
      case "dateSent":
        return formatDate(r.dateSent);

      case "manufactureDate":
        return formatDate(r.manufactureDate ?? null);

      case "createdAt":
        return formatDate(r.createdAt ?? null);

      case "updatedAt":
        return formatDate(r.updatedAt ?? null);

      default: {
        const v = (r as any)[key];
        return v == null || v === "" ? "-" : String(v);
      }
    }
  }

  const toggleCol = (key: ColKey) => {
    setSelectedCols((prev) => {
      const exists = prev.includes(key);

      // remove
      if (exists) return prev.filter((k) => k !== key);

      // add (respect max 6)
      if (prev.length >= MAX_COLS) {
        toast.error(`You can select max ${MAX_COLS} columns`);
        return prev;
      }

      return [...prev, key];
    });
  };

  if (token && !user) {
    return <div className="p-6 text-slate-500">Loading dashboard…</div>;
  }

  if (!colsHydrated) {
    return <div className="p-6 text-slate-500">Loading dashboard…</div>;
  }

  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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
                setPrintingBulk(false);
                setPrintingSingle(false);
              }}
            />
          </>,
          document.body,
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

          <button
            type="button"
            onClick={() => {
              if (refreshing) return;
              setRefreshing(true);
              window.location.reload();
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 disabled:opacity-60"
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
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100 ring-slate-200",
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

        {/* Date + Clear row */}
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="flex items-center gap-2">
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
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
          </div>

          {/* Custom from/to only when CUSTOM */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setDatePreset("CUSTOM");
              }}
              disabled={datePreset !== "CUSTOM"}
              className={classNames(
                "w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500",
                datePreset !== "CUSTOM" && "opacity-60 cursor-not-allowed",
              )}
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setDatePreset("CUSTOM");
              }}
              disabled={datePreset !== "CUSTOM"}
              className={classNames(
                "w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500",
                datePreset !== "CUSTOM" && "opacity-60 cursor-not-allowed",
              )}
            />
          </div>

          <div className="flex items-center gap-2 md:justify-end">
            <button
              type="button"
              onClick={clearAllFilters}
              disabled={!hasActiveFilters}
              className={classNames(
                "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition",
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
                {selectedCols.map((k) => (
                  <th key={k} className="px-4 py-3 font-medium">
                    {COLS.find((c) => c.key === k)?.label ?? k}
                  </th>
                ))}
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">
                  <div className="flex items-center justify-between gap-2">
                    <span>Actions</span>

                    <div className="relative" data-col-dropdown>
                      <button
                        type="button"
                        onClick={() => setColOpen((v) => !v)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-slate-600 hover:bg-slate-100"
                        title="Choose columns"
                        aria-label="Choose columns"
                      >
                        ▾
                      </button>

                      {colOpen && (
                        <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border bg-white p-3 shadow-lg">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="text-xs font-semibold text-slate-600">
                              Columns ({selectedCols.length}/{MAX_COLS})
                            </div>
                            <button
                              type="button"
                              className="text-xs text-slate-500 hover:text-slate-800"
                              onClick={() => setColOpen(false)}
                              aria-label="Close"
                              title="Close"
                            >
                              ✕
                            </button>
                          </div>

                          <div className="mb-2 text-xs text-slate-500">
                            Select up to {MAX_COLS}
                          </div>

                          <div className="grid max-h-72 grid-cols-1 gap-2 overflow-auto pr-1">
                            {COLS.map((c) => {
                              const checked = selectedCols.includes(c.key);
                              const disabled =
                                !checked && selectedCols.length >= MAX_COLS;

                              return (
                                <label
                                  key={c.key}
                                  className={classNames(
                                    "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                                    disabled
                                      ? "cursor-not-allowed opacity-50"
                                      : "cursor-pointer hover:bg-slate-50",
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={disabled}
                                    onChange={() => toggleCol(c.key)}
                                  />
                                  <span>{c.label}</span>
                                </label>
                              );
                            })}
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              className="text-xs font-medium text-slate-600 hover:underline"
                              onClick={() => setSelectedCols(DEFAULT_COLS)}
                            >
                              Reset defaults
                            </button>

                            <button
                              type="button"
                              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                              onClick={() => setColOpen(false)}
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </th>
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
                pageRows.map((r) => {
                  const isMicro =
                    r.formType === "MICRO_MIX" ||
                    r.formType === "MICRO_MIX_WATER" ||
                    r.formType === "STERILITY";

                  const isChemistry = r.formType === "CHEMISTRY_MIX";
                  return (
                    <tr key={r.id} className="border-t hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isRowSelected(r.id)}
                          onChange={() => toggleRow(r.id)}
                        />
                      </td>
                      {selectedCols.map((k) => (
                        <td key={k} className="px-4 py-3">
                          {k === "formNumber" ? (
                            <span className="font-medium">
                              {getCellValue(r, k)}
                            </span>
                          ) : (
                            getCellValue(r, k)
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <span
                          className={classNames(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                            (isChemistry
                              ? CHEMISTRY_STATUS_COLORS[
                                  r.status as ChemistryReportStatus
                                ]
                              : STATUS_COLORS[r.status as ReportStatus]) ||
                              "bg-slate-100 text-slate-800 ring-1 ring-slate-200",
                          )}
                        >
                          {niceStatus(String(r.status))}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
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
                          >
                            View
                          </button>
                          {isMicro && canUpdateThisReport(r, user) && (
                            <button
                              disabled={updatingId === r.id}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                              onClick={async () => {
                                if (updatingId === r.id) return; // 🚫 prevent double
                                setUpdatingId(r.id);
                                try {
                                  if (
                                    r.status ===
                                    "PRELIMINARY_TESTING_NEEDS_CORRECTION"
                                  ) {
                                    await setStatus(
                                      r,
                                      "UNDER_CLIENT_PRELIMINARY_CORRECTION",
                                      "Sent back to client for correction",
                                    );
                                    toast.success("Report status updated");
                                  }
                                  // else if (
                                  //   r.status ===
                                  //   "PRELIMINARY_RESUBMISSION_BY_TESTING"
                                  // ) {
                                  //   await setStatus(
                                  //     r,
                                  //     "UNDER_CLIENT_PRELIMINARY_REVIEW",
                                  //     "Resubmission under Review",
                                  //   );
                                  // }
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
                              {updatingId === r.id ? <Spinner /> : null}
                              {updatingId === r.id ? "Updating..." : "Update"}
                            </button>
                          )}

                          {isChemistry &&
                            canUpdateThisChemistryReport(r, user) && (
                              <button
                                disabled={updatingId === r.id}
                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                onClick={async () => {
                                  if (updatingId === r.id) return; // 🚫 prevent double
                                  setUpdatingId(r.id);
                                  try {
                                    if (
                                      r.status === "TESTING_NEEDS_CORRECTION"
                                    ) {
                                      await setStatus(
                                        r,
                                        "UNDER_CLIENT_CORRECTION",
                                        "Sent back to client for correction",
                                      );
                                    } else if (
                                      r.status === "RESUBMISSION_BY_TESTING"
                                    ) {
                                      await setStatus(
                                        r,
                                        "UNDER_CLIENT_REVIEW",
                                        "Resubmission under Review",
                                      );
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
                                {updatingId === r.id ? <Spinner /> : null}
                                {updatingId === r.id ? "Updating..." : "Update"}
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

              {!loading && pageRows.length === 0 && (
                <tr>
                  <td
                    colSpan={1 + selectedCols.length + 2} // checkbox + dynamic cols + status + actions
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
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  disabled={printingSingle}
                  onClick={() => {
                    if (printingSingle) return;
                    logUiEvent({
                      action: "UI_PRINT_SINGLE",
                      entity:
                        selectedReport.formType === "CHEMISTRY_MIX"
                          ? "ChemistryReport"
                          : "MicroReport",
                      entityId: selectedReport.id,
                      details: `Printed ${selectedReport.formNumber}`,
                    });
                    setPrintingSingle(true);
                    setSinglePrintReport(selectedReport);
                  }}
                >
                  {printingSingle ? <SpinnerDark /> : "🖨️"}
                  {printingSingle ? "Preparing..." : "Print"}
                </button>

                {canUpdateThisReport(selectedReport, user) && (
                  <button
                    disabled={modalUpdating}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                    onClick={async () => {
                      if (modalUpdating) return;
                      setModalUpdating(true);
                      try {
                        const r = selectedReport!;
                        if (
                          r.status === "PRELIMINARY_TESTING_NEEDS_CORRECTION"
                        ) {
                          await setStatus(
                            r,
                            "UNDER_CLIENT_PRELIMINARY_CORRECTION",
                            "Sent back to client for correction",
                          );
                        } else if (
                          r.status === "PRELIMINARY_RESUBMISSION_BY_TESTING"
                        ) {
                          await setStatus(
                            r,
                            "UNDER_CLIENT_PRELIMINARY_REVIEW",
                            "Resubmission under Review",
                          );
                        }
                        setSelectedReport(null);
                        goToReportEditor(r);
                      } catch (e: any) {
                        toast.error(e?.message || "Failed to update status");
                      } finally {
                        setModalUpdating(false);
                      }
                    }}
                  >
                    {modalUpdating ? <Spinner /> : null}
                    {modalUpdating ? "Updating..." : "Update"}
                  </button>
                )}
                {canUpdateThisChemistryReport(selectedReport, user) && (
                  <button
                    disabled={modalUpdating}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                    onClick={async () => {
                      if (modalUpdating) return;
                      setModalUpdating(true);
                      try {
                        const r = selectedReport!;
                        if (
                          selectedReport.status === "TESTING_NEEDS_CORRECTION"
                        ) {
                          await setStatus(
                            r,
                            "UNDER_CLIENT_CORRECTION",
                            "Sent back to client for correction",
                          );
                        } else if (
                          selectedReport.status === "RESUBMISSION_BY_TESTING"
                        ) {
                          await setStatus(
                            r,
                            "UNDER_CLIENT_REVIEW",
                            "Resubmission under Review",
                          );
                        }
                        setSelectedReport(null);
                        goToReportEditor(r);
                      } catch (e: any) {
                        toast.error(e?.message || "Failed to update status");
                      } finally {
                        setModalUpdating(false);
                      }
                    }}
                  >
                    {modalUpdating ? <Spinner /> : null}
                    {modalUpdating ? "Updating..." : "Update"}
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
            <div className="modal-body flex-1 min-h-0 overflow-auto px-6 py-4 max-h-[calc(90vh-72px)]">
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
              ) : selectedReport?.formType === "STERILITY" ? (
                <SterilityReportFormView
                  report={selectedReport}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane={paneFor(String(selectedReport.status))}
                />
              ) : selectedReport?.formType === "CHEMISTRY_MIX" ? (
                <ChemistryMixReportFormView
                  report={selectedReport}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane={paneFor(String(selectedReport.status))}
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
