import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import MicroMixReportFormView from "../Reports/MicroMixReportFormView";
import { useAuth } from "../../context/AuthContext";
import type {
  Role,
  ReportStatus,
} from "../../utils/microMixReportFormWorkflow";
import {
  STATUS_TRANSITIONS as MICRO_STATUS_TRANSITIONS,
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
  STATUS_TRANSITIONS as CHEM_STATUS_TRANSITIONS,
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

import {
  COLS,
  getReportSearchBlob,
  parseIntSafe,
  type ColKey,
} from "../../utils/clientDashboardutils";
import COAReportFormView from "../Reports/COAReportFormView";
import {
  canShowSterilityUpdateButton,
  STERILITY_STATUS_COLORS,
  STERILITY_STATUS_TRANSITIONS,
  type SterilityReportStatus,
} from "../../utils/SterilityReportFormWorkflow";
import ReportWorkspaceModal from "../../utils/ReportWorkspaceModal";

import { Eye, EyeOff, Pin } from "lucide-react";

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
  reportNumber: string;
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

  _searchBlob?: string;
};

// A status filter can be micro OR chemistry OR "ALL"
type DashboardStatus = "ALL" | ReportStatus | ChemistryReportStatus;

// Micro client statuses (what you already had)
const CLIENT_MICRO_STATUSES: DashboardStatus[] = [
  "ALL",
  "FINAL_APPROVED",
  "DRAFT",
  "UNDER_DRAFT_REVIEW",
  "SUBMITTED_BY_CLIENT",
  "UNDER_CLIENT_PRELIMINARY_REVIEW",
  "UNDER_CLIENT_FINAL_REVIEW",
  "UNDER_CHANGE_UPDATE",
  "CORRECTION_REQUESTED",
  "UNDER_CORRECTION_UPDATE",
  "CHANGE_REQUESTED",
  "CLIENT_NEEDS_PRELIMINARY_CORRECTION",
  "CLIENT_NEEDS_FINAL_CORRECTION",
  "UNDER_CLIENT_PRELIMINARY_CORRECTION",
  "UNDER_CLIENT_FINAL_CORRECTION",
  "PRELIMINARY_RESUBMISSION_BY_CLIENT",
  "FINAL_RESUBMISSION_BY_CLIENT",
  "LOCKED",
  "VOID",
];

// Chemistry client statuses – adjust to your real flow
const CLIENT_CHEM_STATUSES: DashboardStatus[] = [
  "ALL",
  "APPROVED",
  "DRAFT",
  "UNDER_DRAFT_REVIEW",
  "UNDER_CLIENT_REVIEW",
  "SUBMITTED_BY_CLIENT",
  "UNDER_CHANGE_UPDATE",
  "CORRECTION_REQUESTED",
  "UNDER_CORRECTION_UPDATE",
  "CHANGE_REQUESTED",
  "CLIENT_NEEDS_CORRECTION",
  "UNDER_CLIENT_CORRECTION",
  "RESUBMISSION_BY_CLIENT",
  "LOCKED",
  "VOID",
];
type BulkWorkflowGroup = "MICRO" | "STERILITY" | "CHEMISTRY" | "COA";

function getBulkWorkflowGroup(r: Report): BulkWorkflowGroup {
  if (r.formType === "STERILITY") return "STERILITY";
  if (r.formType === "COA") return "COA";
  if (r.formType === "CHEMISTRY_MIX") return "CHEMISTRY";
  return "MICRO";
}

function getNextStatusesForReport(r: Report): string[] {
  const s = String(r.status);

  if (r.formType === "STERILITY") {
    return (STERILITY_STATUS_TRANSITIONS?.[s as SterilityReportStatus]?.next ??
      []) as string[];
  }

  if (r.formType === "CHEMISTRY_MIX" || r.formType === "COA") {
    return (CHEM_STATUS_TRANSITIONS?.[s as ChemistryReportStatus]?.next ??
      []) as string[];
  }

  return (MICRO_STATUS_TRANSITIONS?.[s as ReportStatus]?.next ??
    []) as string[];
}

