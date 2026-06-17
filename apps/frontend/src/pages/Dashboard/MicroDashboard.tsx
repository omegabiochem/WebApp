import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import MicroMixReportFormView from "../Reports/MicroMixReportFormView";
import { useAuth } from "../../context/AuthContext";
import {
  STATUS_TRANSITIONS as MICRO_STATUS_TRANSITIONS,
  STATUS_COLORS,
  canShowUpdateButton,
  type ReportStatus,
  type Role,
} from "../../utils/microMixReportFormWorkflow";
import { api, API_URL } from "../../lib/api";
import toast from "react-hot-toast";
import MicroMixWaterReportFormView from "../Reports/MicroMixWaterReportFormView";
import { createPortal } from "react-dom";
import {
  formatDate,
  type DatePreset,
} from "../../utils/dashboardsSharedTypes";

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
// import { getReportSearchBlob } from "../../utils/clientDashboardutils";
import {
  COLS,
  getDayCountClass,
  getDaysFromDateSent,
  isTerminalStatus,
  type ColKey,
} from "../../utils/globalUtils";
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

  dateTested?: string | null;

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
const MICRO_ONLY_STATUSES: ("ALL" | ReportStatus)[] = [
  "ALL",
  "SUBMITTED_BY_CLIENT",
  // "CLIENT_NEEDS_PRELIMINARY_CORRECTION",
  // "CLIENT_NEEDS_FINAL_CORRECTION",
  // "UNDER_CLIENT_PRELIMINARY_CORRECTION",
  // "UNDER_CLIENT_FINAL_CORRECTION",
  // "PRELIMINARY_RESUBMISSION_BY_CLIENT",
  // "FINAL_RESUBMISSION_BY_CLIENT",
  "UNDER_CLIENT_PRELIMINARY_REVIEW",
  "UNDER_CLIENT_FINAL_REVIEW",
  "RECEIVED_BY_FRONTDESK",
  "FRONTDESK_ON_HOLD",
  // "FRONTDESK_NEEDS_CORRECTION",
  "UNDER_PRELIMINARY_TESTING_REVIEW",
  "PRELIMINARY_TESTING_ON_HOLD",
  // "PRELIMINARY_TESTING_NEEDS_CORRECTION",
  // "PRELIMINARY_RESUBMISSION_BY_TESTING",
  // "UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW",
  // "FINAL_RESUBMISSION_BY_TESTING",
  "PRELIMINARY_APPROVED",
  "UNDER_FINAL_TESTING_REVIEW",
  "FINAL_TESTING_ON_HOLD",
  // // "FINAL_TESTING_NEEDS_CORRECTION",
  // "UNDER_FINAL_RESUBMISSION_TESTING_REVIEW",
  "UNDER_QA_PRELIMINARY_REVIEW",
  // "QA_NEEDS_PRELIMINARY_CORRECTION",
  "UNDER_QA_FINAL_REVIEW",
  // "QA_NEEDS_FINAL_CORRECTION",
  "UNDER_ADMIN_REVIEW",
  // "ADMIN_NEEDS_CORRECTION",
  "ADMIN_REJECTED",
  // "UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW",
  "FINAL_APPROVED",
  "LOCKED",
  "VOID",

  "UNDER_CHANGE_UPDATE",
  "CORRECTION_REQUESTED",
  "UNDER_CORRECTION_UPDATE",
  "CHANGE_REQUESTED",
];

// Sterility (chemistry-like workflow)
const STERILITY_ONLY_STATUSES: ("ALL" | SterilityReportStatus)[] = [
  "ALL",
  "SUBMITTED_BY_CLIENT",
  // "CLIENT_NEEDS_CORRECTION",
  // "UNDER_CLIENT_CORRECTION",
  // "RESUBMISSION_BY_CLIENT",
  "UNDER_CLIENT_REVIEW",
  "RECEIVED_BY_FRONTDESK",
  "FRONTDESK_ON_HOLD",
  // "FRONTDESK_NEEDS_CORRECTION",
  "UNDER_TESTING_REVIEW",
  "TESTING_ON_HOLD",
  // "TESTING_NEEDS_CORRECTION",
  // "RESUBMISSION_BY_TESTING",
  // "UNDER_RESUBMISSION_TESTING_REVIEW",
  "UNDER_QA_REVIEW",
  // "QA_NEEDS_CORRECTION",
  "UNDER_ADMIN_REVIEW",
  // "ADMIN_NEEDS_CORRECTION",
  "ADMIN_REJECTED",
  // "UNDER_RESUBMISSION_ADMIN_REVIEW",
  "APPROVED",
  "LOCKED",
  "VOID",

  "UNDER_CHANGE_UPDATE",
  "CORRECTION_REQUESTED",
  "UNDER_CORRECTION_UPDATE",
  "CHANGE_REQUESTED",
];

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

