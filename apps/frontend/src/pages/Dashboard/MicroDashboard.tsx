import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import MicroMixReportFormView from "../Reports/MicroMixReportFormView";
import { useAuth } from "../../context/AuthContext";
import {
  STATUS_TRANSITIONS as MICRO_STATUS_TRANSITIONS,
  STATUS_COLORS,
  canShowUpdateButton,
  type ReportStatus,
  type Role,
} from "../../utils/microMixReportFormWorkflow";
import { api } from "../../lib/api";
import toast from "react-hot-toast";
import MicroMixWaterReportFormView from "../Reports/MicroMixWaterReportFormView";
import { createPortal } from "react-dom";
import {
  formatDate,
  matchesDateRange,
  toDateOnlyISO_UTC,
  type DatePreset,
} from "../../utils/dashboardsSharedTypes";
import { useLiveReportStatus } from "../../hooks/useLiveReportStatus";
import { logUiEvent } from "../../lib/uiAudit";
import SterilityReportFormView from "../Reports/SterilityReportFormView";
import { parseIntSafe } from "../../utils/commonDashboardUtil";
import {
  canShowSterilityUpdateButton,
  STERILITY_STATUS_COLORS,
  STERILITY_STATUS_TRANSITIONS,
  type SterilityReportStatus,
} from "../../utils/SterilityReportFormWorkflow";
import ReportWorkspaceModal from "../../utils/ReportWorkspaceModal";
import { getReportSearchBlob } from "../../utils/clientDashboardutils";
import { COLS, type ColKey } from "../../utils/globalUtils";
import { Pin } from "lucide-react";

// -----------------------------
// Types
// -----------------------------
type Report = {
  id: string;
  client: string;
  clientCode?: string | null;
  formType: string;
  dateSent: string | null;
  status: string;
  reportNumber: string | null;
  formNumber: string;
  prefix?: string;
  version: number;

  // extra searchable fields
  createdAt?: string | null;
  updatedAt?: string | null;

  typeOfTest?: string | null;
  sampleType?: string | null;
  formulaNo?: string | null;
  description?: string | null;
  lotNo?: string | null;
  manufactureDate?: string | null;

  idNo?: string | null;
  samplingDate?: string | null;

  preliminaryResults?: string | null;
  preliminaryResultsDate?: string | null;
  tbc_result?: string | null;
  tbc_spec?: string | null;
  tmy_result?: string | null;
  tmy_spec?: string | null;

  volumeTested?: string | null;
  ftm_result?: string | null;
  scdb_result?: string | null;

  comments?: string | null;
  testedBy?: string | null;
  reviewedBy?: string | null;

  pathogens?: unknown;

  _searchBlob?: string;
};

// -----------------------------
// Statuses
// -----------------------------
// Micro + Micro Water (prelim/final workflow)
const MICRO_ONLY_STATUSES = [
  "ALL",
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
  "VOID",

  "UNDER_CHANGE_UPDATE",
  "CORRECTION_REQUESTED",
  "UNDER_CORRECTION_UPDATE",
  "CHANGE_REQUESTED",
] as const;

// Sterility (chemistry-like workflow)
const STERILITY_ONLY_STATUSES = [
  "ALL",
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

  "UNDER_CHANGE_UPDATE",
  "CORRECTION_REQUESTED",
  "UNDER_CORRECTION_UPDATE",
  "CHANGE_REQUESTED",
] as const;

type ReportKind = "MICRO" | "MICRO_WATER" | "STERILITY";

function getReportKind(r: Report): ReportKind {
  if (r.formType === "MICRO_MIX") return "MICRO";
  if (r.formType === "MICRO_MIX_WATER") return "MICRO_WATER";
  return "STERILITY";
}

function getNextStatusesForReport(r: Report): string[] {
  const s = String(r.status);

  if (r.formType === "STERILITY") {
    return (
      STERILITY_STATUS_TRANSITIONS?.[s as SterilityReportStatus]?.next ?? []
    );
  }

  return MICRO_STATUS_TRANSITIONS?.[s as ReportStatus]?.next ?? [];
}

function intersectAll(lists: string[][]): string[] {
  if (!lists.length) return [];
  const set = new Set(lists[0]);

  for (let i = 1; i < lists.length; i++) {
    const current = new Set(lists[i]);
    for (const v of Array.from(set)) {
      if (!current.has(v)) set.delete(v);
    }
  }

  return Array.from(set);
}