function intersectAll(lists: string[][]): string[] {
  if (!lists.length) return [];
  const set = new Set(lists[0]);

  for (let i = 1; i < lists.length; i++) {
    const current = new Set(lists[i]);
    for (const value of Array.from(set)) {
      if (!current.has(value)) set.delete(value);
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
  CHEMISTRY_MIX: "chemistry-mix",
  COA: "coa",
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
  // const isMicro =
  //   r.formType === "MICRO_MIX" ||
  //   r.formType === "MICRO_MIX_WATER" ||
  //   r.formType === "STERILITY";
  // if (!isMicro) return false;
  if (user?.role !== "CLIENT") return false;
  if (getFormPrefix(r.formNumber) !== user?.clientCode) return false;

  if (r.formType === "STERILITY") {
    const sterilityFieldsUsedOnForm = [
      "client",
      "dateSent",
      "typeOfTest",
      "sampleType",
      "formulaNo",
      "description",
      "lotNo",
      "manufactureDate",
      "comments",
    ];

    return canShowSterilityUpdateButton(
      user?.role,
      r.status as SterilityReportStatus,
      sterilityFieldsUsedOnForm,
    );
  }

  const isMicro =
    r.formType === "MICRO_MIX" || r.formType === "MICRO_MIX_WATER";

  if (!isMicro) return false;

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
  const isChemistry = r.formType === "CHEMISTRY_MIX" || r.formType === "COA";

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
    "coaRows",
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
        } else if (r.formType === "COA") {
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

const DEFAULT_CLIENT_FILTERS = {
  formFilter: "ALL" as
    | "ALL"
    | "MICRO"
    | "MICROWATER"
    | "STERILITY"
    | "CHEMISTRY"
    | "COA",
  statusFilter: "ALL" as DashboardStatus,
  searchClient: "",
  searchReport: "",
  searchText: "",
  numberRangeType: "FORM" as "FORM" | "REPORT",
  formNoFrom: "",
  formNoTo: "",
  reportNoFrom: "",
  reportNoTo: "",
  sortBy: "formNumber" as "dateSent" | "formNumber" | "createdAt" | "updatedAt",
  sortDir: "desc" as "asc" | "desc",
  perPage: 10,
  page: 1,
  datePreset: "TODAY" as DatePreset,
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

function getInitialClientFilters(searchParams: URLSearchParams) {
  try {
    const spForm = searchParams.get("form");
    const spStatus = searchParams.get("status");
    const spClient = searchParams.get("client");
    const spReport = searchParams.get("report");
    const spQ = searchParams.get("q");

    const spSortBy = searchParams.get("sortBy");
    const spSortDir = searchParams.get("sortDir");

    const spP = searchParams.get("p");
    const spPp = searchParams.get("pp");

    const spDp = searchParams.get("dp");
    const spFrom = searchParams.get("from");
    const spTo = searchParams.get("to");

    const spRangeType = searchParams.get("rangeType");
    const spFormFrom = searchParams.get("formFrom");
    const spFormTo = searchParams.get("formTo");
    const spReportFrom = searchParams.get("reportFrom");
    const spReportTo = searchParams.get("reportTo");

    const hasUrlFilters =
      spForm ||
      spStatus ||
      spClient ||
      spReport ||
      spQ ||
      spSortBy ||
      spSortDir ||
      spP ||
      spPp ||
      spDp ||
      spFrom ||
      spRangeType ||
      spFormFrom ||
      spFormTo ||
      spReportFrom ||
      spReportTo ||
      spTo;

    if (hasUrlFilters) {
      return {
        formFilter:
          (spForm as typeof DEFAULT_CLIENT_FILTERS.formFilter) ||
          DEFAULT_CLIENT_FILTERS.formFilter,
        statusFilter:
          (spStatus as DashboardStatus) || DEFAULT_CLIENT_FILTERS.statusFilter,
        searchClient: spClient || DEFAULT_CLIENT_FILTERS.searchClient,
        searchReport: spReport || DEFAULT_CLIENT_FILTERS.searchReport,
        searchText: spQ || DEFAULT_CLIENT_FILTERS.searchText,
        sortBy:
          (spSortBy as "dateSent" | "formNumber" | "createdAt" | "updatedAt") ||
          DEFAULT_CLIENT_FILTERS.sortBy,
        sortDir:
          (spSortDir as "asc" | "desc") || DEFAULT_CLIENT_FILTERS.sortDir,
        perPage: parseIntSafe(spPp, DEFAULT_CLIENT_FILTERS.perPage),
        page: parseIntSafe(spP, DEFAULT_CLIENT_FILTERS.page),
        datePreset: (spDp as DatePreset) || DEFAULT_CLIENT_FILTERS.datePreset,
        fromDate:
          (spDp as DatePreset) === "CUSTOM"
            ? spFrom || DEFAULT_CLIENT_FILTERS.fromDate
            : DEFAULT_CLIENT_FILTERS.fromDate,
        toDate:
          (spDp as DatePreset) === "CUSTOM"
            ? spTo || DEFAULT_CLIENT_FILTERS.toDate
            : DEFAULT_CLIENT_FILTERS.toDate,
        numberRangeType:
          (spRangeType as "FORM" | "REPORT") ||
          DEFAULT_CLIENT_FILTERS.numberRangeType,
        formNoFrom: spFormFrom || DEFAULT_CLIENT_FILTERS.formNoFrom,
        formNoTo: spFormTo || DEFAULT_CLIENT_FILTERS.formNoTo,
        reportNoFrom: spReportFrom || DEFAULT_CLIENT_FILTERS.reportNoFrom,
        reportNoTo: spReportTo || DEFAULT_CLIENT_FILTERS.reportNoTo,
      };
    }
  } catch {
    // ignore
  }

  return DEFAULT_CLIENT_FILTERS;
}
// -----------------------------
// Component
// -----------------------------

export default function ClientDashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const initialFilters = getInitialClientFilters(searchParams);

  const [searchClient, setSearchClient] = useState(initialFilters.searchClient);

  const [searchReport, setSearchReport] = useState(initialFilters.searchReport);

  const [search, setSearch] = useState(initialFilters.searchText);

  const [sortBy, setSortBy] = useState<
    "dateSent" | "formNumber" | "createdAt" | "updatedAt"
  >(initialFilters.sortBy);

  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    initialFilters.sortDir,
  );

  const [page, setPage] = useState(initialFilters.page);
  const [perPage, setPerPage] = useState(initialFilters.perPage);

  const [formFilter, setFormFilter] = useState<
    "ALL" | "MICRO" | "MICROWATER" | "STERILITY" | "CHEMISTRY" | "COA"
  >(initialFilters.formFilter);

  const [statusFilter, setStatusFilter] = useState<DashboardStatus>(
    initialFilters.statusFilter,
  );

  const [datePreset, setDatePreset] = useState<DatePreset>(
    initialFilters.datePreset,
  );

  const [fromDate, setFromDate] = useState(initialFilters.fromDate);
  const [toDate, setToDate] = useState(initialFilters.toDate);

  const [numberRangeType, setNumberRangeType] = useState<"FORM" | "REPORT">(
    initialFilters.numberRangeType,
  );

  const [formNoFrom, setFormNoFrom] = useState(initialFilters.formNoFrom);
  const [formNoTo, setFormNoTo] = useState(initialFilters.formNoTo);
  const [reportNoFrom, setReportNoFrom] = useState(initialFilters.reportNoFrom);
  const [reportNoTo, setReportNoTo] = useState(initialFilters.reportNoTo);

  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  // ✅ multiple selection & bulk print
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkPrinting, setIsBulkPrinting] = useState(false);

  // ✅ NEW: single-report print from modal
  const [singlePrintReport, setSinglePrintReport] = useState<Report | null>(
    null,
  );

  const statusOptions =
    formFilter === "CHEMISTRY" ||
    formFilter === "COA" ||
    formFilter === "STERILITY"
      ? CLIENT_CHEM_STATUSES
      : CLIENT_MICRO_STATUSES;

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

  const colBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const [colPos, setColPos] = useState<{ top: number; left: number } | null>(
    null,
  );

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

  const PIN_STORAGE_KEY = userKey
    ? `clientDashboardPinned:user:${userKey}`
    : null;

  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pinsHydrated, setPinsHydrated] = useState(false);

  const rowRefs = React.useRef<Record<string, HTMLTableRowElement | null>>({});
  const prevPositions = React.useRef<Record<string, DOMRect>>({});

  type StatusActionModalState = {
    open: boolean;
    action: "VOID_SELECTED" | null;
    reason: string;
    password: string;
    submitting: boolean;
    error: string | null;
  };

  const [statusModal, setStatusModal] = useState<StatusActionModalState>({
    open: false,
    action: null,
    reason: "",
    password: "",
    submitting: false,
    error: null,
  });

  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);

  const [showVoidPassword, setShowVoidPassword] = useState(false);

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
    if (!COL_STORAGE_KEY) return;
    if (!colsHydrated) return; // ✅ don't overwrite before loading
    localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(selectedCols));
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

  const reportsWithSearch = useMemo(() => {
    return reports.map((r) => ({
      ...r,
      _searchBlob: getReportSearchBlob(r),
    }));
  }, [reports]);

  // Derived table data
  const processed = useMemo(() => {
    // 1) form type filter
    const byForm =
      formFilter === "ALL"
        ? reportsWithSearch
        : reportsWithSearch.filter((r) => {
            if (formFilter === "MICRO") return r.formType === "MICRO_MIX";
            if (formFilter === "MICROWATER")
              return r.formType === "MICRO_MIX_WATER";
            if (formFilter === "STERILITY") return r.formType === "STERILITY";
            if (formFilter === "CHEMISTRY")
              return r.formType === "CHEMISTRY_MIX";
            if (formFilter === "COA") return r.formType === "COA";
            return true;
          });

    // 2) status filter – compare as strings so enums from both worlds work
    const byStatus =
      statusFilter === "ALL"
        ? byForm
        : byForm.filter((r) => String(r.status) === String(statusFilter));

    // 3) search
    const bySearchClient = searchClient.trim()
      ? byStatus.filter((r) => {
          const q = searchClient.toLowerCase();
          return (r.client || "").toLowerCase().includes(q);
        })
      : byStatus;

    const bySearchReport = searchReport.trim()
      ? bySearchClient.filter((r) => {
          const q = searchReport.toLowerCase();
          return String(r.formNumber || "")
            .toLowerCase()
            .includes(q);
        })
      : bySearchClient;

    const bySearch = search.trim()
      ? bySearchReport.filter((r) => {
          const q = search.trim().toLowerCase();
          return r._searchBlob.includes(q);
        })
      : bySearchReport;

    const byNumberRange =
      numberRangeType === "FORM"
        ? formNoFrom.trim() || formNoTo.trim()
          ? bySearch.filter((r) =>
              inRange(
                extractYearAndSequence(r.formNumber).sequence,
                formNoFrom,
                formNoTo,
              ),
            )
          : bySearch
        : reportNoFrom.trim() || reportNoTo.trim()
          ? bySearch.filter((r) =>
              inRange(
                extractYearAndSequence(r.reportNumber).sequence,
                reportNoFrom,
                reportNoTo,
              ),
            )
          : bySearch;

    const dateField =
      sortBy === "createdAt"
        ? "createdAt"
        : sortBy === "updatedAt"
          ? "updatedAt"
          : "dateSent";

    const byDate = byNumberRange.filter((r) =>
      matchesDateRange(
        (r as any)[dateField] ?? null,
        fromDate || undefined,
        toDate || undefined,
      ),
    );

    // 4) sort (same as you already have)
    const sorted = [...byDate].sort((a, b) => {
      const aPinned = pinnedIds.includes(a.id) ? 1 : 0;
      const bPinned = pinnedIds.includes(b.id) ? 1 : 0;

      if (aPinned !== bPinned) {
        return bPinned - aPinned; // pinned first
      }

      if (sortBy === "formNumber") {
        const aN = (a.formNumber || "").toLowerCase();
        const bN = (b.formNumber || "").toLowerCase();
        return sortDir === "asc" ? aN.localeCompare(bN) : bN.localeCompare(aN);
      }

      if (sortBy === "createdAt") {
        const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return sortDir === "asc" ? aT - bT : bT - aT;
      }

      if (sortBy === "updatedAt") {
        const aT = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bT = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return sortDir === "asc" ? aT - bT : bT - aT;
      }

      const aT = a.dateSent ? new Date(a.dateSent).getTime() : 0;
      const bT = b.dateSent ? new Date(b.dateSent).getTime() : 0;
      return sortDir === "asc" ? aT - bT : bT - aT;
    });

    return sorted;
  }, [
    reports,
    reportsWithSearch,
    formFilter,
    statusFilter,
    searchClient,
    searchReport,
    search,
    sortBy,
    sortDir,
    fromDate,
    toDate,
    numberRangeType,
    formNoFrom,
    formNoTo,
    reportNoFrom,
    reportNoTo,
    pinnedIds,
  ]);

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
  }, [
    formFilter,
    statusFilter,
    searchClient,
    searchReport,
    search,
    sortBy,
    sortDir,
    perPage,
    datePreset,
    fromDate,
    toDate,
  ]);

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

  useEffect(() => {
    const sp = new URLSearchParams();

    sp.set("form", formFilter);
    sp.set("status", String(statusFilter));

    if (searchClient.trim()) sp.set("client", searchClient.trim());
    if (searchReport.trim()) sp.set("report", searchReport.trim());
    if (search.trim()) sp.set("q", search.trim());

    sp.set("sortBy", sortBy);
    sp.set("sortDir", sortDir);

    sp.set("pp", String(perPage));
    sp.set("p", String(pageClamped));

    sp.set("dp", datePreset);
    if (datePreset === "CUSTOM") {
      if (fromDate) sp.set("from", fromDate);
      if (toDate) sp.set("to", toDate);
    }
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
    search,
    sortBy,
    sortDir,
    perPage,
    pageClamped,
    datePreset,
    fromDate,
    toDate,
    numberRangeType,
    formNoFrom,
    formNoTo,
    reportNoFrom,
    reportNoTo,
    setSearchParams,
  ]);

  async function setStatus(
    r: Report,
    newStatus: string,
    reason = "Client correction update",
    eSignPassword?: string,
  ) {
    const isChemistry = r.formType === "CHEMISTRY_MIX" || r.formType === "COA";

    const url = isChemistry
      ? `/chemistry-reports/${r.id}/status`
      : `/reports/${r.id}/status`;

    // statuses that require e-sign per backend
    const needsESign =
      newStatus === "VOID" ||
      newStatus === "LOCKED" ||
      newStatus === "UNDER_CLIENT_FINAL_REVIEW";

    const body: any = { reason, status: newStatus, expectedVersion: r.version };
    if (
      newStatus === "VOID" ||
      newStatus === "LOCKED" ||
      newStatus === "UNDER_CLIENT_FINAL_REVIEW"
    ) {
      body.eSignPassword = eSignPassword;
    }

    if (needsESign) {
      if (!eSignPassword) {
        throw new Error("Electronic signature (password) is required");
      }
      body.eSignPassword = eSignPassword;
    }

    await api(url, { method: "PATCH", body: JSON.stringify(body) });

    // keep local state in sync (status + bump version)
    setReports((prev) =>
      prev.map((x) =>
        x.id === r.id
          ? { ...x, status: newStatus, version: (x.version ?? r.version) + 1 }
          : x,
      ),
    );
  }

  function goToReportEditor(r: Report) {
    const slug = formTypeToSlug[(r.formType ?? "").trim()] || "micro-mix";
    const returnTo = location.pathname + location.search;

    if (r.formType === "CHEMISTRY_MIX" || r.formType === "COA") {
      navigate(
        `/chemistry-reports/${slug}/${r.id}?returnTo=${encodeURIComponent(returnTo)}`,
      );
    } else {
      navigate(
        `/reports/${slug}/${r.id}?returnTo=${encodeURIComponent(returnTo)}`,
      );
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
      formNumber: null,
      reportNumber: null,
      formType: null,
      clientCode: user?.clientCode || null,
    });

    setPrintingBulk(true);
    setIsBulkPrinting(true);
  };
  const selectedReportObjects = selectedIds
    .map((id) => reports.find((r) => r.id === id))
    .filter(Boolean) as Report[];

  const selectedBulkReports = selectedReportObjects;

  const selectedSameGroupAndStatus = useMemo(() => {
    if (!selectedBulkReports.length) return false;

    const group0 = getBulkWorkflowGroup(selectedBulkReports[0]);
    const status0 = String(selectedBulkReports[0].status);

    return selectedBulkReports.every(
      (r) => getBulkWorkflowGroup(r) === group0 && String(r.status) === status0,
    );
  }, [selectedBulkReports]);

  const commonNextStatuses = useMemo(() => {
    if (!selectedBulkReports.length) return [];
    if (!selectedSameGroupAndStatus) return [];

    return intersectAll(selectedBulkReports.map(getNextStatusesForReport));
  }, [selectedBulkReports, selectedSameGroupAndStatus]);

  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("VIEW");
  const [workspaceLayout, setWorkspaceLayout] =
    useState<WorkspaceLayout>("VERTICAL");
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([]);
  const [workspaceActiveId, setWorkspaceActiveId] = useState<string | null>(
    null,
  );

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

  const workspaceReports = useMemo(() => {
    return workspaceIds
      .map((id) => reports.find((r) => r.id === id))
      .filter(Boolean) as Report[];
  }, [workspaceIds, reports]);

  useEffect(() => {
    const close = () => setBulkMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

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
    let dateActive = false;

    if (datePreset === "CUSTOM") {
      dateActive = fromDate !== "" || toDate !== "";
    } else {
      dateActive = datePreset !== "TODAY";
    }

    return (
      formFilter !== "ALL" ||
      statusFilter !== "ALL" ||
      searchClient.trim() !== "" ||
      searchReport.trim() !== "" ||
      search.trim() !== "" ||
      sortBy !== "formNumber" ||
      sortDir !== "desc" ||
      perPage !== 10 ||
      numberRangeType !== "FORM" ||
      formNoFrom !== "" ||
      formNoTo !== "" ||
      reportNoFrom !== "" ||
      reportNoTo !== "" ||
      dateActive
    );
  }, [
    formFilter,
    statusFilter,
    searchClient,
    searchReport,
    search,
    sortBy,
    sortDir,
    perPage,
    datePreset,
    fromDate,
    toDate,
  ]);

  const clearAllFilters = () => {
    setFormFilter(DEFAULT_CLIENT_FILTERS.formFilter);
    setStatusFilter(DEFAULT_CLIENT_FILTERS.statusFilter);
    setSearchClient(DEFAULT_CLIENT_FILTERS.searchClient);
    setSearchReport(DEFAULT_CLIENT_FILTERS.searchReport);
    setSearch(DEFAULT_CLIENT_FILTERS.searchText);
    setSortBy(DEFAULT_CLIENT_FILTERS.sortBy);
    setSortDir(DEFAULT_CLIENT_FILTERS.sortDir);
    setPerPage(DEFAULT_CLIENT_FILTERS.perPage);
    setDatePreset(DEFAULT_CLIENT_FILTERS.datePreset);
    setFromDate(DEFAULT_CLIENT_FILTERS.fromDate);
    setToDate(DEFAULT_CLIENT_FILTERS.toDate);
    setPage(DEFAULT_CLIENT_FILTERS.page);
    setNumberRangeType(DEFAULT_CLIENT_FILTERS.numberRangeType);
    setFormNoFrom(DEFAULT_CLIENT_FILTERS.formNoFrom);
    setFormNoTo(DEFAULT_CLIENT_FILTERS.formNoTo);
    setReportNoFrom(DEFAULT_CLIENT_FILTERS.reportNoFrom);
    setReportNoTo(DEFAULT_CLIENT_FILTERS.reportNoTo);
  };

  useEffect(() => {
    const allowed =
      formFilter === "CHEMISTRY" || formFilter === "COA"
        ? CLIENT_CHEM_STATUSES.map(String)
        : CLIENT_MICRO_STATUSES.map(String);

    if (statusFilter !== "ALL" && !allowed.includes(String(statusFilter))) {
      setStatusFilter("ALL");
    }
  }, [formFilter]); // (statusFilter optional, but this is ok)

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
      if (exists) return prev.filter((k) => k !== key);

      return [...prev, key]; // ✅ no limit
    });
  };

  if (token && !user) {
    return <div className="p-6 text-slate-500">Loading dashboard…</div>;
  }

  if (!colsHydrated || !pinsHydrated) {
    return <div className="p-6 text-slate-500">Loading dashboard…</div>;
  }

  const handleVoidSelected = async (reason: string, password: string) => {
    if (!voidableSelected.length) return;

    logUiEvent({
      action: "UI_VOID_SELECTED",
      entity: "Report",
      details: `Voided selected reports (${voidableSelected.length})`,
      entityId: voidableSelected.map((r) => r.id).join(","),
      meta: {
        reportIds: voidableSelected.map((r) => r.id),
        count: voidableSelected.length,
        reason,
      },
      formNumber: voidableSelected[0]?.formNumber || null,
      reportNumber: null,
      formType: voidableSelected[0]?.formType || null,
      clientCode: user?.clientCode || null,
    });

    await Promise.all(
      voidableSelected.map((r) => setStatus(r, "VOID", reason, password)),
    );

    toast.success(`Voided ${voidableSelected.length} report(s)`);
    setSelectedIds([]);
  };

  const voidableSelected = selectedReportObjects.filter(
    (r) => String(r.status) !== "VOID",
  );

  const voidableCount = voidableSelected.length;
  const allSelectedAreVoid =
    selectedReportObjects.length > 0 && voidableCount === 0;

  const handleBulkStatusChange = async (toStatus: string) => {
    if (!selectedBulkReports.length) return;

    setBulkUpdating(true);
    try {
      await Promise.all(
        selectedBulkReports.map((r) =>
          setStatus(r, toStatus, "Bulk Status Change"),
        ),
      );

      setReports((prev) =>
        prev.map((r) =>
          selectedIds.includes(r.id)
            ? {
                ...r,
                status: toStatus,
                version: (r.version ?? 0) + 1,
              }
            : r,
        ),
      );

      logUiEvent({
        action: "UI_BULK_STATUS_CHANGE",
        entity: "Report",
        entityId: selectedIds.join(","),
        details: `Bulk status → ${toStatus} (${selectedBulkReports.length})`,
        meta: {
          reportIds: selectedIds,
          count: selectedBulkReports.length,
          fromStatus: String(selectedBulkReports[0]?.status ?? ""),
          toStatus,
          workflowGroup: selectedBulkReports[0]
            ? getBulkWorkflowGroup(selectedBulkReports[0])
            : "",
        },
        formNumber: selectedBulkReports[0]?.formNumber || null,
        reportNumber: null,
        formType: selectedBulkReports[0]?.formType || null,
        clientCode: user?.clientCode || null,
      });

      toast.success(`Updated ${selectedBulkReports.length} report(s)`);
      setSelectedIds([]);
    } catch (e: any) {
      toast.error(e?.message || "Bulk update failed");
    } finally {
      setBulkUpdating(false);
    }
  };

  const ENABLE_BULK_STATUS = false;

  type WorkspaceMode = "VIEW" | "UPDATE";

  type CorrectionLaunchKind = "REQUEST_CHANGE" | "RAISE_CORRECTION";

  type WorkspaceLayout = "VERTICAL" | "HORIZONTAL";

  function getTargetsForAction(clicked: Report): Report[] {
    const selected = selectedIds
      .map((id) => reports.find((r) => r.id === id))
      .filter(Boolean) as Report[];

    if (!selected.length) return [clicked];

    const clickedInsideSelection = selected.some((r) => r.id === clicked.id);
    return clickedInsideSelection ? selected : [clicked];
  }

  function canUpdateAnyReport(r: Report, user?: any) {
    if (r.formType === "CHEMISTRY_MIX" || r.formType === "COA") {
      return canUpdateThisChemistryReport(r, user);
    }
    return canUpdateThisReport(r, user);
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

  function openSelectedForCorrection(kinds: CorrectionLaunchKind[]) {
    const selected = selectedIds
      .map((id) => reports.find((r) => r.id === id))
      .filter(Boolean) as Report[];

    const hasBlockedStatus = selected.some((r) =>
      isCorrectionFlowStatus(String(r.status)),
    );

    if (hasBlockedStatus) {
      toast.error(
        "Correction is not allowed for reports already in correction/change workflow",
      );
      return;
    }

    if (!selected.length) return;

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
          {ENABLE_BULK_STATUS && (
            <div className="relative">
              <button
                type="button"
                disabled={
                  !selectedIds.length ||
                  !selectedSameGroupAndStatus ||
                  bulkUpdating ||
                  printingBulk
                }
                onClick={(e) => {
                  e.stopPropagation();
                  setBulkMenuOpen((o) => !o);
                }}
                className={classNames(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition",
                  selectedIds.length && selectedSameGroupAndStatus
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-slate-200 text-slate-500 cursor-not-allowed",
                )}
                title={
                  !selectedIds.length
                    ? "Select reports first"
                    : !selectedSameGroupAndStatus
                      ? "Select reports with same workflow and same status"
                      : "Bulk status change"
                }
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
                          await handleBulkStatusChange(s);
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
              if (selectedIds.length && !selectedHasCorrectionLockedStatus)
                openCorrectionMenu();
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
              disabled={
                !selectedIds.length ||
                printingBulk ||
                selectedHasCorrectionLockedStatus
              }
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
            onClick={() => {
              if (!voidableCount) return; // ✅ nothing to void
              setStatusModal({
                open: true,
                action: "VOID_SELECTED",
                reason: "",
                password: "",
                submitting: false,
                error: null,
              });
              setShowVoidPassword(false);
            }}
            disabled={!voidableCount || printingBulk}
            className={classNames(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm disabled:opacity-60 disabled:cursor-not-allowed",
              voidableCount
                ? "bg-rose-600 text-white hover:bg-rose-700"
                : "bg-slate-200 text-slate-500", // ✅ not red anymore
            )}
            title={
              allSelectedAreVoid
                ? "All selected reports are already VOID"
                : "Void selected reports"
            }
          >
            ⛔ Void ({voidableCount})
          </button>
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
            [
              "ALL",
              "MICRO",
              "MICROWATER",
              "STERILITY",
              "CHEMISTRY",
              "COA",
            ] as const
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
                        : ft === "COA"
                          ? "Coa"
                          : "Chemistry"}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Controls Card */}
      {/* Controls Card */}
      <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm overflow-hidden">
        {/* Status chips */}
        <div className="mb-4">
          <div className="flex min-h-[42px] items-center gap-2 overflow-x-auto pb-2">
            {statusOptions.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={classNames(
                  "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ring-1 transition",
                  statusFilter === s
                    ? "bg-blue-600 text-white ring-blue-600"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200 ring-slate-200",
                )}
                aria-pressed={statusFilter === s}
              >
                {niceStatus(String(s))}
              </button>
            ))}
          </div>
        </div>

        {/* Row 1 */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as DashboardStatus)
              }
              className="h-10 w-full rounded-lg border bg-white px-3 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {niceStatus(String(s))}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-8">
            <input
              placeholder="Search form #, report #, lot #, formula, description, client, status..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-lg border px-3 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Row 2 */}
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="lg:col-span-2">
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              className="h-10 w-full rounded-lg border bg-white px-3 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
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
                "h-10 w-full rounded-lg border px-3 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500",
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
                "h-10 w-full rounded-lg border px-3 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500",
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
              className="h-10 w-full rounded-lg border bg-white px-3 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="FORM">Forms</option>
              <option value="REPORT">Reports</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <input
              type="number"
              placeholder={`${numberRangeType === "FORM" ? "Form" : "Report"} # from`}
              value={numberRangeType === "FORM" ? formNoFrom : reportNoFrom}
              onChange={(e) => {
                if (numberRangeType === "FORM") setFormNoFrom(e.target.value);
                else setReportNoFrom(e.target.value);
              }}
              className="h-10 w-full rounded-lg border px-3 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="lg:col-span-2">
            <input
              type="number"
              placeholder={`${numberRangeType === "FORM" ? "Form" : "Report"} # to`}
              value={numberRangeType === "FORM" ? formNoTo : reportNoTo}
              onChange={(e) => {
                if (numberRangeType === "FORM") setFormNoTo(e.target.value);
                else setReportNoTo(e.target.value);
              }}
              className="h-10 w-full rounded-lg border px-3 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Row 3 */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <select
              id="sortBy"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-10 min-w-[180px] rounded-lg border bg-white px-3 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="dateSent">Date Sent</option>
              <option value="formNumber">Form #</option>
              <option value="createdAt">Created At</option>
              <option value="updatedAt">Updated At</option>
            </select>

            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border text-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
              aria-label="Toggle sort direction"
              title="Toggle sort direction"
            >
              {sortDir === "asc" ? "↓" : "↑"}
            </button>
          </div>

          <button
            type="button"
            onClick={clearAllFilters}
            disabled={!hasActiveFilters}
            className={classNames(
              "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-sm transition",
              hasActiveFilters
                ? "bg-rose-600 text-white hover:bg-rose-700"
                : "bg-slate-100 text-slate-400 cursor-not-allowed border",
            )}
            title={hasActiveFilters ? "Clear filters" : "No filters applied"}
          >
            ✕ Clear
          </button>
        </div>
      </div>

      {/* Content card */}
      <div className="rounded-2xl border bg-white shadow-sm flex flex-col">
        {/* States */}
        {error && (
          <div className="border-b bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/* Table */}
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
                        {/* <button
                        type="button"
                        onClick={() => setColOpen((v) => !v)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-slate-600 hover:bg-slate-100"
                        title="Choose columns"
                        aria-label="Choose columns"
                      >
                        ▾
                      </button> */}

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
                                }); // 288 = w-72
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
                                  const disabled = false; // or remove variable

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
                  [...Array(6)].map((_, i) => (
                    <tr key={`skel-${i}`} className="border-t">
                      <td className="px-3 py-3">
                        <div className="mx-auto h-6 w-6 animate-pulse rounded bg-slate-200" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-4 w-4 animate-pulse rounded bg-slate-200" />
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

                    const isChemistry =
                      r.formType === "CHEMISTRY_MIX" || r.formType === "COA";
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
                            className="inline-flex items-center justify-center transition transform hover:scale-110"
                            aria-label={
                              isPinned(r.id) ? "Unpin report" : "Pin report"
                            }
                            title={isPinned(r.id) ? "Unpin" : "Pin"}
                          >
                            <Pin
                              className={classNames(
                                "h-3 w-3 transition rotate-45",
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
                          />
                        </td>
                        {selectedCols.map((k) => (
                          <td key={k} className="px-4 py-3 whitespace-nowrap">
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
                              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ring-1",
                              (r.formType === "STERILITY"
                                ? STERILITY_STATUS_COLORS[
                                    r.status as SterilityReportStatus
                                  ]
                                : isChemistry
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
                        <td className="sticky right-0 z-20 px-4 py-3 bg-white shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.08)]">
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
                                  formNumber: r.formNumber || null,
                                  reportNumber: r.reportNumber || null,
                                  formType: r.formType || null,
                                  clientCode: user?.clientCode || null,
                                });

                                // setSelectedReport(r);
                                openViewTarget(r);
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
                                  {updatingId === r.id ? <Spinner /> : null}
                                  {updatingId === r.id
                                    ? "Updating..."
                                    : "Update"}
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
                      colSpan={2 + selectedCols.length + 2} // checkbox + dynamic cols + status + actions
                      className="px-4 py-12 text-center text-slate-500"
                    >
                      No reports found for{" "}
                      <span className="font-medium">
                        {niceStatus(String(statusFilter))}
                      </span>
                      {search ? (
                        <>
                          {" "}
                          matching{" "}
                          <span className="font-medium">“{search}”</span>.
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
            <div className="sticky bottom-0 z-20 flex flex-col items-center justify-between gap-3 border-t bg-white px-4 py-3 text-sm md:flex-row">
              <div className="text-slate-600">
                Showing <span className="font-medium">{start + 1}</span>–
                <span className="font-medium">{Math.min(end, total)}</span> of
                <span className="font-medium"> {total}</span>
              </div>
              <div className="flex items-center gap-2">
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
                      meta: {
                        formNumber: selectedReport.formNumber,
                        reportNumber: selectedReport.reportNumber,
                        formType: selectedReport.formType,
                        clientCode: user?.clientCode || null,
                      },
                      formNumber: selectedReport.formNumber,
                      reportNumber: selectedReport.reportNumber,
                      formType: selectedReport.formType,
                      clientCode: user?.clientCode || null,
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
                        openUpdateTarget(r);
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
                        //goToReportEditor(r);
                        openUpdateTarget(r);
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
              ) : selectedReport?.formType === "COA" ? (
                <COAReportFormView
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

      {statusModal.open &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-label="Void selected reports"
            onClick={(e) => {
              if (e.target === e.currentTarget && !statusModal.submitting) {
                setStatusModal((s) => ({
                  ...s,
                  open: false,
                  reason: "",
                  password: "",
                  error: null,
                }));
                setShowVoidPassword(false);
              }
            }}
          >
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              {/* Header */}
              <div className="border-b bg-gradient-to-r from-rose-600 to-pink-600 px-5 py-4 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">
                      Void Selected Reports
                    </h2>
                    <p className="mt-1 text-sm text-white/85">
                      {selectedReportObjects.length} selected report(s) will be
                      marked VOID
                    </p>
                  </div>

                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-50"
                    disabled={statusModal.submitting}
                    onClick={() => {
                      setStatusModal((s) => ({
                        ...s,
                        open: false,
                        reason: "",
                        password: "",
                        error: null,
                      }));
                      setShowVoidPassword(false);
                    }}
                    aria-label="Close"
                    title="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <form
                className="px-5 py-4"
                autoComplete="off"
                onSubmit={(e) => e.preventDefault()}
              >
                {/* Selected reports summary */}
                <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Selected Reports
                    </div>
                    <div className="text-xs font-medium text-slate-600">
                      {selectedReportObjects.length}
                    </div>
                  </div>

                  <div className="max-h-44 overflow-auto rounded-lg bg-white ring-1 ring-slate-200">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white">
                        <tr className="text-left text-slate-600">
                          <th className="px-3 py-2 font-medium">Form #</th>
                          <th className="px-3 py-2 font-medium">Report #</th>
                          <th className="px-3 py-2 font-medium">Type</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedReportObjects.map((r) => (
                          <tr key={r.id} className="border-t">
                            <td className="px-3 py-2 font-medium text-slate-900">
                              {r.formNumber || "-"}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {r.reportNumber || "-"}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {niceFormType(r.formType)}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={classNames(
                                  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1",
                                  (r.formType === "STERILITY"
                                    ? STERILITY_STATUS_COLORS[
                                        r.status as SterilityReportStatus
                                      ]
                                    : r.formType === "CHEMISTRY_MIX" ||
                                        r.formType === "COA"
                                      ? CHEMISTRY_STATUS_COLORS[
                                          r.status as ChemistryReportStatus
                                        ]
                                      : STATUS_COLORS[
                                          r.status as ReportStatus
                                        ]) ||
                                    "bg-slate-100 text-slate-800 ring-1 ring-slate-200",
                                )}
                              >
                                {niceStatus(String(r.status))}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Reason */}
                <div className="mb-4">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Reason for Void
                  </label>
                  <textarea
                    value={statusModal.reason}
                    onChange={(e) =>
                      setStatusModal((s) => ({
                        ...s,
                        reason: e.target.value,
                        error: null,
                      }))
                    }
                    rows={3}
                    placeholder="Explain why these reports are being voided..."
                    className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 ring-1 ring-inset ring-slate-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-500"
                    disabled={statusModal.submitting}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    This reason will be recorded in the audit trail.
                  </p>
                </div>

                {/* Password */}
                <div className="mb-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    E-signature Password
                  </label>

                  <div className="relative">
                    <input
                      type={showVoidPassword ? "text" : "password"}
                      value={statusModal.password}
                      onChange={(e) =>
                        setStatusModal((s) => ({
                          ...s,
                          password: e.target.value,
                          error: null,
                        }))
                      }
                      name="void_esign_password"
                      autoComplete="new-password"
                      placeholder="Enter e-signature password"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 pr-11 text-sm text-slate-800 ring-1 ring-inset ring-slate-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-500"
                      disabled={statusModal.submitting}
                    />

                    <button
                      type="button"
                      onClick={() => setShowVoidPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700"
                      aria-label={
                        showVoidPassword ? "Hide password" : "Show password"
                      }
                      title={
                        showVoidPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showVoidPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {statusModal.error ? (
                    <p className="mt-2 text-xs text-rose-600">
                      {statusModal.error}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      Required for 21 CFR Part 11 controlled actions.
                    </p>
                  )}
                </div>

                {/* Footer */}
                <div className="mt-5 flex items-center justify-end gap-2 border-t pt-4">
                  <button
                    type="button"
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    disabled={statusModal.submitting}
                    onClick={() => {
                      setStatusModal((s) => ({
                        ...s,
                        open: false,
                        reason: "",
                        password: "",
                        error: null,
                      }));
                      setShowVoidPassword(false);
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-60"
                    disabled={
                      statusModal.submitting ||
                      !statusModal.reason.trim() ||
                      !statusModal.password.trim()
                    }
                    onClick={async () => {
                      const reason = statusModal.reason.trim();
                      const pwd = statusModal.password.trim();

                      if (!reason) {
                        setStatusModal((s) => ({
                          ...s,
                          error: "Reason is required.",
                        }));
                        return;
                      }

                      if (!pwd) {
                        setStatusModal((s) => ({
                          ...s,
                          error: "E-sign password is required.",
                        }));
                        return;
                      }

                      setStatusModal((s) => ({
                        ...s,
                        submitting: true,
                        error: null,
                      }));

                      try {
                        await handleVoidSelected(reason, pwd);
                        setStatusModal((s) => ({
                          ...s,
                          open: false,
                          submitting: false,
                          reason: "",
                          password: "",
                          error: null,
                        }));
                        setShowVoidPassword(false);
                      } catch (e: any) {
                        setStatusModal((s) => ({
                          ...s,
                          submitting: false,
                          error:
                            e?.message || "Failed to void selected reports.",
                        }));
                      }
                    }}
                  >
                    {statusModal.submitting ? <Spinner /> : null}
                    {statusModal.submitting ? "Voiding..." : "Confirm Void"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
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