type ViewPane = "FORM" | "REPORT" | "ATTACHMENTS";

const defaultViewPane = (): ViewPane => "REPORT";

// -----------------------------
// Bulk print area
// -----------------------------
function BulkPrintArea({
  reports,
  onAfterPrint,
  printPane,
}: {
  reports: Report[];
  onAfterPrint: () => void;
  printPane?: "FORM" | "REPORT";
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
    <div id="bulk-print-root" className="hidden print:block">
      {reports.map((r) => {
        const paneToPrint =
          printPane ??
          (["DRAFT", "UNDER_DRAFT_REVIEW", "SUBMITTED_BY_CLIENT"].includes(
            String(r.status),
          )
            ? "FORM"
            : "REPORT");

        if (r.formType === "MICRO_MIX") {
          return (
            <div key={r.id} className="report-page">
              <MicroMixReportFormView
                report={r as any}
                onClose={() => {}}
                showSwitcher={false}
                isBulkPrint={true}
                isSingleBulk={isSingle}
                pane={paneToPrint}
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
                pane={paneToPrint}
              />
            </div>
          );
        }

        if (r.formType === "STERILITY") {
          return (
            <div key={r.id} className="report-page">
              <SterilityReportFormView
                report={r as any}
                onClose={() => {}}
                showSwitcher={false}
                isBulkPrint={true}
                isSingleBulk={isSingle}
                pane={paneToPrint}
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
  sortBy: "dateSent" as
    | "dateSent"
    | "reportNumber"
    | "dateTested"
    | "createdAt"
    | "updatedAt",
  sortDir: "desc" as "asc" | "desc",
  activeFilter: "ALL",
  perPage: 10,
  page: 1,
  datePreset: "ALL" as DatePreset,
  fromDate: "",
  toDate: "",
};



// -----------------------------
// Component
// -----------------------------
export default function MicroDashboard() {
  const location = useLocation();
  const { user } = useAuth();

  const userKey =
    (user as any)?.id ||
    (user as any)?.userId ||
    (user as any)?.sub ||
    (user as any)?.uid ||
    "micro";
  const [reports, setReports] = useState<Report[]>([]);

  
  const [loading, setLoading] = useState<boolean>(true);

  const [serverTotal, setServerTotal] = useState(0);
const [serverTotalPages, setServerTotalPages] = useState(1);
const [refreshKey, setRefreshKey] = useState(0);


  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const FILTER_STORAGE_KEY = `microDashboardFilters:user:${userKey || "micro"}`;

  const initialFilters = getInitialMicroFilters(
    searchParams,
    FILTER_STORAGE_KEY,
  );

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
            (spSortBy as
              | "dateSent"
              | "reportNumber"
              | "dateTested"
              | "createdAt"
              | "updatedAt") || DEFAULT_MICRO_FILTERS.sortBy,
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
    ? `microDashboardPinned:user:${userKey}`
    : null;

  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pinsHydrated, setPinsHydrated] = useState(false);

  const rowRefs = React.useRef<Record<string, HTMLTableRowElement | null>>({});
  const prevPositions = React.useRef<Record<string, DOMRect>>({});
  const hydratedFromUrlRef = React.useRef(false);

  const statusScrollerRef = React.useRef<HTMLDivElement | null>(null);
  const statusChipRefs = React.useRef<Record<string, HTMLButtonElement | null>>(
    {},
  );

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
    prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev],
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

  const [sortBy, setSortBy] = useState<
    "dateSent" | "reportNumber" | "dateTested" | "createdAt" | "updatedAt"
  >(initialFilters.sortBy as any);

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
  // const [selectedIds, setSelectedIds] = useState<string[]>(
  //   (searchParams.get("sel") || "").split(",").filter(Boolean),
  // );

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [isBulkPrinting, setIsBulkPrinting] = useState(false);
  const [selectedViewPane, setSelectedViewPane] = useState<ViewPane>("REPORT");

  const [singlePrintJob, setSinglePrintJob] = useState<{
    report: Report;
    pane: "FORM" | "REPORT";
  } | null>(null);

  // ✅ Loading guards for buttons
  const [printingBulk, setPrintingBulk] = useState(false);
  const [printingSingle, setPrintingSingle] = useState(false);

  const [modalUploading, setModalUploading] = useState(false);
  const modalUploadInputRef = React.useRef<HTMLInputElement | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [attachmentRefreshKey, setAttachmentRefreshKey] = useState(0);

  const defaultAttachmentVisibility =
    user?.role === "CLIENT" ? "CLIENT_ONLY" : "LAB_ONLY";

  const [attachmentVisibility] = useState<"ALL" | "LAB_ONLY" | "CLIENT_ONLY">(
    defaultAttachmentVisibility,
  );

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

  const fetchMicroDashboardReports = async () => {
  const params = new URLSearchParams();

  params.set("page", String(page));
  params.set("perPage", String(perPage));

  params.set("form", formFilter);
  params.set("status", String(statusFilter));

  params.set("sortBy", sortBy);
  params.set("sortDir", sortDir);

  const dateField =
    sortBy === "dateTested"
      ? "dateTested"
      : sortBy === "createdAt"
        ? "createdAt"
        : sortBy === "updatedAt"
          ? "updatedAt"
          : "dateSent";

  params.set("dateField", dateField);
  params.set("rangeType", numberRangeType);

  if (searchClient.trim()) params.set("client", searchClient.trim());
  if (searchReport.trim()) params.set("report", searchReport.trim());
  if (searchText.trim()) params.set("q", searchText.trim());

  const dateRange = getPresetRange(datePreset, fromDate, toDate);

  if (dateRange.from) params.set("from", dateRange.from);
  if (dateRange.to) params.set("to", dateRange.to);

  if (formNoFrom.trim()) params.set("formFrom", formNoFrom.trim());
  if (formNoTo.trim()) params.set("formTo", formNoTo.trim());

  if (reportNoFrom.trim()) params.set("reportFrom", reportNoFrom.trim());
  if (reportNoTo.trim()) params.set("reportTo", reportNoTo.trim());

  return api<{
    rows: Report[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  }>(`/micro-dashboard/reports?${params.toString()}`);
};


useEffect(() => {
  let abort = false;

  async function loadMicroDashboardReports() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetchMicroDashboardReports();

      if (abort) return;

      setReports(res.rows);
      setServerTotal(res.total);
      setServerTotalPages(res.totalPages);
    } catch (e: any) {
      if (!abort) setError(e?.message ?? "Failed to fetch micro dashboard");
    } finally {
      if (!abort) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  loadMicroDashboardReports();

  return () => {
    abort = true;
  };
}, [
  page,
  perPage,
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
  datePreset,
  fromDate,
  toDate,
  refreshKey,
]);

  
function toDateOnlyLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getPresetRange(
  preset: DatePreset,
  customFrom: string,
  customTo: string,
) {
  const now = new Date();

  const range = (from: Date, to: Date) => ({
    from: toDateOnlyLocal(from),
    to: toDateOnlyLocal(to),
  });

  switch (preset) {
    case "ALL":
      return { from: "", to: "" };

    case "CUSTOM":
      return { from: customFrom, to: customTo };

    case "TODAY":
      return range(now, now);

    case "YESTERDAY": {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return range(y, y);
    }

    case "LAST_7_DAYS": {
      const from = new Date(now);
      from.setDate(now.getDate() - 6);
      return range(from, now);
    }

    case "LAST_30_DAYS": {
      const from = new Date(now);
      from.setDate(now.getDate() - 29);
      return range(from, now);
    }

    case "THIS_MONTH": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return range(from, to);
    }

    case "LAST_MONTH": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return range(from, to);
    }

    case "THIS_YEAR": {
      const from = new Date(now.getFullYear(), 0, 1);
      const to = new Date(now.getFullYear(), 11, 31);
      return range(from, to);
    }

    case "LAST_YEAR": {
      const from = new Date(now.getFullYear() - 1, 0, 1);
      const to = new Date(now.getFullYear() - 1, 11, 31);
      return range(from, to);
    }

    default:
      return { from: "", to: "" };
  }
}
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


  useEffect(() => {
    if (!statusOptions.includes(statusFilter as any)) {
      setStatusFilter("ALL");
    }
  }, [statusOptions, statusFilter]);



  // pagination
const displayRows = useMemo(() => {
  return [...reports].sort((a, b) => {
    const aPinned = pinnedIds.includes(a.id) ? 1 : 0;
    const bPinned = pinnedIds.includes(b.id) ? 1 : 0;

    if (aPinned !== bPinned) {
      return bPinned - aPinned;
    }

    return 0;
  });
}, [reports, pinnedIds]);

const total = serverTotal;
const totalPages = serverTotalPages;
const pageClamped = Math.min(page, totalPages);
const start = total === 0 ? 0 : (pageClamped - 1) * perPage;
const end = start + displayRows.length;
const pageRows = displayRows;

React.useLayoutEffect(() => {
  if (loading) return;

  const nextPositions: Record<string, DOMRect> = {};

  for (const r of pageRows) {
    const el = rowRefs.current[r.id];

    if (!el) continue;

    const next = el.getBoundingClientRect();
    const prev = prevPositions.current[r.id];

    nextPositions[r.id] = next;

    if (!prev) continue;

    const dy = prev.top - next.top;

    if (Math.abs(dy) < 1) continue;

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

  prevPositions.current = nextPositions;
}, [pageRows, loading, selectedCols]);


useEffect(() => {
  rowRefs.current = {};
  prevPositions.current = {};
}, [
  page,
  perPage,
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
  sortBy,
  sortDir,
  refreshKey,
]);

  function saveDashboardPage(nextPage: number) {
    const sp = new URLSearchParams(searchParams);

    if (nextPage > 1) {
      sp.set("p", String(nextPage));
    } else {
      sp.delete("p");
    }

    sessionStorage.setItem("/microDashboard:lastSearch", `?${sp.toString()}`);
    sessionStorage.setItem("lastSearch:/microDashboard", `?${sp.toString()}`);

    setSearchParams(sp, { replace: true });
    setPage(nextPage);
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
    datePreset,
    fromDate,
    toDate,
  ]);

  // const didHydrateRef = React.useRef(false);

  // useEffect(() => {
  //   if (!hydratedFromUrlRef.current) return;

  //   if (!didHydrateRef.current) {
  //     didHydrateRef.current = true;
  //     return;
  //   }

  //   setPage(1);
  // }, [
  //   formFilter,
  //   statusFilter,
  //   searchClient,
  //   searchReport,
  //   searchText,
  //   numberRangeType,
  //   formNoFrom,
  //   formNoTo,
  //   reportNoFrom,
  //   reportNoTo,
  //   perPage,
  //   datePreset,
  //   fromDate,
  //   toDate,
  // ]);

  function canUpdateThisReportLocal(r: Report, user?: any) {
    if (isTerminalStatus(r.status)) return false;

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
    if (!hydratedFromUrlRef.current) return;

    const sp = new URLSearchParams();

    if (formFilter !== "ALL") sp.set("form", formFilter);
    sp.set("status", String(statusFilter));

    if (searchClient.trim()) sp.set("client", searchClient.trim());
    if (searchReport.trim()) sp.set("report", searchReport.trim());
    if (searchText.trim()) sp.set("q", searchText.trim());

    sp.set("sortBy", sortBy);
    sp.set("sortDir", sortDir);
    sp.set("pp", String(perPage));
    // sp.set("p", String(pageClamped));

    if (page !== 1) {
      sp.set("p", String(page));
    } else {
      sp.delete("p");
    }
    sp.set("dp", datePreset);

    if (fromDate) sp.set("from", fromDate);
    if (toDate) sp.set("to", toDate);

    sp.set("rangeType", numberRangeType);

    if (formNoFrom.trim()) sp.set("formFrom", formNoFrom.trim());
    if (formNoTo.trim()) sp.set("formTo", formNoTo.trim());
    if (reportNoFrom.trim()) sp.set("reportFrom", reportNoFrom.trim());
    if (reportNoTo.trim()) sp.set("reportTo", reportNoTo.trim());

    if (sp.toString() !== searchParams.toString()) {
      setSearchParams(sp, { replace: true });
    }
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
    page,
    datePreset,
    fromDate,
    toDate,
    searchParams,
    setSearchParams,
  ]);

  useEffect(() => {
    const next = getInitialMicroFilters(searchParams, FILTER_STORAGE_KEY);

    setFormFilter(next.formFilter);
    setStatusFilter(next.statusFilter);
    setSearchClient(next.searchClient);
    setSearchReport(next.searchReport);
    setSearchText(next.searchText);

    setNumberRangeType(next.numberRangeType);
    setFormNoFrom(next.formNoFrom);
    setFormNoTo(next.formNoTo);
    setReportNoFrom(next.reportNoFrom);
    setReportNoTo(next.reportNoTo);

    setSortBy(next.sortBy);
    setSortDir(next.sortDir);
    setPerPage(next.perPage);
    setPage(next.page);

    setDatePreset(next.datePreset);
    setFromDate(next.fromDate);
    setToDate(next.toDate);

    hydratedFromUrlRef.current = true;
  }, [searchParams, FILTER_STORAGE_KEY]);
  useEffect(() => {
    statusChipRefs.current = {};
  }, [formFilter]);

  useEffect(() => {
    if (!hydratedFromUrlRef.current) return;

    const tid = window.setTimeout(() => {
      const chip = statusChipRefs.current[String(statusFilter)];
      if (!chip) return;

      chip.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }, 80);

    return () => window.clearTimeout(tid);
  }, [statusFilter, statusOptions, formFilter, searchParams]);

  // function goToReportEditor(r: Report) {
  //   const slug = formTypeToSlug[r.formType] || "micro-mix";
  //   const returnTo = encodeURIComponent(
  //     window.location.pathname + window.location.search,
  //   );

  //   navigate(`/reports/${slug}/${r.id}?returnTo=${returnTo}`);
  // }

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
    page,
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
      setSelectedViewPane(defaultViewPane());
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

    // if (targets.length <= 1) {
    //   goToReportEditor(clicked);
    //   return;
    // }

    setWorkspaceIds(targets.map((r) => r.id));
    setWorkspaceMode("UPDATE");
    setWorkspaceLayout("VERTICAL");
    setWorkspaceActiveId(clicked.id);
    setWorkspaceOpen(true);
  }


  function handleWorkspaceReportChanged(updated: any) {
  if (!updated?.id) return;

  setReports((prev) =>
    prev.map((r) =>
      r.id === updated.id
        ? {
            ...r,
            ...updated,
            status: updated.status ?? r.status,
            reportNumber: updated.reportNumber ?? r.reportNumber,
            version:
              typeof updated.version === "number"
                ? updated.version
                : (r.version ?? 0) + 1,
          }
        : r,
    ),
  );
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

  async function uploadAttachmentForReport(r: Report, file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("source", "manual-upload");
    form.append("createdBy", user?.name || user?.role || "micro");
    form.append("kind", "SIGNED_FORM");
    form.append("meta", JSON.stringify({ via: "micro-dashboard-modal" }));
    form.append("visibility", attachmentVisibility);

    const token = localStorage.getItem("token");

    const res = await fetch(`${API_URL}/reports/${r.id}/attachments`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
    });

    if (!res.ok) {
      throw new Error(`Upload failed (${res.status})`);
    }
  }

  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  return (
    <div className="p-6">
      {(isBulkPrinting || !!singlePrintJob) &&
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
                isBulkPrinting
                  ? selectedReportObjects
                  : [singlePrintJob?.report!]
              }
              printPane={isBulkPrinting ? undefined : singlePrintJob!.pane}
              onAfterPrint={() => {
                if (isBulkPrinting) setIsBulkPrinting(false);
                if (singlePrintJob) setSinglePrintJob(null);
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
  setRefreshKey((x) => x + 1);
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
        <div
          ref={statusScrollerRef}
          className="flex items-center gap-2 overflow-x-auto pb-2 scroll-smooth"
        >
          {statusOptions.map((s) => (
            <button
              key={String(s)}
              ref={(el) => {
                statusChipRefs.current[String(s)] = el;
              }}
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
          <div className="lg:col-span-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              {statusOptions.map((s) => (
                <option key={String(s)} value={String(s)}>
                  {niceStatus(String(s))}
                </option>
              ))}
            </select>
          </div>
          <div className="relative lg:col-span-8">
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

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 lg:col-span-6">
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(
                  e.target.value as
                    | "dateSent"
                    | "reportNumber"
                    | "dateTested"
                    | "createdAt"
                    | "updatedAt",
                )
              }
              className="w-full rounded-lg border bg-white px-5 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="dateSent"> Date Sent</option>
              <option value="reportNumber"> Report #</option>
              <option value="dateTested"> Date Tested</option>
              <option value="createdAt"> Created At</option>
              <option value="updatedAt"> Updated At</option>
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

                  <th className="bg-slate-50 px-4 py-3 font-medium whitespace-nowrap">
                    {/* Days */}
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

                        <td className=" py-3 whitespace-nowrap">
                          {(() => {
                            const days = getDaysFromDateSent(r.dateSent);

                            return (
                              <span
                                className={classNames(
                                  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                                  getDayCountClass(days),
                                )}
                                title={
                                  r.dateSent
                                    ? `Date Sent: ${formatDate(r.dateSent)}`
                                    : "No Date Sent"
                                }
                              >
                                {days == null ? "-" : `${days}d`}
                              </span>
                            );
                          })()}
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
              <button
                className="rounded-lg border px-3 py-1.5 disabled:opacity-50"
                onClick={() => saveDashboardPage(Math.max(1, pageClamped - 1))}
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
                  saveDashboardPage(Math.min(totalPages, pageClamped + 1))
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
          <div className="h-[90vh] max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl flex flex-col">
            <div className="sticky top-0 z-10 relative flex items-center justify-between border-b bg-white px-6 py-4">
              <h2 className="text-lg font-semibold">
                Report ({displayReportNo(selectedReport)})
              </h2>

              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 no-print">
                <div className="inline-flex items-center rounded-full border border-slate-300 bg-white p-1 shadow-sm">
                  {(["FORM", "REPORT", "ATTACHMENTS"] as ViewPane[]).map(
                    (p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setSelectedViewPane(p)}
                        className={classNames(
                          "rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200",
                          selectedViewPane === p
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-100 hover:text-blue-600",
                        )}
                      >
                        {p === "ATTACHMENTS"
                          ? "Attachments"
                          : p[0] + p.slice(1).toLowerCase()}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  ref={modalUploadInputRef}
                  type="file"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file || !selectedReport) return;

                    setModalUploading(true);
                    try {
                      await uploadAttachmentForReport(selectedReport, file);
                      toast.success("Uploaded!");
                      setAttachmentRefreshKey((k) => k + 1);
                      setSelectedViewPane("ATTACHMENTS");
                    } catch (err: any) {
                      toast.error(err?.message || "Upload failed");
                    } finally {
                      setModalUploading(false);
                    }
                  }}
                />

                <button
                  type="button"
                  disabled={modalUploading || !selectedReport?.id}
                  onClick={() => modalUploadInputRef.current?.click()}
                  className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {modalUploading ? <Spinner /> : "⬆️"}
                  {modalUploading ? "Uploading..." : "Upload"}
                </button>
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
                    setSinglePrintJob({
                      report: selectedReport,
                      pane: selectedViewPane === "FORM" ? "FORM" : "REPORT",
                    });
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

            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              {selectedReport.formType === "MICRO_MIX" ? (
                <MicroMixReportFormView
                  key={`${selectedReport.id}-${selectedViewPane}-${attachmentRefreshKey}`}
                  report={selectedReport}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane={selectedViewPane}
                  onPaneChange={setSelectedViewPane}
                />
              ) : selectedReport.formType === "STERILITY" ? (
                <SterilityReportFormView
                  key={`${selectedReport.id}-${selectedViewPane}-${attachmentRefreshKey}`}
                  report={selectedReport}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane={selectedViewPane}
                  onPaneChange={setSelectedViewPane}
                />
              ) : selectedReport.formType === "MICRO_MIX_WATER" ? (
                <MicroMixWaterReportFormView
                  key={`${selectedReport.id}-${selectedViewPane}-${attachmentRefreshKey}`}
                  report={selectedReport}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane={selectedViewPane}
                  onPaneChange={setSelectedViewPane}
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
         onReportChanged={handleWorkspaceReportChanged}
      />
    </div>
  );
}
