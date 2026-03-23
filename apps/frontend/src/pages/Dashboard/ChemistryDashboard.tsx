import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";

import { createPortal } from "react-dom";
import ChemistryMixReportFormView from "../Reports/ChemistryMixReportFormView";
import {
  STATUS_TRANSITIONS as CHEM_STATUS_TRANSITIONS,
  canShowChemistryUpdateButton,
  CHEMISTRY_STATUS_COLORS,
  type ChemistryReportStatus,
} from "../../utils/chemistryReportFormWorkflow";
import toast from "react-hot-toast";
import {
  formatDate,
  matchesDateRange,
  toDateOnlyISO_UTC,
  type DatePreset,
} from "../../utils/dashboardsSharedTypes";
import { useLiveReportStatus } from "../../hooks/useLiveReportStatus";
import { logUiEvent } from "../../lib/uiAudit";
import COAReportFormView from "../Reports/COAReportFormView";
import { parseIntSafe } from "../../utils/commonDashboardUtil";
import ReportWorkspaceModal from "../../utils/ReportWorkspaceModal";
import { getReportSearchBlob } from "../../utils/clientDashboardutils";
import { COLS, type ChemistryColKey } from "../../utils/globalUtils";
import { Pin } from "lucide-react";

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
  version: number;
  selectedActives?: string[];
  selectedActivesText?: string;
  createdAt: string;

  // extra searchable chemistry / coa fields
  updatedAt?: string | null;
  sampleDescription?: string | null;
  lotBatchNo?: string | null;
  formulaId?: string | null;
  sampleSize?: string | null;
  numberOfActives?: string | null;
  comments?: string | null;
  manufactureDate?: string | null;
  dateReceived?: string | null;
  testedBy?: string | null;
  reviewedBy?: string | null;
  coaRows?: unknown;
  actives?: unknown;
  sampleTypes?: unknown;
  testTypes?: unknown;
  sampleCollected?: unknown;

  _searchBlob?: string;
};
// -----------------------------
// Statuses
// -----------------------------
const CHEMISTRY_STATUSES = [
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
  "VOID",
] as const;