// -----------------------------
// Utilities
// -----------------------------
const formTypeToSlug: Record<string, string> = {
  MICRO_MIX: "micro-mix",
  MICRO_MIX_WATER: "micro-mix-water",
  STERILITY: "sterility",
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
async function setStatus(
  r: Report,
  newStatus: string,
  reason = "Common Status Change",
) {
  await api(`/reports/${r.id}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      reason,
      status: newStatus,
      expectedVersion: r.version,
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
// Bulk print area
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

function extractYearAndSequence(value?: string | number | null): {
  year: number | null;
  sequence: number | null;
} {
  if (value == null) return { year: null, sequence: null };

  const text = String(value).trim();

  // Example:
  // ABC-20260001 => year: 2026, sequence: 1
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

// -----------------------------
// Component
// -----------------------------
export default function MicroDashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const DEFAULT_MICRO_FILTERS = {
    formFilter: "ALL" as "ALL" | "MICRO" | "MICRO_WATER" | "STERILITY",
    statusFilter: "ALL",
    searchClient: "",
    searchReport: "",
    searchText: "",
    numberRangeType: "FORM" as "FORM" | "REPORT",
    formNoFrom: "",
    formNoTo: "",
    reportNoFrom: "",
    reportNoTo: "",
    sortBy: "dateSent" as "dateSent" | "reportNumber",
    sortDir: "desc" as "asc" | "desc",
    perPage: 10,
    page: 1,
    datePreset: "ALL" as DatePreset,
    fromDate: "",
    toDate: "",
  };

  function getInitialMicroFilters(
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
        spDp ||
        spFrom ||
        spTo;

      if (hasUrlFilters) {
        return {
          formFilter: (spForm as any) || DEFAULT_MICRO_FILTERS.formFilter,
          statusFilter: spStatus || DEFAULT_MICRO_FILTERS.statusFilter,
          searchClient: spClient || DEFAULT_MICRO_FILTERS.searchClient,
          searchReport: spReport || DEFAULT_MICRO_FILTERS.searchReport,
          searchText: spQ || DEFAULT_MICRO_FILTERS.searchText,
          numberRangeType:
            (spRangeType as "FORM" | "REPORT") ||
            DEFAULT_MICRO_FILTERS.numberRangeType,
          formNoFrom: spFormFrom || DEFAULT_MICRO_FILTERS.formNoFrom,
          formNoTo: spFormTo || DEFAULT_MICRO_FILTERS.formNoTo,
          reportNoFrom: spReportFrom || DEFAULT_MICRO_FILTERS.reportNoFrom,
          reportNoTo: spReportTo || DEFAULT_MICRO_FILTERS.reportNoTo,
          sortBy:
            (spSortBy as "dateSent" | "reportNumber") ||
            DEFAULT_MICRO_FILTERS.sortBy,
          sortDir:
            (spSortDir as "asc" | "desc") || DEFAULT_MICRO_FILTERS.sortDir,
          perPage: parseIntSafe(spPp, DEFAULT_MICRO_FILTERS.perPage),
          page: parseIntSafe(spP, DEFAULT_MICRO_FILTERS.page),
          datePreset: (spDp as DatePreset) || DEFAULT_MICRO_FILTERS.datePreset,
          fromDate: spFrom || DEFAULT_MICRO_FILTERS.fromDate,
          toDate: spTo || DEFAULT_MICRO_FILTERS.toDate,
        };
      }

      const raw = localStorage.getItem(storageKey);
      if (raw) {
        return {
          ...DEFAULT_MICRO_FILTERS,
          ...JSON.parse(raw),
        };
      }
    } catch {
      // ignore
    }

    return DEFAULT_MICRO_FILTERS;
  }

  const { user } = useAuth();

  const userKey =
    (user as any)?.id ||
    (user as any)?.userId ||
    (user as any)?.sub ||
    (user as any)?.uid ||
    "micro";

  const colBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const [colPos, setColPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  const colUserKey =
    (user as any)?.id ||
    (user as any)?.userId ||
    (user as any)?.sub ||
    (user as any)?.uid ||
    "micro";

  const COL_STORAGE_KEY = `microDashboardCols:user:${colUserKey}`;

  const [colOpen, setColOpen] = useState(false);

  const DEFAULT_COLS: ColKey[] = [
    "reportNumber",
    "formNumber",
    "formType",
    "dateSent",
  ];

  const [selectedCols, setSelectedCols] = useState<ColKey[]>(DEFAULT_COLS);
  const [colsHydrated, setColsHydrated] = useState(false);

  const PIN_STORAGE_KEY = userKey
    ? `clientDashboardPinned:user:${userKey}`
    : null;

  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pinsHydrated, setPinsHydrated] = useState(false);

  const rowRefs = React.useRef<Record<string, HTMLTableRowElement | null>>({});
  const prevPositions = React.useRef<Record<string, DOMRect>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ColKey[];
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
      case "MICRO_MIX":
        return "MICRO";
      case "MICRO_MIX_WATER":
        return "MICRO_WATER";
      case "STERILITY":
        return "STERILITY";
      default:
        return ft || "-";
    }
  }

  function getCellValue(r: Report, key: ColKey) {
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
      if (exists) return prev.filter((k) => k !== key);
      return [...prev, key];
    });
  };

  const FILTER_STORAGE_KEY = `microDashboardFilters:user:${userKey}`;

  const initialFilters = getInitialMicroFilters(
    searchParams,
    FILTER_STORAGE_KEY,
  );

  type FormFilter = "ALL" | "MICRO" | "MICRO_WATER" | "STERILITY";

  const [formFilter, setFormFilter] = useState<FormFilter>(
    initialFilters.formFilter,
  );

  const [statusFilter, setStatusFilter] = useState<string>(
    initialFilters.statusFilter,
  );

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

  const [sortBy, setSortBy] = useState<"dateSent" | "reportNumber">(
    initialFilters.sortBy,
  );

  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    initialFilters.sortDir,
  );

  const [perPage, setPerPage] = useState(initialFilters.perPage);
  const [page, setPage] = useState(initialFilters.page);

  const [datePreset, setDatePreset] = useState<DatePreset>(
    initialFilters.datePreset,
  );

  const [fromDate, setFromDate] = useState(initialFilters.fromDate);
  const [toDate, setToDate] = useState(initialFilters.toDate);

  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  // selection & printing
  const [selectedIds, setSelectedIds] = useState<string[]>(
    (searchParams.get("sel") || "").split(",").filter(Boolean),
  );

  const [isBulkPrinting, setIsBulkPrinting] = useState(false);
  const [singlePrintReport, setSinglePrintReport] = useState<Report | null>(
    null,
  );

  // ✅ Loading guards for buttons
  const [printingBulk, setPrintingBulk] = useState(false);
  const [printingSingle, setPrintingSingle] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ✅ Per-row update guard
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // ✅ Modal update guard
  const [modalUpdating, setModalUpdating] = useState(false);

  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);

  const navigate = useNavigate();

  type WorkspaceMode = "VIEW" | "UPDATE";
  type CorrectionLaunchKind = "REQUEST_CHANGE" | "RAISE_CORRECTION";
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
        const all = await api<Report[]>("/reports");
        if (abort) return;
        const KEEP_STATUSES = new Set<string>([
          ...MICRO_ONLY_STATUSES.filter((s) => s !== "ALL").map(String),
          ...STERILITY_ONLY_STATUSES.filter((s) => s !== "ALL").map(String),
        ]);

        setReports(all.filter((r) => KEEP_STATUSES.has(String(r.status))));
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

  const [workspaceCorrectionKinds, setWorkspaceCorrectionKinds] = useState<
    CorrectionLaunchKind[]
  >([]);

  const [correctionMenuOpen, setCorrectionMenuOpen] = useState(false);
  const correctionBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const [correctionMenuPos, setCorrectionMenuPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    if (!correctionMenuOpen) return;

    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-correction-menu]")) {
        setCorrectionMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [correctionMenuOpen]);

  useEffect(() => {
    return () => {
      if (correctionCloseTimerRef.current != null) {
        window.clearTimeout(correctionCloseTimerRef.current);
      }
    };
  }, []);

  const correctionCloseTimerRef = React.useRef<number | null>(null);

  const statusOptions = useMemo(() => {
    if (formFilter === "STERILITY") return STERILITY_ONLY_STATUSES;
    // MICRO + MICRO_WATER + ALL => show micro statuses
    return MICRO_ONLY_STATUSES;
  }, [formFilter]);

  const reportsWithSearch = useMemo(() => {
    return reports.map((r) => ({
      ...r,
      _searchBlob: getReportSearchBlob(r),
    }));
  }, [reports]);

  // derived
  const processed = useMemo(() => {
    const byForm =
      formFilter === "ALL"
        ? reportsWithSearch
        : reportsWithSearch.filter((r) => {
            if (formFilter === "MICRO") return r.formType === "MICRO_MIX";
            if (formFilter === "MICRO_WATER")
              return r.formType === "MICRO_MIX_WATER";
            if (formFilter === "STERILITY") return r.formType === "STERILITY";
            return true;
          });

    const byStatus =
      statusFilter === "ALL"
        ? byForm
        : byForm.filter((r) => r.status === statusFilter);

    const byClient = searchClient.trim()
      ? byStatus.filter((r) => {
          const q = searchClient.toLowerCase();
          return (
            (r.client || "").toLowerCase().includes(q) ||
            (r.clientCode || "").toLowerCase().includes(q)
          );
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

    const byDate = byNumberRange.filter((r) =>
      matchesDateRange(r.dateSent, fromDate || undefined, toDate || undefined),
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

      const aT = a.dateSent ? new Date(a.dateSent).getTime() : 0;
      const bT = b.dateSent ? new Date(b.dateSent).getTime() : 0;
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
    pinnedIds,
  ]);

  useEffect(() => {
    if (!statusOptions.includes(statusFilter as any)) {
      setStatusFilter("ALL");
    }
  }, [statusOptions, statusFilter]);

  useEffect(() => {
    const map: Record<string, DOMRect> = {};
    for (const r of processed) {
      const el = rowRefs.current[r.id];
      if (el) {
        map[r.id] = el.getBoundingClientRect();
      }
    }
    prevPositions.current = map;
  }, [processed.length, page, perPage]);

  useEffect(() => {
    for (const r of processed) {
      const el = rowRefs.current[r.id];
      const prev = prevPositions.current[r.id];
      if (!el || !prev) continue;

      const next = el.getBoundingClientRect();
      const dy = prev.top - next.top;

      if (dy !== 0) {
        el.style.transition = "none";
        el.style.transform = `translateY(${dy}px)`;

        requestAnimationFrame(() => {
          el.style.transition = "transform 280ms ease";
          el.style.transform = "translateY(0)";
        });

        const cleanup = () => {
          el.style.transition = "";
          el.style.transform = "";
          el.removeEventListener("transitionend", cleanup);
        };

        el.addEventListener("transitionend", cleanup);
      }
    }
  }, [processed]);

  // pagination
  const total = processed.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageClamped = Math.min(page, totalPages);
  const start = (pageClamped - 1) * perPage;
  const end = start + perPage;
  const pageRows = processed.slice(start, end);

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
    perPage,
    datePreset,
    fromDate,
    toDate,
  ]);

  function canUpdateThisReportLocal(r: Report, user?: any) {
    const role = user?.role as Role | undefined;

    if (r.formType === "STERILITY") {
      const sterilityFieldsUsedOnForm = [
        "testSopNo",
        "dateTested",
        "ftm_turbidity",
        "ftm_observation",
        "ftm_result",
        "scdb_turbidity",
        "scdb_observation",
        "scdb_result",
        "comments",
      ];

      return canShowSterilityUpdateButton(
        role,
        r.status as SterilityReportStatus,
        sterilityFieldsUsedOnForm,
      );
    }

    // MICRO + MICRO_WATER
    const microFieldsUsedOnForm = [
      "testSopNo",
      "dateTested",
      "preliminaryResults",
      "preliminaryResultsDate",
      "tbc_gram",
      "tbc_result",
      "tmy_gram",
      "tmy_result",
      "pathogens",
      "comments",
      "testedBy",
      "testedDate",
    ];

    return canShowUpdateButton(
      role,
      r.status as ReportStatus,
      microFieldsUsedOnForm,
    );
  }

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
    datePreset,
    fromDate,
    toDate,
    setSearchParams,
  ]);

  function goToReportEditor(r: Report) {
    const slug = formTypeToSlug[r.formType] || "micro-mix";
    const returnTo = encodeURIComponent(
      window.location.pathname + window.location.search,
    );

    navigate(`/reports/${slug}/${r.id}?returnTo=${returnTo}`);
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
      formNumber: selected[0]?.formNumber || null,
      reportNumber: selected[0]?.reportNumber || null,
      formType: selected[0]?.formType || null,
      clientCode: selected[0]?.client || null,
    });

    setPrintingBulk(true);
    setIsBulkPrinting(true);
  };

  const selectedReportObjects = selectedIds
    .map((id) => reports.find((r) => r.id === id))
    .filter(Boolean) as Report[];

  const selected = selectedReportObjects;

  const selectedSameKindAndStatus = useMemo(() => {
    if (!selected.length) return false;

    const kind0 = getReportKind(selected[0]);
    const status0 = String(selected[0].status);

    return selected.every(
      (r) => getReportKind(r) === kind0 && String(r.status) === status0,
    );
  }, [selected]);

  const commonNextStatuses = useMemo(() => {
    if (!selected.length) return [];
    if (!selectedSameKindAndStatus) return [];

    return intersectAll(selected.map(getNextStatusesForReport));
  }, [selected, selectedSameKindAndStatus]);

  useEffect(() => {
    const close = () => setBulkMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  async function autoAdvanceAndOpen(r: Report, actor: string) {
    let nextStatus: string | null = null;

    const isSterility = r.formType === "STERILITY";

    if (isSterility) {
      // ✅ sterility uses chemistry-like status names
      if (r.status === "SUBMITTED_BY_CLIENT") {
        nextStatus = "UNDER_TESTING_REVIEW";
        await setStatus(r, nextStatus, "Move to sterility testing");
      } else if (r.status === "CLIENT_NEEDS_CORRECTION") {
        nextStatus = "UNDER_TESTING_REVIEW";
        await setStatus(
          r,
          nextStatus,
          "Move to sterility resubmission testing",
        );
      } else if (r.status === "RESUBMISSION_BY_CLIENT") {
        nextStatus = "UNDER_TESTING_REVIEW";
        await setStatus(r, nextStatus, "Resubmitted by client");
      } else if (r.status === "QA_NEEDS_CORRECTION") {
        nextStatus = "UNDER_TESTING_REVIEW";
        await setStatus(r, nextStatus, `Set by ${actor}`);
      }
    } else {
      // ✅ micro mix / water uses prelim/final workflow
      if (r.status === "SUBMITTED_BY_CLIENT") {
        nextStatus = "UNDER_PRELIMINARY_TESTING_REVIEW";
        await setStatus(r, nextStatus, "Move to prelim testing");
      } else if (r.status === "CLIENT_NEEDS_PRELIMINARY_CORRECTION") {
        nextStatus = "UNDER_PRELIMINARY_TESTING_REVIEW";
        await setStatus(r, nextStatus, "Move to RESUBMISSION");
      } else if (r.status === "PRELIMINARY_APPROVED") {
        nextStatus = "UNDER_FINAL_TESTING_REVIEW";
        await setStatus(r, nextStatus, "Move to final testing");
      } else if (r.status === "PRELIMINARY_RESUBMISSION_BY_CLIENT") {
        nextStatus = "UNDER_PRELIMINARY_TESTING_REVIEW";
        await setStatus(r, nextStatus, "Resubmitted by client");
      } else if (r.status === "CLIENT_NEEDS_FINAL_CORRECTION") {
        nextStatus = "UNDER_FINAL_TESTING_REVIEW";
        await setStatus(r, nextStatus, `Set by ${actor}`);
      } else if (r.status === "QA_NEEDS_PRELIMINARY_CORRECTION") {
        nextStatus = "UNDER_PRELIMINARY_TESTING_REVIEW";
        await setStatus(r, nextStatus, `Set by ${actor}`);
      } else if (r.status === "QA_NEEDS_FINAL_CORRECTION") {
        nextStatus = "UNDER_FINAL_TESTING_REVIEW";
        await setStatus(r, nextStatus, `Set by ${actor}`);
      }
    }

    if (nextStatus) {
      setReports((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, status: nextStatus! } : x)),
      );
    }

    return nextStatus;
  }

  async function startFinalAndOpen(r: Report) {
    const reason =
      window.prompt(
        "Reason for change (21 CFR Part 11):",
        "Start final testing",
      ) || "";

    if (!reason.trim()) {
      toast.error("Reason is required.");
      return;
    }

    const nextStatus = "UNDER_FINAL_TESTING_REVIEW";

    await api(`/reports/${r.id}/change-status`, {
      method: "PATCH",
      body: JSON.stringify({
        status: nextStatus,
        reason,
        // ✅ no eSignPassword
      }),
    });

    // update local list instantly
    setReports((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, status: nextStatus } : x)),
    );

    // goToReportEditor(r);
    openUpdateTarget(r);
  }

  async function startFinal(r: Report) {
    const reason =
      window.prompt(
        "Reason for change (21 CFR Part 11):",
        "Start final testing",
      ) || "";
    if (!reason.trim()) {
      toast.error("Reason is required.");
      return;
    }

    const nextStatus = "UNDER_FINAL_TESTING_REVIEW";

    await api(`/reports/${r.id}/change-status`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus, reason }),
    });

    // update local state
    setReports((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, status: nextStatus } : x)),
    );

    // open editor
    // goToReportEditor(r);
    openUpdateTarget(r);
  }

  // ✅ put this inside MicroDashboard(), before return
  const modalShowStartFinal =
    !!selectedReport &&
    selectedReport.formType !== "STERILITY" &&
    (selectedReport.status === "UNDER_CLIENT_PRELIMINARY_REVIEW" ||
      selectedReport.status === "PRELIMINARY_APPROVED");
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
    datePreset,
    fromDate,
    toDate,
  ]);

  const clearAllFilters = () => {
    setFormFilter(DEFAULT_MICRO_FILTERS.formFilter);
    setStatusFilter(DEFAULT_MICRO_FILTERS.statusFilter);
    setSearchClient(DEFAULT_MICRO_FILTERS.searchClient);
    setSearchReport(DEFAULT_MICRO_FILTERS.searchReport);
    setSearchText(DEFAULT_MICRO_FILTERS.searchText);
    setNumberRangeType(DEFAULT_MICRO_FILTERS.numberRangeType);
    setFormNoFrom(DEFAULT_MICRO_FILTERS.formNoFrom);
    setFormNoTo(DEFAULT_MICRO_FILTERS.formNoTo);
    setReportNoFrom(DEFAULT_MICRO_FILTERS.reportNoFrom);
    setReportNoTo(DEFAULT_MICRO_FILTERS.reportNoTo);
    setSortBy(DEFAULT_MICRO_FILTERS.sortBy);
    setSortDir(DEFAULT_MICRO_FILTERS.sortDir);
    setPerPage(DEFAULT_MICRO_FILTERS.perPage);
    setPage(DEFAULT_MICRO_FILTERS.page);
    setDatePreset(DEFAULT_MICRO_FILTERS.datePreset);
    setFromDate(DEFAULT_MICRO_FILTERS.fromDate);
    setToDate(DEFAULT_MICRO_FILTERS.toDate);

    try {
      localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify(DEFAULT_MICRO_FILTERS),
      );
    } catch {
      // ignore
    }
  };

  // useEffect(() => {
  //   setStatusFilter("ALL");
  // }, [formFilter]);

  useLiveReportStatus(setReports);

  useEffect(() => {
    const nextForm = (searchParams.get("form") as FormFilter) || "ALL";
    const nextStatus = searchParams.get("status") || "ALL";
    const nextClient = searchParams.get("client") || "";
    const nextReport = searchParams.get("report") || "";
    const nextQ = searchParams.get("q") || "";

    const nextSortBy = ((searchParams.get("sortBy") as any) || "dateSent") as
      | "dateSent"
      | "reportNumber";
    const nextSortDir = ((searchParams.get("sortDir") as any) || "desc") as
      | "asc"
      | "desc";

    const nextPp = parseIntSafe(searchParams.get("pp"), 10);
    const nextP = parseIntSafe(searchParams.get("p"), 1);

    const nextDp = ((searchParams.get("dp") as any) || "ALL") as DatePreset;
    const nextFrom = searchParams.get("from") || "";
    const nextTo = searchParams.get("to") || "";

    const nextRangeType =
      (searchParams.get("rangeType") as "FORM" | "REPORT") || "FORM";

    const nextFormFrom = searchParams.get("formFrom") || "";
    const nextFormTo = searchParams.get("formTo") || "";
    const nextReportFrom = searchParams.get("reportFrom") || "";
    const nextReportTo = searchParams.get("reportTo") || "";

    if (nextForm !== formFilter) setFormFilter(nextForm);
    if (nextStatus !== statusFilter) setStatusFilter(nextStatus);
    if (nextClient !== searchClient) setSearchClient(nextClient);
    if (nextReport !== searchReport) setSearchReport(nextReport);
    if (nextQ !== searchText) setSearchText(nextQ);

    if (nextSortBy !== sortBy) setSortBy(nextSortBy);
    if (nextSortDir !== sortDir) setSortDir(nextSortDir);
    if (nextPp !== perPage) setPerPage(nextPp);
    if (nextP !== page) setPage(nextP);

    if (nextDp !== datePreset) setDatePreset(nextDp);
    if (nextFrom !== fromDate) setFromDate(nextFrom);
    if (nextTo !== toDate) setToDate(nextTo);

    if (nextRangeType !== numberRangeType) setNumberRangeType(nextRangeType);
    if (nextFormFrom !== formNoFrom) setFormNoFrom(nextFormFrom);
    if (nextFormTo !== formNoTo) setFormNoTo(nextFormTo);
    if (nextReportFrom !== reportNoFrom) setReportNoFrom(nextReportFrom);
    if (nextReportTo !== reportNoTo) setReportNoTo(nextReportTo);
  }, [searchParams]);

  async function applyBulkStatusChange(toStatus: string) {
    setBulkUpdating(true);

    try {
      await Promise.all(
        selected.map((r) => setStatus(r, toStatus, "Bulk Status Change")),
      );

      const KEEP_STATUSES = new Set<string>([
        ...MICRO_ONLY_STATUSES.filter((s) => s !== "ALL").map(String),
        ...STERILITY_ONLY_STATUSES.filter((s) => s !== "ALL").map(String),
      ]);

      setReports((prev) => {
        const updated = prev.map((x) =>
          selectedIds.includes(x.id)
            ? {
                ...x,
                status: toStatus,
                version: (x.version ?? 0) + 1,
              }
            : x,
        );

        return updated.filter((r) => KEEP_STATUSES.has(String(r.status)));
      });

      logUiEvent({
        action: "UI_BULK_STATUS_CHANGE",
        entity: "Report",
        entityId: selectedIds.join(","),
        details: `Bulk status → ${toStatus} (${selectedIds.length})`,
        meta: {
          reportIds: selectedIds,
          count: selectedIds.length,
          fromStatus: String(selected[0]?.status ?? ""),
          toStatus,
          kind: getReportKind(selected[0]),
        },
        formNumber: selected[0]?.formNumber || null,
        reportNumber: selected[0]?.reportNumber || null,
        formType: selected[0]?.formType || null,
        clientCode: selected[0]?.client || null,
      });

      setSelectedIds([]);
    } finally {
      setBulkUpdating(false);
    }
  }

  const ENABLE_BULK_STATUS = false;

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
    datePreset,
    fromDate,
    toDate,
  ]);

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
    datePreset,
    fromDate,
    toDate,
    perPage,
    pageClamped,
  ]);

  function getTargetsForAction(clicked: Report): Report[] {
    const selected = selectedIds
      .map((id) => reports.find((r) => r.id === id))
      .filter(Boolean) as Report[];

    if (!selected.length) return [clicked];

    const clickedInsideSelection = selected.some((r) => r.id === clicked.id);

    return clickedInsideSelection ? selected : [clicked];
  }

  function canUpdateAnyReport(r: Report, user?: any) {
    return canUpdateThisReportLocal(r, user);
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

  function openSelectedForCorrection(kinds: CorrectionLaunchKind[]) {
    const selected = selectedIds
      .map((id) => reports.find((r) => r.id === id))
      .filter(Boolean) as Report[];

    if (!selected.length) return;

    const hasBlockedStatus = selected.some((r) =>
      isCorrectionFlowStatus(String(r.status)),
    );

    if (hasBlockedStatus) {
      toast.error(
        "Correction is not allowed for reports already in correction/change workflow",
      );
      return;
    }

    if (selected.length === 1) {
      const r = selected[0];
      const slug = formTypeToSlug[(r.formType ?? "").trim()] || "micro-mix";
      const returnTo = location.pathname + location.search;

      const navState = {
        correctionLaunch: true,
        correctionKinds: kinds,
      };

      if (r.formType === "CHEMISTRY_MIX" || r.formType === "COA") {
        navigate(
          `/chemistry-reports/${slug}/${r.id}?returnTo=${encodeURIComponent(returnTo)}`,
          { state: navState },
        );
      } else {
        navigate(
          `/reports/${slug}/${r.id}?returnTo=${encodeURIComponent(returnTo)}`,
          { state: navState },
        );
      }
      return;
    }

    setWorkspaceIds(selected.map((r) => r.id));
    setWorkspaceMode("UPDATE"); // ✅ still UPDATE only
    setWorkspaceLayout("VERTICAL");
    setWorkspaceActiveId(selected[0].id);
    setWorkspaceCorrectionKinds(kinds);
    setWorkspaceOpen(true);
  }

  function clearCorrectionCloseTimer() {
    if (correctionCloseTimerRef.current != null) {
      window.clearTimeout(correctionCloseTimerRef.current);
      correctionCloseTimerRef.current = null;
    }
  }

  function openCorrectionMenu() {
    clearCorrectionCloseTimer();

    if (!selectedIds.length || !correctionBtnRef.current) return;

    const r = correctionBtnRef.current.getBoundingClientRect();
    setCorrectionMenuPos({
      top: r.bottom + 8,
      left: r.right - 220,
    });
    setCorrectionMenuOpen(true);
  }

  function scheduleCloseCorrectionMenu() {
    clearCorrectionCloseTimer();
    correctionCloseTimerRef.current = window.setTimeout(() => {
      setCorrectionMenuOpen(false);
      correctionCloseTimerRef.current = null;
    }, 180);
  }

  function closeCorrectionMenu() {
    clearCorrectionCloseTimer();
    setCorrectionMenuOpen(false);
  }

  function isCorrectionFlowStatus(status: string) {
    const s = String(status).toUpperCase();

    return (
      s.includes("CORRECTION") ||
      s.includes("CHANGE_REQUESTED") ||
      s.includes("UNDER_CHANGE_UPDATE") ||
      s.includes("VOID") ||
      s.includes("LOCKED") ||
      s.includes("DRAFT") ||
      s.includes("UNDER_DRAFT_REVIEW")
    );
  }
  const selectedHasCorrectionLockedStatus = selectedReportObjects.some((r) =>
    isCorrectionFlowStatus(String(r.status)),
  );

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
            {/* <style>
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
            </style> */}

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
          <h1 className="text-2xl font-bold tracking-tight">Micro Dashboard</h1>
          <p className="text-sm text-slate-500">
            Queue of Micro Mix , Micro Water and Sterility reports for micro
            team.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {ENABLE_BULK_STATUS && (
            <div className="relative">
              <button
                type="button"
                disabled={
                  !selectedIds.length ||
                  !selectedSameKindAndStatus ||
                  bulkUpdating ||
                  printingBulk
                }
                onClick={(e) => {
                  e.stopPropagation();
                  setBulkMenuOpen((o) => !o);
                }}
                className={classNames(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition",
                  selectedIds.length && selectedSameKindAndStatus
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
                <div className="absolute right-0 mt-2 w-64 rounded-xl border bg-white shadow-lg ring-1 ring-black/5 z-20">
                  <div className="py-1 text-sm">
                    {commonNextStatuses.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="flex w-full items-center px-3 py-2 text-left hover:bg-slate-100"
                        onClick={async () => {
                          if (bulkUpdating) return;
                          setBulkMenuOpen(false);

                          try {
                            await applyBulkStatusChange(s);
                          } catch (e: any) {
                            toast.error(
                              e?.message || "Bulk status update failed",
                            );
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
          )}

          <div
            className="relative"
            data-correction-menu
            onMouseEnter={() => {
              if (selectedIds.length && !selectedHasCorrectionLockedStatus) {
                openCorrectionMenu();
              }
            }}
            onMouseLeave={() => {
              scheduleCloseCorrectionMenu();
            }}
          >
            <button
              ref={correctionBtnRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!selectedIds.length || selectedHasCorrectionLockedStatus)
                  return;

                if (correctionMenuOpen) {
                  closeCorrectionMenu();
                } else {
                  openCorrectionMenu();
                }
              }}
              disabled={!selectedIds.length || printingBulk}
              className={classNames(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm disabled:opacity-60 disabled:cursor-not-allowed",
                selectedIds.length && !selectedHasCorrectionLockedStatus
                  ? "bg-amber-600 text-white hover:bg-amber-700"
                  : "bg-slate-200 text-slate-500",
              )}
            >
              📝 Corrections ({selectedIds.length})
              <span className="text-xs">▾</span>
            </button>
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
          >
            {refreshing ? <SpinnerDark /> : "↻"}
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Form Type filter */}
      <div className="mb-3 border-b border-slate-200">
        <nav className="-mb-px flex gap-6 text-sm">
          {(["ALL", "MICRO", "MICRO_WATER", "STERILITY"] as const).map((ft) => {
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
                  : ft === "MICRO"
                    ? "Micro"
                    : ft === "STERILITY"
                      ? "Sterility"
                      : "Micro Water"}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Controls */}
      <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
        {/* Status chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {statusOptions.map((s) => (
            <button
              key={String(s)}
              onClick={() => setStatusFilter(String(s))}
              className={classNames(
                "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ring-1 transition",
                statusFilter === String(s)
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
              placeholder="Search client, code, form #, report #, lot #, formula, description, status..."
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
                setSortBy(e.target.value as "dateSent" | "reportNumber")
              }
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="dateSent">Sort: Date Sent</option>
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

        {/* Row 3: Clear */}
        <div className="mt-3 flex justify-end">
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

                    const showStartFinal =
                      r.formType !== "STERILITY" &&
                      (r.status === "UNDER_CLIENT_PRELIMINARY_REVIEW" ||
                        r.status === "PRELIMINARY_APPROVED");

                    const badgeClass =
                      r.formType === "STERILITY"
                        ? (STERILITY_STATUS_COLORS[
                            r.status as SterilityReportStatus
                          ] ??
                          "bg-slate-100 text-slate-800 ring-1 ring-slate-200")
                        : (STATUS_COLORS[r.status as ReportStatus] ??
                          "bg-slate-100 text-slate-800 ring-1 ring-slate-200");

                    return (
                      <tr
                        key={r.id}
                        ref={(el) => {
                          rowRefs.current[r.id] = el;
                        }}
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
                            ) : (
                              getCellValue(r, k)
                            )}
                          </td>
                        ))}

                        <td className="px-4 py-3">
                          <span
                            className={classNames(
                              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ring-1",
                              badgeClass,
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
                                  entity: "Micro Report",
                                  entityId: r.id,
                                  details: `Viewed ${r.formNumber}`,
                                  meta: {
                                    formNumber: r.formNumber,
                                    formType: r.formType,
                                    status: r.status,
                                  },
                                  formNumber: r.formNumber,
                                  reportNumber: r.reportNumber,
                                  formType: r.formType,
                                  clientCode: r.client || null,
                                });

                                // setSelectedReport(r);
                                openViewTarget(r);
                              }}
                              disabled={rowBusy}
                            >
                              View
                            </button>

                            {showStartFinal ? (
                              <button
                                disabled={rowBusy}
                                className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                onClick={async () => {
                                  if (rowBusy) return;
                                  setUpdatingId(r.id);
                                  try {
                                    await startFinal(r);
                                  } catch (e: any) {
                                    toast.error(
                                      e?.message || "Failed to start final",
                                    );
                                  } finally {
                                    setUpdatingId(null);
                                  }
                                }}
                              >
                                {rowBusy ? <Spinner /> : null}
                                {rowBusy ? "Starting..." : "Start Final"}
                              </button>
                            ) : (
                              canUpdateThisReportLocal(r, user) && (
                                <button
                                  disabled={rowBusy}
                                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                  onClick={async () => {
                                    if (rowBusy) return;
                                    setUpdatingId(r.id);
                                    try {
                                      await autoAdvanceAndOpen(r, "micro");
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
                              )
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
                {/* Print this report */}
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
                      details: `Printed ${selectedReport.formNumber}`,
                      meta: {
                        formNumber: selectedReport.formNumber,
                        formType: selectedReport.formType,
                        status: selectedReport.status,
                      },
                      formNumber: selectedReport.formNumber,
                      reportNumber: selectedReport.reportNumber,
                      formType: selectedReport.formType,
                      clientCode: selectedReport.client || null,
                    });
                    setPrintingSingle(true);
                    setSinglePrintReport(selectedReport);
                  }}
                >
                  {printingSingle ? <SpinnerDark /> : "🖨️"}
                  {printingSingle ? "Preparing..." : "Print"}
                </button>

                {modalShowStartFinal ? (
                  <button
                    disabled={modalUpdating}
                    className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                    onClick={async () => {
                      if (modalUpdating) return;
                      setModalUpdating(true);
                      try {
                        const r = selectedReport;
                        setSelectedReport(null);
                        await startFinalAndOpen(r); // or startFinal(r)
                      } catch (e: any) {
                        toast.error(e?.message || "Failed to start final");
                      } finally {
                        setModalUpdating(false);
                      }
                    }}
                  >
                    {modalUpdating ? <Spinner /> : null}
                    {modalUpdating ? "Starting..." : "Start Final"}
                  </button>
                ) : (
                  canUpdateThisReportLocal(selectedReport, user) && (
                    <button
                      disabled={modalUpdating}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                      onClick={async () => {
                        if (modalUpdating) return;
                        setModalUpdating(true);
                        try {
                          const r = selectedReport;
                          setSelectedReport(null);
                          await autoAdvanceAndOpen(r, "micro");
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
                  )
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
              {selectedReport.formType === "MICRO_MIX" ? (
                <MicroMixReportFormView
                  report={selectedReport}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane="FORM"
                />
              ) : selectedReport.formType === "STERILITY" ? (
                <SterilityReportFormView
                  report={selectedReport}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane="FORM"
                />
              ) : selectedReport.formType === "MICRO_MIX_WATER" ? (
                <MicroMixWaterReportFormView
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

      {correctionMenuOpen &&
        correctionMenuPos &&
        createPortal(
          <div
            className="fixed z-[9999] w-56 rounded-xl border bg-white p-1 shadow-lg ring-1 ring-black/5"
            style={{
              top: correctionMenuPos.top,
              left: correctionMenuPos.left,
            }}
            data-correction-menu
            onMouseEnter={() => {
              clearCorrectionCloseTimer();
              setCorrectionMenuOpen(true);
            }}
            onMouseLeave={() => {
              scheduleCloseCorrectionMenu();
            }}
          >
            <button
              type="button"
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => {
                closeCorrectionMenu();
                openSelectedForCorrection(["REQUEST_CHANGE"]);
              }}
            >
              Request Change
            </button>

            <button
              type="button"
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
              onClick={() => {
                closeCorrectionMenu();
                openSelectedForCorrection(["RAISE_CORRECTION"]);
              }}
            >
              Raise Correction
            </button>

            {/* <div className="my-1 border-t" /> */}

            {/* <button
                    type="button"
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-amber-700 hover:bg-amber-50"
                    onClick={() => {
                      closeCorrectionMenu();
                      openSelectedForCorrection([
                        "REQUEST_CHANGE",
                        "RAISE_CORRECTION",
                      ]);
                    }}
                  >
                    Open Both
                  </button> */}
          </div>,
          document.body,
        )}
      <ReportWorkspaceModal
        open={workspaceOpen}
        reports={workspaceReports}
        mode={workspaceMode}
        layout={workspaceLayout}
        activeId={workspaceActiveId}
        correctionKinds={workspaceCorrectionKinds}
        onClose={() => {
          setWorkspaceOpen(false);
          setWorkspaceIds([]);
          setWorkspaceActiveId(null);
          setWorkspaceCorrectionKinds([]);
        }}
        onLayoutChange={(layout) => setWorkspaceLayout(layout)}
        onFocus={(id) => setWorkspaceActiveId(id)}
      />
    </div>
  );
}