// -----------------------------
// Utilities
// -----------------------------
const formTypeToSlug: Record<string, string> = {
  CHEMISTRY_MIX: "chemistry-mix",
  COA: "coa",
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function niceStatus(s: string) {
  return s.replace(/_/g, " ");
}

function displayReportNo(r: Report) {
  return r.reportNumber || "-";
}

// -----------------------------
// API helper
// -----------------------------
// async function setStatus(
//   r: Report,
//   newStatus: string,
//   reason = "Common Status Change",
// ) {
//   await api(`/chemistry-reports/${r.id}/status`, {
//     method: "PATCH",
//     body: JSON.stringify({
//       reason,
//       status: newStatus,
//       expectedVersion: r.version,
//     }),
//   });
// }

async function setStatus(args: {
  report: Report;
  newStatus: string;
  reason?: string;
}) {
  const { report, newStatus, reason } = args;

  await api(`/chemistry-reports/${report.id}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      status: newStatus,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
      expectedVersion: report.version,
    }),
  });
}

// -----------------------------
// Spinners
// -----------------------------
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
        }
        if (r.formType === "COA") {
          return (
            <div key={r.id} className="report-page">
              <COAReportFormView
                report={r}
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

function getNextStatusesForReport(r: Report): string[] {
  const s = String(r.status);
  const t = CHEM_STATUS_TRANSITIONS?.[s as ChemistryReportStatus];
  return (t?.next ?? []) as string[];
}

function intersectAll(lists: string[][]): string[] {
  if (!lists.length) return [];
  const set = new Set(lists[0]);
  for (let i = 1; i < lists.length; i++) {
    const s = new Set(lists[i]);
    for (const v of Array.from(set)) {
      if (!s.has(v)) set.delete(v);
    }
  }
  return Array.from(set);
}

const DEFAULT_CHEM_FILTERS = {
  formFilter: "ALL" as "ALL" | "CHEMISTRY" | "COA",
  statusFilter: "ALL" as (typeof CHEMISTRY_STATUSES)[number],
  searchClient: "",
  searchReport: "",
  searchText: "",
  numberRangeType: "FORM" as "FORM" | "REPORT",
  formNoFrom: "",
  formNoTo: "",
  reportNoFrom: "",
  reportNoTo: "",
  sortBy: "createdAt" as "createdAt" | "reportNumber",
  sortDir: "desc" as "asc" | "desc",
  perPage: 10,
  page: 1,
  activeFilter: "ALL",
  datePreset: "ALL" as DatePreset,
  fromDate: "",
  toDate: "",
};

function extractYearAndSequence(value?: string | number | null): {
  year: number | null;
  sequence: number | null;
} {
  if (value == null) return { year: null, sequence: null };

  const text = String(value).trim();
  const match = text.match(/(\d{5,})$/);
  if (!match) return { year: null, sequence: null };

  const digits = match[1];
  if (digits.length < 5) return { year: null, sequence: null };

  const yearPart = digits.slice(0, 4);
  const seqPart = digits.slice(4);

  const year = Number(yearPart);
  const sequence = Number(seqPart);

  return {
    year: Number.isFinite(year) ? year : null,
    sequence: Number.isFinite(sequence) ? sequence : null,
  };
}

function inRange(
  value: number | null,
  fromRaw?: string,
  toRaw?: string,
): boolean {
  if (value == null) return false;

  const from =
    fromRaw && fromRaw.trim() !== "" ? Number(fromRaw.trim()) : undefined;
  const to = toRaw && toRaw.trim() !== "" ? Number(toRaw.trim()) : undefined;

  if (from != null && Number.isFinite(from) && value < from) return false;
  if (to != null && Number.isFinite(to) && value > to) return false;

  return true;
}

function getInitialChemistryFilters(
  searchParams: URLSearchParams,
  storageKey: string,
) {
  try {
    const spForm = searchParams.get("form");
    const spStatus = searchParams.get("status");
    const spClient = searchParams.get("client");
    const spReport = searchParams.get("report");
    const spQ = searchParams.get("q");

    const spRangeType = searchParams.get("rangeType");
    const spFormFrom = searchParams.get("formFrom");
    const spFormTo = searchParams.get("formTo");
    const spReportFrom = searchParams.get("reportFrom");
    const spReportTo = searchParams.get("reportTo");

    const spSortBy = searchParams.get("sortBy");
    const spSortDir = searchParams.get("sortDir");
    const spPp = searchParams.get("pp");
    const spP = searchParams.get("p");

    const spActive = searchParams.get("active");

    const spDp = searchParams.get("dp");
    const spFrom = searchParams.get("from");
    const spTo = searchParams.get("to");

    const hasUrlFilters =
      spForm ||
      spStatus ||
      spClient ||
      spReport ||
      spQ ||
      spRangeType ||
      spFormFrom ||
      spFormTo ||
      spReportFrom ||
      spReportTo ||
      spSortBy ||
      spSortDir ||
      spPp ||
      spP ||
      spActive ||
      spDp ||
      spFrom ||
      spTo;

    if (hasUrlFilters) {
      return {
        formFilter:
          (spForm as "ALL" | "CHEMISTRY" | "COA") ||
          DEFAULT_CHEM_FILTERS.formFilter,
        statusFilter:
          (spStatus as (typeof CHEMISTRY_STATUSES)[number]) ||
          DEFAULT_CHEM_FILTERS.statusFilter,
        searchClient: spClient || DEFAULT_CHEM_FILTERS.searchClient,
        searchReport: spReport || DEFAULT_CHEM_FILTERS.searchReport,
        searchText: spQ || DEFAULT_CHEM_FILTERS.searchText,
        numberRangeType:
          (spRangeType as "FORM" | "REPORT") ||
          DEFAULT_CHEM_FILTERS.numberRangeType,
        formNoFrom: spFormFrom || DEFAULT_CHEM_FILTERS.formNoFrom,
        formNoTo: spFormTo || DEFAULT_CHEM_FILTERS.formNoTo,
        reportNoFrom: spReportFrom || DEFAULT_CHEM_FILTERS.reportNoFrom,
        reportNoTo: spReportTo || DEFAULT_CHEM_FILTERS.reportNoTo,
        sortBy:
          (spSortBy as "createdAt" | "reportNumber") ||
          DEFAULT_CHEM_FILTERS.sortBy,
        sortDir: (spSortDir as "asc" | "desc") || DEFAULT_CHEM_FILTERS.sortDir,
        perPage: parseIntSafe(spPp, DEFAULT_CHEM_FILTERS.perPage),
        page: parseIntSafe(spP, DEFAULT_CHEM_FILTERS.page),
        activeFilter: spActive || DEFAULT_CHEM_FILTERS.activeFilter,
        datePreset: (spDp as DatePreset) || DEFAULT_CHEM_FILTERS.datePreset,
        fromDate: spFrom || DEFAULT_CHEM_FILTERS.fromDate,
        toDate: spTo || DEFAULT_CHEM_FILTERS.toDate,
      };
    }

    const raw = localStorage.getItem(storageKey);
    if (raw) {
      return {
        ...DEFAULT_CHEM_FILTERS,
        ...JSON.parse(raw),
      };
    }
  } catch {
    // ignore
  }

  return DEFAULT_CHEM_FILTERS;
}

// -----------------------------
// Component
// -----------------------------
export default function ChemistryDashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();

  type FormFilter = "ALL" | "CHEMISTRY" | "COA";

  const { user } = useAuth();

  const userKey =
    (user as any)?.id ||
    (user as any)?.userId ||
    (user as any)?.sub ||
    (user as any)?.uid ||
    "chemistry";

  const FILTER_STORAGE_KEY = `chemistryDashboardFilters:user:${userKey}`;

  const initialFilters = getInitialChemistryFilters(
    searchParams,
    FILTER_STORAGE_KEY,
  );

  const [formFilter, setFormFilter] = useState<FormFilter>(
    initialFilters.formFilter,
  );

  const [statusFilter, setStatusFilter] = useState<
    (typeof CHEMISTRY_STATUSES)[number]
  >(initialFilters.statusFilter);

  const [searchClient, setSearchClient] = useState(initialFilters.searchClient);
  const [searchReport, setSearchReport] = useState(initialFilters.searchReport);
  const [searchText, setSearchText] = useState(initialFilters.searchText);

  const [numberRangeType, setNumberRangeType] = useState<"FORM" | "REPORT">(
    initialFilters.numberRangeType,
  );

  const [formNoFrom, setFormNoFrom] = useState(initialFilters.formNoFrom);
  const [formNoTo, setFormNoTo] = useState(initialFilters.formNoTo);
  const [reportNoFrom, setReportNoFrom] = useState(initialFilters.reportNoFrom);
  const [reportNoTo, setReportNoTo] = useState(initialFilters.reportNoTo);

  const [sortBy, setSortBy] = useState<"createdAt" | "reportNumber">(
    initialFilters.sortBy,
  );

  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    initialFilters.sortDir,
  );

  const [perPage, setPerPage] = useState(initialFilters.perPage);
  const [page, setPage] = useState(initialFilters.page);

  const [activeFilter, setActiveFilter] = useState(initialFilters.activeFilter);

  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  // selection & printing
  const [selectedIds, setSelectedIds] = useState<string[]>(
    (searchParams.get("sel") || "").split(",").filter(Boolean),
  );

  const PIN_STORAGE_KEY = userKey
    ? `clientDashboardPinned:user:${userKey}`
    : null;

  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pinsHydrated, setPinsHydrated] = useState(false);

  const [isBulkPrinting, setIsBulkPrinting] = useState(false);
  const [singlePrintReport, setSinglePrintReport] = useState<Report | null>(
    null,
  );

  // ✅ Loading guards
  const [printingBulk, setPrintingBulk] = useState(false);
  const [printingSingle, setPrintingSingle] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ✅ Per-row update guard
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // ✅ Modal update guard
  const [modalUpdating, setModalUpdating] = useState(false);

  const [datePreset, setDatePreset] = useState<DatePreset>(
    (searchParams.get("dp") as any) || "ALL",
  );

  const [fromDate, setFromDate] = useState(searchParams.get("from") || "");
  const [toDate, setToDate] = useState(searchParams.get("to") || "");

  const navigate = useNavigate();

  const colBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const [colPos, setColPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  const colUserKey =
    (user as any)?.id ||
    (user as any)?.userId ||
    (user as any)?.sub ||
    (user as any)?.uid ||
    "chemistry";

  const COL_STORAGE_KEY = `chemistryDashboardCols:user:${colUserKey}`;

  const [colOpen, setColOpen] = useState(false);

  const DEFAULT_COLS: ChemistryColKey[] = [
    "reportNumber",
    "formNumber",
    "actives",
    "dateSent",
  ];

  const [selectedCols, setSelectedCols] =
    useState<ChemistryColKey[]>(DEFAULT_COLS);
  const [colsHydrated, setColsHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChemistryColKey[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSelectedCols(parsed);
        }
      }
    } catch {
      // ignore
    } finally {
      setColsHydrated(true);
    }
  }, [COL_STORAGE_KEY]);

  useEffect(() => {
    if (!colsHydrated) return;
    try {
      localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(selectedCols));
    } catch {
      // ignore
    }
  }, [COL_STORAGE_KEY, colsHydrated, selectedCols]);

  useEffect(() => {
    if (!PIN_STORAGE_KEY) {
      setPinsHydrated(true);
      return;
    }

    try {
      const raw = localStorage.getItem(PIN_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) {
          setPinnedIds(parsed);
        }
      }
    } catch {
      // ignore
    } finally {
      setPinsHydrated(true);
    }
  }, [PIN_STORAGE_KEY]);

  useEffect(() => {
    if (!PIN_STORAGE_KEY) return;
    if (!pinsHydrated) return;
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pinnedIds));
  }, [PIN_STORAGE_KEY, pinsHydrated, pinnedIds]);

  const isPinned = (id: string) => pinnedIds.includes(id);

  const togglePin = (id: string) => {
    setPinnedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  useEffect(() => {
    if (!colOpen) return;

    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-col-dropdown]")) setColOpen(false);
    };

    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [colOpen]);

  function niceFormType(ft?: string) {
    switch (ft) {
      case "CHEMISTRY_MIX":
        return "CHEMISTRY";
      case "COA":
        return "COA";
      default:
        return ft || "-";
    }
  }

  function getCellValue(r: Report, key: ChemistryColKey) {
    switch (key) {
      case "reportNumber":
        return displayReportNo(r);

      case "formNumber":
        return r.formNumber || "-";

      case "client":
        return r.client || "-";

      case "formType":
        return niceFormType(r.formType);

      case "dateSent":
        return formatDate(r.createdAt);

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

  const toggleCol = (key: ChemistryColKey) => {
    setSelectedCols((prev) => {
      const exists = prev.includes(key);
      if (exists) return prev.filter((k) => k !== key);
      return [...prev, key];
    });
  };

  type WorkspaceMode = "VIEW" | "UPDATE";
  type WorkspaceLayout = "VERTICAL" | "HORIZONTAL";

  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("VIEW");
  const [workspaceLayout, setWorkspaceLayout] =
    useState<WorkspaceLayout>("VERTICAL");
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
  const [workspaceActiveId, setWorkspaceActiveId] = useState<string | null>(
    null,
  );

  const workspaceReports = useMemo(() => {
    return workspaceIds
      .map((id) => reports.find((r) => r.id === id))
      .filter(Boolean) as Report[];
  }, [workspaceIds, reports]);

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

  const statusOptions = useMemo(() => {
    return CHEMISTRY_STATUSES;
  }, [formFilter]);

  const reportsWithSearch = useMemo(() => {
    return reports.map((r) => ({
      ...r,
      _searchBlob: getReportSearchBlob({
        ...r,
        actives:
          r.actives ?? r.selectedActives ?? r.selectedActivesText ?? null,
      }),
    }));
  }, [reports]);

  // derived
  const processed = useMemo(() => {
    const byForm =
      formFilter === "ALL"
        ? reportsWithSearch
        : reportsWithSearch.filter((r) => {
            if (formFilter === "CHEMISTRY")
              return r.formType === "CHEMISTRY_MIX";
            if (formFilter === "COA") return r.formType === "COA";
            return true;
          });

    const byStatus =
      statusFilter === "ALL"
        ? byForm
        : byForm.filter((r) => r.status === statusFilter);

    const byClient = searchClient.trim()
      ? byStatus.filter((r) => {
          const q = searchClient.toLowerCase();
          return r.client.toLowerCase().includes(q);
        })
      : byStatus;

    const byReport = searchReport.trim()
      ? byClient.filter((r) => {
          const q = searchReport.toLowerCase();
          return (
            String(displayReportNo(r)).toLowerCase().includes(q) ||
            String(r.formNumber || "")
              .toLowerCase()
              .includes(q)
          );
        })
      : byClient;

    const bySearchText = searchText.trim()
      ? byReport.filter((r) => {
          const q = searchText.trim().toLowerCase();
          return (r._searchBlob || "").includes(q);
        })
      : byReport;

    const byNumberRange =
      numberRangeType === "FORM"
        ? formNoFrom.trim() || formNoTo.trim()
          ? bySearchText.filter((r) =>
              inRange(
                extractYearAndSequence(r.formNumber).sequence,
                formNoFrom,
                formNoTo,
              ),
            )
          : bySearchText
        : reportNoFrom.trim() || reportNoTo.trim()
          ? bySearchText.filter((r) =>
              inRange(
                extractYearAndSequence(r.reportNumber).sequence,
                reportNoFrom,
                reportNoTo,
              ),
            )
          : bySearchText;

    const byActive =
      activeFilter === "ALL"
        ? byNumberRange
        : byNumberRange.filter((r) => {
            const list = r.selectedActivesText?.trim()
              ? r.selectedActivesText.split(",").map((s) => s.trim())
              : (r.selectedActives ?? []).map((s) => String(s).trim());

            return list.includes(activeFilter);
          });

    const byDate = byActive.filter((r) =>
      matchesDateRange(r.createdAt, fromDate || undefined, toDate || undefined),
    );

    return [...byDate].sort((a, b) => {
      const aPinned = pinnedIds.includes(a.id) ? 1 : 0;
      const bPinned = pinnedIds.includes(b.id) ? 1 : 0;

      if (aPinned !== bPinned) {
        return bPinned - aPinned; // pinned first
      }
      if (sortBy === "reportNumber") {
        const aK = String(a.reportNumber || "").toLowerCase();
        const bK = String(b.reportNumber || "").toLowerCase();
        return sortDir === "asc" ? aK.localeCompare(bK) : bK.localeCompare(aK);
      }

      const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return sortDir === "asc" ? aT - bT : bT - aT;
    });
  }, [
    reportsWithSearch,
    formFilter,
    statusFilter,
    searchClient,
    searchReport,
    searchText,
    numberRangeType,
    formNoFrom,
    formNoTo,
    reportNoFrom,
    reportNoTo,
    sortBy,
    sortDir,
    fromDate,
    toDate,
    activeFilter,
    pinnedIds,
  ]);

  useEffect(() => {
    if (!statusOptions.includes(statusFilter as any)) {
      setStatusFilter("ALL");
    }
  }, [statusOptions, statusFilter]);

  // pagination
  const total = processed.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageClamped = Math.min(page, totalPages);
  const start = (pageClamped - 1) * perPage;
  const end = start + perPage;
  const pageRows = processed.slice(start, end);
  useEffect(() => {
    setSelectedIds([]);
  }, [
    formFilter,
    statusFilter,
    searchClient,
    searchReport,
    searchText,
    numberRangeType,
    formNoFrom,
    formNoTo,
    reportNoFrom,
    reportNoTo,
    sortBy,
    sortDir,
    activeFilter,
    datePreset,
    fromDate,
    toDate,
    perPage,
    pageClamped,
  ]);

  useEffect(() => {
    const nextForm = (searchParams.get("form") as FormFilter) || "ALL";
    if (nextForm !== formFilter) setFormFilter(nextForm);
  }, [searchParams]);

  useEffect(() => {
    const sp = new URLSearchParams();

    if (formFilter !== "ALL") sp.set("form", formFilter);
    sp.set("status", String(statusFilter));

    if (searchClient.trim()) sp.set("client", searchClient.trim());
    if (searchReport.trim()) sp.set("report", searchReport.trim());
    if (searchText.trim()) sp.set("q", searchText.trim());

    sp.set("sortBy", sortBy);
    sp.set("sortDir", sortDir);
    sp.set("pp", String(perPage));
    sp.set("p", String(pageClamped));

    sp.set("dp", datePreset);
    if (fromDate) sp.set("from", fromDate);
    if (toDate) sp.set("to", toDate);

    sp.set("rangeType", numberRangeType);
    if (formNoFrom.trim()) sp.set("formFrom", formNoFrom.trim());
    if (formNoTo.trim()) sp.set("formTo", formNoTo.trim());
    if (reportNoFrom.trim()) sp.set("reportFrom", reportNoFrom.trim());
    if (reportNoTo.trim()) sp.set("reportTo", reportNoTo.trim());

    if (activeFilter && activeFilter !== "ALL") {
      sp.set("active", activeFilter);
    }

    if (selectedIds.length) sp.set("sel", selectedIds.join(","));

    setSearchParams(sp, { replace: true });
  }, [
    formFilter,
    statusFilter,
    searchClient,
    searchReport,
    searchText,
    numberRangeType,
    formNoFrom,
    formNoTo,
    reportNoFrom,
    reportNoTo,
    sortBy,
    sortDir,
    perPage,
    pageClamped,
    activeFilter,
    datePreset,
    fromDate,
    toDate,
    selectedIds,
    setSearchParams,
  ]);

  useEffect(() => {
    const nextForm = (searchParams.get("form") as FormFilter) || "ALL";
    const nextStatus =
      (searchParams.get("status") as (typeof CHEMISTRY_STATUSES)[number]) ||
      "ALL";

    const nextClient = searchParams.get("client") || "";
    const nextReport = searchParams.get("report") || "";
    const nextQ = searchParams.get("q") || "";

    const nextRangeType =
      (searchParams.get("rangeType") as "FORM" | "REPORT") || "FORM";
    const nextFormFrom = searchParams.get("formFrom") || "";
    const nextFormTo = searchParams.get("formTo") || "";
    const nextReportFrom = searchParams.get("reportFrom") || "";
    const nextReportTo = searchParams.get("reportTo") || "";

    const nextSortBy = ((searchParams.get("sortBy") as any) || "createdAt") as
      | "createdAt"
      | "reportNumber";
    const nextSortDir = ((searchParams.get("sortDir") as any) || "desc") as
      | "asc"
      | "desc";

    const nextPp = parseIntSafe(searchParams.get("pp"), 10);
    const nextP = parseIntSafe(searchParams.get("p"), 1);

    const nextActive = searchParams.get("active") || "ALL";
    const nextDp = ((searchParams.get("dp") as any) || "ALL") as DatePreset;
    const nextFrom = searchParams.get("from") || "";
    const nextTo = searchParams.get("to") || "";

    if (nextForm !== formFilter) setFormFilter(nextForm);
    if (nextStatus !== statusFilter) setStatusFilter(nextStatus);

    if (nextClient !== searchClient) setSearchClient(nextClient);
    if (nextReport !== searchReport) setSearchReport(nextReport);
    if (nextQ !== searchText) setSearchText(nextQ);

    if (nextRangeType !== numberRangeType) setNumberRangeType(nextRangeType);
    if (nextFormFrom !== formNoFrom) setFormNoFrom(nextFormFrom);
    if (nextFormTo !== formNoTo) setFormNoTo(nextFormTo);
    if (nextReportFrom !== reportNoFrom) setReportNoFrom(nextReportFrom);
    if (nextReportTo !== reportNoTo) setReportNoTo(nextReportTo);

    if (nextSortBy !== sortBy) setSortBy(nextSortBy);
    if (nextSortDir !== sortDir) setSortDir(nextSortDir);

    if (nextPp !== perPage) setPerPage(nextPp);
    if (nextP !== page) setPage(nextP);

    if (nextActive !== activeFilter) setActiveFilter(nextActive);
    if (nextDp !== datePreset) setDatePreset(nextDp);
    if (nextFrom !== fromDate) setFromDate(nextFrom);
    if (nextTo !== toDate) setToDate(nextTo);
  }, [searchParams]);

  function canUpdateThisChemistryReportLocal(r: Report, user?: any) {
    const chemistryFieldsUsedOnForm = [
      "sop",
      "results",
      "dateTested",
      "initial",
      "comments",
      "testedBy",
      "testedDate",
      "coaRows",
    ];

    return canShowChemistryUpdateButton(
      user?.role,
      r.status as ChemistryReportStatus,
      chemistryFieldsUsedOnForm,
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
      formNumber: null,
      reportNumber: null,
      formType: null,
      clientCode: null,
    });

    setPrintingBulk(true);
    setIsBulkPrinting(true);
  };

  const selectedReportObjects = selectedIds
    .map((id) => reports.find((r) => r.id === id))
    .filter(Boolean) as Report[];

  async function autoAdvanceAndOpen(r: Report, actor: string) {
    let nextStatus: string | null = null;

    if (r.status === "SUBMITTED_BY_CLIENT") {
      nextStatus = "UNDER_TESTING_REVIEW";
      await setStatus({
        report: r,
        newStatus: nextStatus,
        reason: "Move to testing",
      });
    } else if (r.status === "RESUBMISSION_BY_CLIENT") {
      nextStatus = "UNDER_TESTING_REVIEW";
      await setStatus({
        report: r,
        newStatus: nextStatus,
        reason: "Resubmitted by client",
      });
    } else if (r.status === "CLIENT_NEEDS_CORRECTION") {
      nextStatus = "UNDER_RESUBMISSION_TESTING_REVIEW";
      await setStatus({
        report: r,
        newStatus: nextStatus,
        reason: `Set by ${actor}`,
      });
    } else if (r.status === "QA_NEEDS_CORRECTION") {
      nextStatus = "UNDER_TESTING_REVIEW";
      await setStatus({
        report: r,
        newStatus: nextStatus,
        reason: `Set by ${actor}`,
      });
    }

    if (nextStatus) {
      setReports((prev) =>
        prev.map((x) =>
          x.id === r.id
            ? {
                ...x,
                status: nextStatus!,
                version: (x.version ?? r.version) + 1,
              }
            : x,
        ),
      );
    }

    return nextStatus;
  }

  useEffect(() => {
    setPage(1);
  }, [
    formFilter,
    statusFilter,
    searchClient,
    searchReport,
    searchText,
    numberRangeType,
    formNoFrom,
    formNoTo,
    reportNoFrom,
    reportNoTo,
    sortBy,
    sortDir,
    perPage,
    activeFilter,
    datePreset,
    fromDate,
    toDate,
  ]);

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
      searchClient.trim() !== "" ||
      searchReport.trim() !== "" ||
      searchText.trim() !== "" ||
      numberRangeType !== "FORM" ||
      formNoFrom !== "" ||
      formNoTo !== "" ||
      reportNoFrom !== "" ||
      reportNoTo !== "" ||
      sortBy !== "createdAt" ||
      sortDir !== "desc" ||
      perPage !== 10 ||
      activeFilter !== "ALL" ||
      datePreset !== "ALL" ||
      fromDate !== "" ||
      toDate !== ""
    );
  }, [
    formFilter,
    statusFilter,
    searchClient,
    searchReport,
    searchText,
    numberRangeType,
    formNoFrom,
    formNoTo,
    reportNoFrom,
    reportNoTo,
    sortBy,
    sortDir,
    perPage,
    activeFilter,
    datePreset,
    fromDate,
    toDate,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({
          formFilter,
          statusFilter,
          searchClient,
          searchReport,
          searchText,
          numberRangeType,
          formNoFrom,
          formNoTo,
          reportNoFrom,
          reportNoTo,
          sortBy,
          sortDir,
          perPage,
          page,
          activeFilter,
          datePreset,
          fromDate,
          toDate,
        }),
      );
    } catch {
      // ignore
    }
  }, [
    FILTER_STORAGE_KEY,
    formFilter,
    statusFilter,
    searchClient,
    searchReport,
    searchText,
    numberRangeType,
    formNoFrom,
    formNoTo,
    reportNoFrom,
    reportNoTo,
    sortBy,
    sortDir,
    perPage,
    page,
    activeFilter,
    datePreset,
    fromDate,
    toDate,
  ]);

  const clearAllFilters = () => {
    setFormFilter(DEFAULT_CHEM_FILTERS.formFilter);
    setStatusFilter(DEFAULT_CHEM_FILTERS.statusFilter);
    setSearchClient(DEFAULT_CHEM_FILTERS.searchClient);
    setSearchReport(DEFAULT_CHEM_FILTERS.searchReport);
    setSearchText(DEFAULT_CHEM_FILTERS.searchText);
    setNumberRangeType(DEFAULT_CHEM_FILTERS.numberRangeType);
    setFormNoFrom(DEFAULT_CHEM_FILTERS.formNoFrom);
    setFormNoTo(DEFAULT_CHEM_FILTERS.formNoTo);
    setReportNoFrom(DEFAULT_CHEM_FILTERS.reportNoFrom);
    setReportNoTo(DEFAULT_CHEM_FILTERS.reportNoTo);
    setSortBy(DEFAULT_CHEM_FILTERS.sortBy);
    setSortDir(DEFAULT_CHEM_FILTERS.sortDir);
    setPerPage(DEFAULT_CHEM_FILTERS.perPage);
    setPage(DEFAULT_CHEM_FILTERS.page);
    setActiveFilter(DEFAULT_CHEM_FILTERS.activeFilter);
    setDatePreset(DEFAULT_CHEM_FILTERS.datePreset);
    setFromDate(DEFAULT_CHEM_FILTERS.fromDate);
    setToDate(DEFAULT_CHEM_FILTERS.toDate);

    try {
      localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify(DEFAULT_CHEM_FILTERS),
      );
    } catch {
      // ignore
    }
  };

  useLiveReportStatus(setReports);

  function ActivesCell({
    selectedActives,
    selectedActivesText,
  }: {
    selectedActives?: string[];
    selectedActivesText?: string;
  }) {
    // Normalize list
    const list = React.useMemo(() => {
      if (selectedActivesText?.trim()) {
        // If backend sends a single string like "A, B, C"
        return selectedActivesText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return (selectedActives ?? [])
        .map((s) => String(s).trim())
        .filter(Boolean);
    }, [selectedActives, selectedActivesText]);

    const first = list[0];
    const rest = list.slice(1);
    const moreCount = rest.length;

    const [open, setOpen] = React.useState(false);
    const btnRef = React.useRef<HTMLButtonElement | null>(null);
    const popRef = React.useRef<HTMLDivElement | null>(null);

    // Close on outside click
    React.useEffect(() => {
      if (!open) return;

      const onDown = (e: MouseEvent) => {
        const t = e.target as Node;
        if (popRef.current?.contains(t)) return;
        if (btnRef.current?.contains(t)) return;
        setOpen(false);
      };

      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };

      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onDown);
        document.removeEventListener("keydown", onKey);
      };
    }, [open]);

    if (!list.length) return <span className="text-slate-500">-</span>;

    return (
      <div className="relative inline-flex items-center gap-2">
        <span className="truncate max-w-[220px]">{first}</span>

        {moreCount > 0 && (
          <>
            <button
              ref={btnRef}
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-full border bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              aria-haspopup="dialog"
              aria-expanded={open}
              title={rest.join(", ")}
            >
              +{moreCount}
            </button>

            {open && (
              <div
                ref={popRef}
                className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border bg-white p-2 shadow-lg"
                role="dialog"
              >
                <div className="px-2 pb-1 text-xs font-semibold text-slate-600">
                  Other actives
                </div>

                <div className="max-h-44 overflow-auto">
                  {rest.map((a, i) => (
                    <div
                      key={`${a}-${i}`}
                      className="rounded-lg px-2 py-1 text-sm text-slate-800 hover:bg-slate-50"
                    >
                      {a}
                    </div>
                  ))}
                </div>

                <div className="pt-2 text-right">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg border px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  const allActives = useMemo(() => {
    const set = new Set<string>();

    for (const r of reports) {
      // prefer array, fallback to text
      const list = r.selectedActivesText?.trim()
        ? r.selectedActivesText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : (r.selectedActives ?? [])
            .map((s) => String(s).trim())
            .filter(Boolean);

      list.forEach((a) => set.add(a));
    }

    return ["ALL", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [reports]);

  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);

  const selected = selectedReportObjects;

  const selectedSameStatus = useMemo(() => {
    if (!selected.length) return false;
    const status0 = String(selected[0].status);
    return selected.every((r) => String(r.status) === status0);
  }, [selected]);

  const commonNextStatuses = useMemo(() => {
    if (!selected.length) return [];
    if (!selectedSameStatus) return [];
    return intersectAll(selected.map(getNextStatusesForReport));
  }, [selected, selectedSameStatus]);

  useEffect(() => {
    const close = () => setBulkMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  function getTargetsForAction(clicked: Report): Report[] {
    const selected = selectedIds
      .map((id) => reports.find((r) => r.id === id))
      .filter(Boolean) as Report[];

    if (!selected.length) return [clicked];

    const clickedInsideSelection = selected.some((r) => r.id === clicked.id);
    return clickedInsideSelection ? selected : [clicked];
  }

  function canUpdateAnyReport(r: Report, user?: any) {
    return canUpdateThisChemistryReportLocal(r, user);
  }

  function openViewTarget(clicked: Report) {
    const targets = getTargetsForAction(clicked);

    if (targets.length <= 1) {
      setSelectedReport(clicked);
      return;
    }

    setWorkspaceIds(targets.map((r) => r.id));
    setWorkspaceMode("VIEW");
    setWorkspaceLayout("VERTICAL");
    setWorkspaceActiveId(clicked.id);
    setWorkspaceOpen(true);
  }

  function openUpdateTarget(clicked: Report) {
    const targets = getTargetsForAction(clicked).filter((r) =>
      canUpdateAnyReport(r, user),
    );

    if (!targets.length) {
      toast.error("No selected reports are available for update");
      return;
    }

    if (targets.length <= 1) {
      goToReportEditor(clicked);
      return;
    }

    setWorkspaceIds(targets.map((r) => r.id));
    setWorkspaceMode("UPDATE");
    setWorkspaceLayout("VERTICAL");
    setWorkspaceActiveId(clicked.id);
    setWorkspaceOpen(true);
  }

  if (!colsHydrated || !pinsHydrated) {
    return <div className="p-6 text-slate-500">Loading dashboard…</div>;
  }

  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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

        display: flex !important;
        flex-direction: column !important;
        min-height: 279mm !important;
      }

      #bulk-print-root .print-footer {
        margin-top: auto !important;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }

      #bulk-print-root .report-page {
        break-inside: avoid-page;
        page-break-inside: avoid;
        min-height: 279mm !important;
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
          <h1 className="text-2xl font-bold tracking-tight">
            Chemistry Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            Queue of Chemistry reports for chemistry team.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              disabled={
                !selectedIds.length || !selectedSameStatus || bulkUpdating
              }
              onClick={(e) => {
                e.stopPropagation();
                setBulkMenuOpen((o) => !o);
              }}
              className={classNames(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition",
                selectedIds.length && selectedSameStatus
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-slate-200 text-slate-500 cursor-not-allowed",
              )}
            >
              {bulkUpdating ? <Spinner /> : "⚡"}
              {bulkUpdating
                ? "Applying..."
                : `Bulk Status (${selectedIds.length})`}
            </button>

            {bulkMenuOpen && commonNextStatuses.length > 0 && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl border bg-white shadow-lg ring-1 ring-black/5 z-20">
                <div className="py-1 text-sm">
                  {commonNextStatuses.map((s) => (
                    <button
                      key={s}
                      className="flex w-full items-center px-3 py-2 hover:bg-slate-100 text-left"
                      onClick={async () => {
                        if (bulkUpdating) return;

                        setBulkMenuOpen(false);
                        setBulkUpdating(true);

                        try {
                          await Promise.all(
                            selected.map((r) =>
                              setStatus({
                                report: r,
                                newStatus: s,
                                reason: "Bulk Status Change",
                              }),
                            ),
                          );

                          const keep = new Set(
                            CHEMISTRY_STATUSES.filter((x) => x !== "ALL"),
                          );

                          setReports((prev) => {
                            const updated = prev.map((x) =>
                              selectedIds.includes(x.id)
                                ? {
                                    ...x,
                                    status: s,
                                    version: (x.version ?? 0) + 1,
                                  }
                                : x,
                            );

                            return updated.filter((r) =>
                              keep.has(r.status as any),
                            );
                          });

                          setSelectedIds([]);
                        } catch (e: any) {
                          alert(e?.message || "Bulk update failed");
                        } finally {
                          setBulkUpdating(false);
                        }
                      }}
                    >
                      {niceStatus(s)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

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
            aria-label="Refresh"
          >
            {refreshing ? <SpinnerDark /> : "↻"}
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Form Type filter */}
      <div className="mb-3 border-b border-slate-200">
        <nav className="-mb-px flex gap-6 text-sm">
          {(["ALL", "CHEMISTRY", "COA"] as const).map((ft) => {
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
                  ? "All"
                  : ft === "CHEMISTRY"
                    ? "Chemistry"
                    : "COA"}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Controls */}
      <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
        {/* Status chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {CHEMISTRY_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={classNames(
                "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ring-1 transition",
                statusFilter === s
                  ? "bg-blue-600 text-white ring-blue-600"
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100 ring-slate-200",
              )}
            >
              {niceStatus(String(s))}
            </button>
          ))}
        </div>

        {/* Row 1: Search Client | Sort | Rows */}
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="relative lg:col-span-5">
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search client, form #, report #, lot/batch #, formula, actives, status..."
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 lg:col-span-4">
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "createdAt" | "reportNumber")
              }
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="createdAt">Sort: Date Sent</option>
              <option value="reportNumber">Sort: Report #</option>
            </select>

            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="inline-flex h-10 min-w-[42px] items-center justify-center rounded-lg border px-3 text-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
              title={sortDir === "asc" ? "Ascending" : "Descending"}
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>

          <div className="flex items-center gap-2 lg:col-span-3 lg:justify-end">
            <label
              htmlFor="perPage"
              className="text-sm text-slate-600 whitespace-nowrap"
            >
              Rows
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

        {/* Row 2: Date preset | From | To | Forms/Reports | From | To */}
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="lg:col-span-2">
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              className="w-40 rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
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

          <div className="lg:col-span-2">
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
          </div>

          <div className="lg:col-span-2">
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

          <div className="lg:col-span-2">
            <select
              value={numberRangeType}
              onChange={(e) =>
                setNumberRangeType(e.target.value as "FORM" | "REPORT")
              }
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="FORM">Forms</option>
              <option value="REPORT">Reports</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <input
              type="number"
              placeholder="From"
              value={numberRangeType === "FORM" ? formNoFrom : reportNoFrom}
              onChange={(e) => {
                if (numberRangeType === "FORM") setFormNoFrom(e.target.value);
                else setReportNoFrom(e.target.value);
              }}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="lg:col-span-2">
            <input
              type="number"
              placeholder="To"
              value={numberRangeType === "FORM" ? formNoTo : reportNoTo}
              onChange={(e) => {
                if (numberRangeType === "FORM") setFormNoTo(e.target.value);
                else setReportNoTo(e.target.value);
              }}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Row 3: Active */}
        {/* Row 3: Active + Clear */}
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              {allActives.map((a) => (
                <option key={a} value={a}>
                  {a === "ALL" ? "All actives" : a}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-8 flex justify-end">
            <button
              type="button"
              onClick={clearAllFilters}
              disabled={!hasActiveFilters}
              className={classNames(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition",
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
      <div className="rounded-2xl border bg-white shadow-sm flex flex-col">
        {error && (
          <div className="border-b bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="min-h-0">
  <div className="max-h-[60vh] overflow-auto scrollbar-thin">
    <table className="min-w-max w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-30 bg-slate-50">
              <tr className="text-left text-slate-600">
                <th className="bg-slate-50 px-3 py-3 font-medium w-6 whitespace-nowrap text-center"></th>
                <th className="bg-slate-50 px-4 py-3 font-medium w-10 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectPage}
                  />
                </th>
                {selectedCols.map((k) => (
               <th
  key={k}
  className="bg-slate-50 px-4 py-3 font-medium whitespace-nowrap"
>
                    {COLS.find((c) => c.key === k)?.label ?? k}
                  </th>
                ))}
                <th className="bg-slate-50 px-4 py-3 font-medium whitespace-nowrap">
  Status
</th>
                <th className="sticky top-0 right-0 z-40 bg-slate-50 px-4 py-3 font-medium shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.12)]">
                  <div className="flex items-center justify-between gap-2">
                    <span>Actions</span>

                    <div className="relative" data-col-dropdown>
                      <button
                        ref={colBtnRef}
                        type="button"
                        onClick={() => {
                          setColOpen((v) => {
                            const next = !v;
                            if (next && colBtnRef.current) {
                              const r =
                                colBtnRef.current.getBoundingClientRect();
                              setColPos({
                                top: r.bottom + 8,
                                left: r.right - 288,
                              });
                            }
                            return next;
                          });
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-slate-600 hover:bg-slate-100"
                        title="Choose columns"
                        aria-label="Choose columns"
                      >
                        ▾
                      </button>

                      {colOpen &&
                        colPos &&
                        createPortal(
                          <div
                            className="fixed z-[9999] w-72 rounded-xl border bg-white p-3 shadow-lg"
                            style={{ top: colPos.top, left: colPos.left }}
                            data-col-dropdown
                          >
                            <div className="mb-2 flex items-center justify-between">
                              <div className="text-xs font-semibold text-slate-600">
                                Columns ({selectedCols.length})
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

                            <div className="grid max-h-72 grid-cols-1 gap-2 overflow-auto pr-1">
                              {COLS.map((c) => {
                                const checked = selectedCols.includes(c.key);

                                return (
                                  <label
                                    key={c.key}
                                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm cursor-pointer hover:bg-slate-50"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
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
                          </div>,
                          document.body,
                        )}
                    </div>
                  </div>
                </th>
              </tr>
            </thead>

            <tbody>
              {loading &&
                [...Array(7)].map((_, i) => (
                  <tr key={`skel-${i}`} className="border-t">
                    <td className="pl-2 pr-1 py-3">
                      <div className="mx-auto h-4 w-4 rounded bg-slate-200" />
                    </td>
                    <td className="pl-1 pr-3 py-3">
                      <div className="h-4 w-4 rounded bg-slate-200" />
                    </td>

                    {selectedCols.map((k) => (
                      <td key={`${k}-${i}`} className="px-4 py-3">
                        <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                      </td>
                    ))}

                    <td className="px-4 py-3">
                      <div className="h-8 w-28 animate-pulse rounded bg-slate-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-8 w-36 animate-pulse rounded bg-slate-200" />
                    </td>
                  </tr>
                ))}

              {!loading &&
                pageRows.map((r) => {
                  const rowBusy = updatingId === r.id;

                  return (
                    <tr
                      key={r.id}
                      className={classNames(
                        "border-t hover:bg-slate-50",
                        isPinned(r.id) && "bg-blue-50/40",
                      )}
                    >
                      <td className="pl-2 pr-1 py-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePin(r.id);
                          }}
                          className="inline-flex items-center justify-center transition hover:scale-110"
                          aria-label={
                            isPinned(r.id) ? "Unpin report" : "Pin report"
                          }
                          title={isPinned(r.id) ? "Unpin" : "Pin"}
                        >
                          <Pin
                            className={classNames(
                              "h-3 w-3 rotate-45 transition",
                              isPinned(r.id)
                                ? "text-blue-600 fill-blue-600"
                                : "text-slate-400 hover:text-slate-600",
                            )}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isRowSelected(r.id)}
                          onChange={() => toggleRow(r.id)}
                          disabled={rowBusy}
                        />
                      </td>

                      {selectedCols.map((k) => (
                        <td key={k} className="px-4 py-3 whitespace-nowrap">
                          {k === "formNumber" || k === "reportNumber" ? (
                            <span className="font-medium">
                              {getCellValue(r, k)}
                            </span>
                          ) : k === "actives" ? (
                            <ActivesCell
                              selectedActives={r.selectedActives}
                              selectedActivesText={r.selectedActivesText}
                            />
                          ) : (
                            getCellValue(r, k)
                          )}
                        </td>
                      ))}

                      <td className="px-4 py-3">
                        <span
                          className={classNames(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ring-1",
                            CHEMISTRY_STATUS_COLORS[
                              r.status as ChemistryReportStatus
                            ] ||
                              "bg-slate-100 text-slate-800 ring-1 ring-slate-200",
                          )}
                        >
                          {niceStatus(String(r.status))}
                        </span>
                      </td>

                      <td className="sticky right-0 z-20 bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.08)]">
                        <div className="flex items-center gap-2">
                          {/* <button
                            disabled={rowBusy}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                            onClick={() => setSelectedReport(r)}
                          >
                            View
                          </button> */}

                          <button
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                            onClick={() => {
                              logUiEvent({
                                action: "UI_VIEW",
                                entity:
                                  r.formType === "CHEMISTRY_MIX"
                                    ? "ChemistryReport"
                                    : "CoaReport",
                                entityId: r.id,
                                details: `Viewed ${r.formNumber}`,
                                meta: {
                                  formNumber: r.formNumber,
                                  formType: r.formType,
                                  status: r.status,
                                },
                                formNumber: null,
                                reportNumber: null,
                                formType: null,
                                clientCode: null,
                              });

                              // setSelectedReport(r);

                              openViewTarget(r);
                            }}
                            disabled={rowBusy}
                          >
                            View
                          </button>

                          {canUpdateThisChemistryReportLocal(r, user) && (
                            <button
                              disabled={rowBusy}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                              onClick={async () => {
                                if (rowBusy) return;
                                setUpdatingId(r.id);
                                try {
                                  await autoAdvanceAndOpen(r, "chemistry");
                                  openUpdateTarget(r);
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
                        </div>
                      </td>
                    </tr>
                  );
                })}

              {!loading && pageRows.length === 0 && (
                <tr>
                  <td
                    colSpan={2 + selectedCols.length + 2}
                    className="px-4 py-12 text-center text-slate-500"
                  >
                    No reports found for{" "}
                    <span className="font-medium">
                      {niceStatus(String(statusFilter))}
                    </span>
                    {searchText ? (
                      <>
                        {" "}
                        matching{" "}
                        <span className="font-medium">“{searchText}”</span>.
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
        </div>

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="sticky bottom-0 z-20 flex flex-col items-center justify-between gap-3 border-t bg-white px-4 py-3 text-sm md:flex-row">
            <div className="text-slate-600">
              Showing <span className="font-medium">{start + 1}</span>–
              <span className="font-medium">{Math.min(end, total)}</span> of
              <span className="font-medium"> {total}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg border px-3 py-1.5 disabled:opacity-50"
                onClick={() => setPage((p: number) => Math.max(1, p - 1))}
                disabled={pageClamped === 1}
              >
                Prev
              </button>
              <span className="tabular-nums">
                {pageClamped} / {totalPages}
              </span>
              <button
                className="rounded-lg border px-3 py-1.5 disabled:opacity-50"
                onClick={() =>
                  setPage((p: number) => Math.min(totalPages, p + 1))
                }
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
                          : selectedReport.formType === "COA"
                            ? "CoaReport "
                            : "MicroReport",
                      entityId: selectedReport.id,
                      details: `Printed ${selectedReport.formNumber}`,
                      formNumber: null,
                      reportNumber: null,
                      formType: null,
                      clientCode: null,
                    });
                    setPrintingSingle(true);
                    setSinglePrintReport(selectedReport);
                  }}
                >
                  {printingSingle ? <SpinnerDark /> : "🖨️"}
                  {printingSingle ? "Preparing..." : "Print"}
                </button>

                {canUpdateThisChemistryReportLocal(selectedReport, user) && (
                  <button
                    disabled={modalUpdating}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                    onClick={async () => {
                      if (modalUpdating) return;
                      setModalUpdating(true);
                      try {
                        const r = selectedReport;

                        // optional: close modal first
                        setSelectedReport(null);

                        await autoAdvanceAndOpen(r, "chemistry");
                        openUpdateTarget(r);
                      } catch (e: any) {
                        toast.error(e?.message || "Failed to update status");
                      } finally {
                        setModalUpdating(false);
                      }
                    }}
                  >
                    {modalUpdating ? <Spinner /> : null}
                    {modalUpdating ? "Opening..." : "Update"}
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
              ) : selectedReport.formType === "COA" ? (
                <COAReportFormView
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
      <ReportWorkspaceModal
        open={workspaceOpen}
        reports={workspaceReports}
        mode={workspaceMode}
        layout={workspaceLayout}
        activeId={workspaceActiveId}
        onClose={() => {
          setWorkspaceOpen(false);
          setWorkspaceIds([]);
          setWorkspaceActiveId(null);
        }}
        onLayoutChange={(layout) => setWorkspaceLayout(layout)}
        onFocus={(id) => setWorkspaceActiveId(id)}
      />
    </div>
  );
}
