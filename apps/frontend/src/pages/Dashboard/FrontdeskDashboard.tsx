import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import MicroMixReportFormView from "../Reports/MicroMixReportFormView";
import { useAuth } from "../../context/AuthContext";
import {
  STATUS_TRANSITIONS as MICRO_STATUS_TRANSITIONS,
  type Role,
  type ReportStatus,
} from "../../utils/microMixReportFormWorkflow";
import {
  canShowUpdateButton,
  STATUS_COLORS,
} from "../../utils/microMixReportFormWorkflow";
import { api, API_URL } from "../../lib/api";
import MicroMixWaterReportFormView from "../Reports/MicroMixWaterReportFormView";
import { createPortal } from "react-dom";
import ChemistryMixReportFormView from "../Reports/ChemistryMixReportFormView";
import {
  STATUS_TRANSITIONS as CHEM_STATUS_TRANSITIONS,
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
import { useLiveReportStatus } from "../../hooks/useLiveReportStatus";
import { logUiEvent } from "../../lib/uiAudit";
import SterilityReportFormView from "../Reports/SterilityReportFormView";
import COAReportFormView from "../Reports/COAReportFormView";
import { parseIntSafe } from "../../utils/commonDashboardUtil";
import {
  STERILITY_STATUS_TRANSITIONS,
  type SterilityReportStatus,
} from "../../utils/SterilityReportFormWorkflow";
import ReportWorkspaceModal from "../../utils/ReportWorkspaceModal";
import { getReportSearchBlob } from "../../utils/clientDashboardutils";

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
  version: number;

  attachmentsCount?: number;

  client?: string | null;
  clientCode?: string | null;
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

  sampleDescription?: string | null;
  lotBatchNo?: string | null;
  formulaId?: string | null;
  sampleSize?: string | null;
  numberOfActives?: string | null;
  comments?: string | null;
  testedBy?: string | null;
  reviewedBy?: string | null;

  pathogens?: unknown;
  sampleTypes?: unknown;
  testTypes?: unknown;
  sampleCollected?: unknown;
  actives?: unknown;
  coaRows?: unknown;

  _searchBlob?: string;
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
  STERILITY: "sterility",
  CHEMISTRY_MIX: "chemistry-mix",
  COA: "coa",
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function niceStatus(s: string) {
  return s.replace(/_/g, " ");
}

function canUpdateThisReport(r: Report, user?: any) {
  if (user?.role !== "CLIENT") return false;
  if (r.formNumber !== user?.clientCode) return false;

  const isChem = r.formType === "CHEMISTRY_MIX" || r.formType === "COA";

  return isChem
    ? canShowChemistryUpdateButton(user.role, r.status as ChemistryReportStatus)
    : canShowUpdateButton(user.role as Role, r.status as ReportStatus);
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

// --------------- Bulk print helper (renders selected reports + window.print) ---------------
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

type ReportKind = "MICRO" | "STERILITY" | "CHEMISTRY";

function getReportKind(r: Report): ReportKind {
  if (r.formType === "STERILITY") return "STERILITY";
  if (r.formType === "CHEMISTRY_MIX" || r.formType === "COA")
    return "CHEMISTRY";
  return "MICRO"; // MICRO_MIX + MICRO_MIX_WATER
}

function getNextStatusesForReport(r: Report): string[] {
  const s = String(r.status);

  const kind = getReportKind(r);

  if (kind === "MICRO") {
    return MICRO_STATUS_TRANSITIONS?.[s as ReportStatus]?.next ?? [];
  }

  if (kind === "STERILITY") {
    return (
      STERILITY_STATUS_TRANSITIONS?.[s as SterilityReportStatus]?.next ?? []
    );
  }

  // CHEMISTRY
  return CHEM_STATUS_TRANSITIONS?.[s as ChemistryReportStatus]?.next ?? [];
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

const DEFAULT_FRONTDESK_FILTERS = {
  formFilter: "ALL" as
    | "ALL"
    | "MICRO"
    | "MICROWATER"
    | "STERILITY"
    | "CHEMISTRY"
    | "COA",
  statusFilter: "ALL" as "ALL" | ReportStatus,
  searchClient: "",
  searchReport: "",
  searchText: "",
  datePreset: "ALL" as DatePreset,
  fromDate: "",
  toDate: "",
  numberRangeType: "FORM" as "FORM" | "REPORT",
  formNoFrom: "",
  formNoTo: "",
  reportNoFrom: "",
  reportNoTo: "",
  sortBy: "dateSent" as "dateSent" | "reportNumber",
  sortDir: "desc" as "asc" | "desc",
  perPage: 10,
  page: 1,
  modalPane: "FORM" as "FORM" | "ATTACHMENTS",
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

function getInitialFrontDeskFilters(searchParams: URLSearchParams) {
  try {
    const spForm = searchParams.get("form");
    const spStatus = searchParams.get("status");
    const spClient = searchParams.get("client");
    const spReport = searchParams.get("report");
    const spQ = searchParams.get("q");

    const spDp = searchParams.get("dp");
    const spFrom = searchParams.get("from");
    const spTo = searchParams.get("to");

    const spRangeType = searchParams.get("rangeType");
    const spFormFrom = searchParams.get("formFrom");
    const spFormTo = searchParams.get("formTo");
    const spReportFrom = searchParams.get("reportFrom");
    const spReportTo = searchParams.get("reportTo");

    const spSortBy = searchParams.get("sb");
    const spSortDir = searchParams.get("sd");
    const spPp = searchParams.get("pp");
    const spP = searchParams.get("p");
    const spPane = searchParams.get("pane");

    const hasUrlFilters =
      spForm ||
      spStatus ||
      spClient ||
      spReport ||
      spQ ||
      spDp ||
      spFrom ||
      spTo ||
      spRangeType ||
      spFormFrom ||
      spFormTo ||
      spReportFrom ||
      spReportTo ||
      spSortBy ||
      spSortDir ||
      spPp ||
      spP ||
      spPane;

    if (hasUrlFilters) {
      return {
        formFilter:
          (spForm as typeof DEFAULT_FRONTDESK_FILTERS.formFilter) ||
          DEFAULT_FRONTDESK_FILTERS.formFilter,
        statusFilter:
          (spStatus as "ALL" | ReportStatus) ||
          DEFAULT_FRONTDESK_FILTERS.statusFilter,
        searchClient: spClient || DEFAULT_FRONTDESK_FILTERS.searchClient,
        searchReport: spReport || DEFAULT_FRONTDESK_FILTERS.searchReport,
        searchText: spQ || DEFAULT_FRONTDESK_FILTERS.searchText,
        datePreset:
          (spDp as DatePreset) || DEFAULT_FRONTDESK_FILTERS.datePreset,
        fromDate: spFrom || DEFAULT_FRONTDESK_FILTERS.fromDate,
        toDate: spTo || DEFAULT_FRONTDESK_FILTERS.toDate,
        numberRangeType:
          (spRangeType as "FORM" | "REPORT") ||
          DEFAULT_FRONTDESK_FILTERS.numberRangeType,
        formNoFrom: spFormFrom || DEFAULT_FRONTDESK_FILTERS.formNoFrom,
        formNoTo: spFormTo || DEFAULT_FRONTDESK_FILTERS.formNoTo,
        reportNoFrom: spReportFrom || DEFAULT_FRONTDESK_FILTERS.reportNoFrom,
        reportNoTo: spReportTo || DEFAULT_FRONTDESK_FILTERS.reportNoTo,
        sortBy:
          (spSortBy as "dateSent" | "reportNumber") ||
          DEFAULT_FRONTDESK_FILTERS.sortBy,
        sortDir:
          (spSortDir as "asc" | "desc") || DEFAULT_FRONTDESK_FILTERS.sortDir,
        perPage: parseIntSafe(spPp, DEFAULT_FRONTDESK_FILTERS.perPage),
        page: parseIntSafe(spP, DEFAULT_FRONTDESK_FILTERS.page),
        modalPane:
          (spPane as "FORM" | "ATTACHMENTS") ||
          DEFAULT_FRONTDESK_FILTERS.modalPane,
      };
    }
  } catch {
    // ignore
  }

  return DEFAULT_FRONTDESK_FILTERS;
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// -----------------------------
// Component
// -----------------------------
export default function FrontDeskDashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const initialFilters = getInitialFrontDeskFilters(searchParams);

  const [formFilter, setFormFilter] = useState<
    "ALL" | "MICRO" | "MICROWATER" | "STERILITY" | "CHEMISTRY" | "COA"
  >(initialFilters.formFilter);

  const [statusFilter, setStatusFilter] = useState<"ALL" | ReportStatus>(
    initialFilters.statusFilter,
  );

  const [searchClient, setSearchClient] = useState(initialFilters.searchClient);

  const [searchReport, setSearchReport] = useState(initialFilters.searchReport);

  const [search, setSearch] = useState(initialFilters.searchText);

  const [sortBy, setSortBy] = useState<"dateSent" | "reportNumber">(
    initialFilters.sortBy,
  );

  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    initialFilters.sortDir,
  );

  const [datePreset, setDatePreset] = useState<DatePreset>(
    initialFilters.datePreset,
  );

  const [fromDate, setFromDate] = useState<string>(initialFilters.fromDate);
  const [toDate, setToDate] = useState<string>(initialFilters.toDate);

  const [numberRangeType, setNumberRangeType] = useState<"FORM" | "REPORT">(
    initialFilters.numberRangeType,
  );

  const [formNoFrom, setFormNoFrom] = useState(initialFilters.formNoFrom);
  const [formNoTo, setFormNoTo] = useState(initialFilters.formNoTo);
  const [reportNoFrom, setReportNoFrom] = useState(initialFilters.reportNoFrom);
  const [reportNoTo, setReportNoTo] = useState(initialFilters.reportNoTo);

  const [perPage, setPerPage] = useState(initialFilters.perPage);
  const [page, setPage] = useState(initialFilters.page);

  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  const [modalPane, setModalPane] = useState<"FORM" | "ATTACHMENTS">(
    initialFilters.modalPane,
  );

  // const [formFilter, setFormFilter] = useState<
  //   "ALL" | "MICRO" | "MICROWATER" | "STERILITY" | "CHEMISTRY" | "COA"
  // >((searchParams.get("form") as any) || "ALL");

  // const [statusFilter, setStatusFilter] = useState<"ALL" | ReportStatus>(
  //   (searchParams.get("status") as any) || "ALL",
  // );

  // const [search, setSearch] = useState(searchParams.get("q") || "");

  // const [sortBy, setSortBy] = useState<"dateSent" | "reportNumber">(
  //   ((searchParams.get("sb") as any) || "dateSent") as any,
  // );

  // const [sortDir, setSortDir] = useState<"asc" | "desc">(
  //   ((searchParams.get("sd") as any) || "desc") as any,
  // );

  // const [datePreset, setDatePreset] = useState<DatePreset>(
  //   (searchParams.get("dp") as any) || "ALL",
  // );

  // const [fromDate, setFromDate] = useState<string>(
  //   searchParams.get("from") || "",
  // );
  // const [toDate, setToDate] = useState<string>(searchParams.get("to") || "");

  // const [perPage, setPerPage] = useState(
  //   parseIntSafe(searchParams.get("pp"), 10),
  // );
  // const [page, setPage] = useState(parseIntSafe(searchParams.get("p"), 1));

  // const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  // const [modalPane, setModalPane] = useState<"FORM" | "ATTACHMENTS">(
  //   (searchParams.get("pane") as any) || "FORM",
  // );

  // selected row IDs for bulk print
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // whether we are currently rendering for print
  const [isBulkPrinting, setIsBulkPrinting] = useState(false);
  // single-report print from modal
  const [singlePrintReport, setSinglePrintReport] = useState<Report | null>(
    null,
  );

  // ✅ guards
  const [printingBulk, setPrintingBulk] = useState(false);
  const [printingSingle, setPrintingSingle] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [modalUpdating, setModalUpdating] = useState(false);

  const [uploadingId, setUploadingId] = useState<string | null>(null);

  // one hidden input per row (keyed by report id)
  // const fileInputs = React.useRef<Record<string, HTMLInputElement | null>>({});

  const [bulkNextStatus, setBulkNextStatus] = useState<string>("");
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);

  const fileInputs = React.useRef<Record<string, HTMLInputElement>>({});

  const navigate = useNavigate();
  const { user } = useAuth();

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

  // Fetch reports
  useEffect(() => {
    let abort = false;
    async function fetchReports() {
      try {
        setLoading(true);
        setError(null);
        const micro = await api<Report[]>("/reports");
        const chemistry = await api<Report[]>("/chemistry-reports");

        const all = [...micro, ...chemistry];

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

    const byStatus =
      statusFilter === "ALL"
        ? byForm
        : byForm.filter((r) => String(r.status) === String(statusFilter));

    const byClient = searchClient.trim()
      ? byStatus.filter((r) => {
          const q = searchClient.toLowerCase();
          return String(r.formNumber || "")
            .toLowerCase()
            .includes(q);
        })
      : byStatus;

    const byReport = searchReport.trim()
      ? byClient.filter((r) => {
          const q = searchReport.toLowerCase();
          return (
            String(r.reportNumber || "")
              .toLowerCase()
              .includes(q) ||
            String(r.formNumber || "")
              .toLowerCase()
              .includes(q)
          );
        })
      : byClient;

    const bySearch = search.trim()
      ? byReport.filter((r) => {
          const q = search.trim().toLowerCase();
          return (r._searchBlob || "").includes(q);
        })
      : byReport;

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

    const byDate = byNumberRange.filter((r) =>
      matchesDateRange(r.dateSent, fromDate || undefined, toDate || undefined),
    );

    const sorted = [...byDate].sort((a, b) => {
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
  }, [
    reportsWithSearch,
    formFilter,
    statusFilter,
    search,
    sortBy,
    sortDir,
    fromDate,
    toDate,
    datePreset,
    searchClient,
    searchReport,
    numberRangeType,
    formNoFrom,
    formNoTo,
    reportNoFrom,
    reportNoTo,
  ]);

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
  }, [
    statusFilter,
    search,
    perPage,
    formFilter,
    sortBy,
    sortDir,
    fromDate,
    toDate,
    datePreset,
  ]);

  useEffect(() => {
    const sp = new URLSearchParams();

    if (formFilter !== "ALL") sp.set("form", formFilter);
    sp.set("status", String(statusFilter));

    if (searchClient.trim()) sp.set("client", searchClient.trim());
    if (searchReport.trim()) sp.set("report", searchReport.trim());
    if (search.trim()) sp.set("q", search.trim());

    if (sortBy !== "dateSent") sp.set("sb", sortBy);
    if (sortDir !== "desc") sp.set("sd", sortDir);

    sp.set("dp", datePreset);
    if (fromDate) sp.set("from", fromDate);
    if (toDate) sp.set("to", toDate);

    sp.set("rangeType", numberRangeType);
    if (formNoFrom.trim()) sp.set("formFrom", formNoFrom.trim());
    if (formNoTo.trim()) sp.set("formTo", formNoTo.trim());
    if (reportNoFrom.trim()) sp.set("reportFrom", reportNoFrom.trim());
    if (reportNoTo.trim()) sp.set("reportTo", reportNoTo.trim());

    if (modalPane !== "FORM") sp.set("pane", modalPane);

    if (perPage !== 10) sp.set("pp", String(perPage));
    if (pageClamped !== 1) sp.set("p", String(pageClamped));

    setSearchParams(sp, { replace: true });
  }, [
    formFilter,
    statusFilter,
    searchClient,
    searchReport,
    search,
    sortBy,
    sortDir,
    datePreset,
    fromDate,
    toDate,
    numberRangeType,
    formNoFrom,
    formNoTo,
    reportNoFrom,
    reportNoTo,
    modalPane,
    perPage,
    pageClamped,
    setSearchParams,
  ]);

  async function setStatus(
    r: Report,
    newStatus: string,
    reason = "Status Change",
    opts?: { eSignPassword?: string },
  ) {
    const isChemistry = r.formType === "CHEMISTRY_MIX" || r.formType === "COA";

    const url = isChemistry
      ? `/chemistry-reports/${r.id}/status`
      : `/reports/${r.id}/status`;

    await api(url, {
      method: "PATCH",
      body: JSON.stringify({
        status: newStatus,
        reason,
        // ✅ IMPORTANT: align field name with backend
        // If your backend expects `password` or `eSignPassword`, keep it here.
        eSignPassword: opts?.eSignPassword,
        expectedVersion: r.version,
      }),
    });
  }

  async function applyBulkStatusChange(
    toStatus: string,
    reason: string,
    eSignPassword?: string,
  ) {
    setBulkUpdating(true);
    try {
      for (const r of selected) {
        await setStatus(r, toStatus, reason, { eSignPassword });
      }

      const keep = new Set(FRONTDESK_STATUSES.filter((s) => s !== "ALL"));

      setReports((prev) => {
        const next = prev.map((x) =>
          selectedIds.includes(x.id)
            ? { ...x, status: toStatus, version: (x.version ?? 0) + 1 }
            : x,
        );

        // ✅ IMPORTANT: keep dashboard list consistent with initial fetch behavior
        return next.filter((r) => keep.has(r.status as any));
      });

      setSelectedIds([]);
    } finally {
      setBulkUpdating(false);
    }
  }

  async function uploadAttachmentForReport(r: Report, file: File) {
    const isChemistry = r.formType === "CHEMISTRY_MIX" || r.formType === "COA";
    const base = isChemistry
      ? `/chemistry-reports/${r.id}`
      : `/reports/${r.id}`;
    const url = `${base}/attachments`;

    const form = new FormData();
    form.append("file", file);
    form.append("source", "manual-upload");
    form.append("createdBy", user?.name || user?.role || "frontdesk");
    form.append("kind", "SIGNED_FORM"); // or "RAW_SCAN" etc.
    form.append("meta", JSON.stringify({ via: "frontdesk-dashboard" }));

    // IMPORTANT: Your `api()` helper is JSON-based.
    // Use fetch directly so browser sets multipart boundary automatically.
    const token = localStorage.getItem("token"); // adjust if you store token differently

    const res = await fetch(`${API_URL}${url}`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // DO NOT set Content-Type for FormData
      },
      body: form,
    });

    if (!res.ok) {
      let msg = `Upload failed (${res.status})`;
      try {
        const data = await res.json();
        msg = data?.message || JSON.stringify(data) || msg;
      } catch {}
      const err: any = new Error(msg);
      err.status = res.status;
      throw err;
    }
  }

  function goToReportEditor(r: Report) {
    const slug = formTypeToSlug[r.formType] || "micro-mix";
    if (r.formType === "CHEMISTRY_MIX" || r.formType === "COA") {
      navigate(`/chemistry-reports/${slug}/${r.id}`);
    } else {
      navigate(`/reports/${slug}/${r.id}`);
    }
  }

  // checkbox helpers
  const isRowSelected = (id: string) => selectedIds.includes(id);

  const toggleRow = (id: string) => {
    if (updatingId === id) return;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // select all on current page
  const allOnPageSelected =
    pageRows.length > 0 && pageRows.every((r) => selectedIds.includes(r.id));

  const toggleSelectPage = () => {
    if (printingBulk) return;
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
      formNumber: selectedReportObjects[0]?.formNumber || null,
      reportNumber: selectedReportObjects[0]?.reportNumber || null,
      formType: selectedReportObjects[0]?.formType || null,
      clientCode: user?.clientCode || null,
    });

    setPrintingBulk(true);
    setIsBulkPrinting(true);
  };

  const selectedReportObjects = selectedIds
    .map((id) => reports.find((r) => r.id === id))
    .filter(Boolean) as Report[];

  const selected = selectedReportObjects;

  const selectedSameKindAndStatus = useMemo(() => {
    if (selected.length === 0) return false;
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
    // reset dropdown if selection changes
    if (!commonNextStatuses.length) setBulkNextStatus("");
    else if (bulkNextStatus && !commonNextStatuses.includes(bulkNextStatus)) {
      setBulkNextStatus("");
    }
  }, [commonNextStatuses, bulkNextStatus]);

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
    return (
      formFilter !== "ALL" ||
      statusFilter !== "ALL" ||
      searchClient.trim() !== "" ||
      searchReport.trim() !== "" ||
      search.trim() !== "" ||
      sortBy !== "dateSent" ||
      sortDir !== "desc" ||
      perPage !== 10 ||
      datePreset !== "ALL" ||
      fromDate !== "" ||
      toDate !== "" ||
      numberRangeType !== "FORM" ||
      formNoFrom !== "" ||
      formNoTo !== "" ||
      reportNoFrom !== "" ||
      reportNoTo !== ""
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
    numberRangeType,
    formNoFrom,
    formNoTo,
    reportNoFrom,
    reportNoTo,
  ]);

  const clearAllFilters = () => {
    setFormFilter(DEFAULT_FRONTDESK_FILTERS.formFilter);
    setStatusFilter(DEFAULT_FRONTDESK_FILTERS.statusFilter);
    setSearchClient(DEFAULT_FRONTDESK_FILTERS.searchClient);
    setSearchReport(DEFAULT_FRONTDESK_FILTERS.searchReport);
    setSearch(DEFAULT_FRONTDESK_FILTERS.searchText);
    setSortBy(DEFAULT_FRONTDESK_FILTERS.sortBy);
    setSortDir(DEFAULT_FRONTDESK_FILTERS.sortDir);
    setPerPage(DEFAULT_FRONTDESK_FILTERS.perPage);
    setDatePreset(DEFAULT_FRONTDESK_FILTERS.datePreset);
    setFromDate(DEFAULT_FRONTDESK_FILTERS.fromDate);
    setToDate(DEFAULT_FRONTDESK_FILTERS.toDate);
    setNumberRangeType(DEFAULT_FRONTDESK_FILTERS.numberRangeType);
    setFormNoFrom(DEFAULT_FRONTDESK_FILTERS.formNoFrom);
    setFormNoTo(DEFAULT_FRONTDESK_FILTERS.formNoTo);
    setReportNoFrom(DEFAULT_FRONTDESK_FILTERS.reportNoFrom);
    setReportNoTo(DEFAULT_FRONTDESK_FILTERS.reportNoTo);
    setPage(DEFAULT_FRONTDESK_FILTERS.page);
  };
  useEffect(() => {
    const validStatuses = FRONTDESK_STATUSES.map(String);

    if (!validStatuses.includes(String(statusFilter))) {
      setStatusFilter("ALL");
    }
  }, [formFilter, statusFilter]);

  useLiveReportStatus(setReports, {
    shouldKeep: (r) =>
      r.status === "RECEIVED_BY_FRONTDESK" ||
      r.status === "FRONTDESK_ON_HOLD" ||
      r.status === "FRONTDESK_NEEDS_CORRECTION",
  });

  // ---------------- E-VERIFY (Bulk) ----------------
  const [bulkESignOpen, setBulkESignOpen] = useState(false);
  const [bulkESignReason, setBulkESignReason] = useState("");
  const [bulkESignPassword, setBulkESignPassword] = useState("");
  const [bulkPendingStatus, setBulkPendingStatus] = useState<string>("");

  const BULK_FORCE_EVERIFY_STATUSES = new Set([
    "UNDER_CLIENT_REVIEW",
    "UNDER_CLIENT_FINAL_REVIEW",
  ]);

  // Decide if bulk transition needs e-verify (hook into your workflow maps)
  function bulkRequiresESign(args: { report: Report; toStatus: string }) {
    const { report, toStatus } = args;

    // ✅ Always require password+reason for these two bulk actions
    if (BULK_FORCE_EVERIFY_STATUSES.has(toStatus)) return true;

    // (optional) keep your existing workflow-map-based logic too
    const from = String(report.status);
    const kind = getReportKind(report);

    if (kind === "MICRO") {
      const t = MICRO_STATUS_TRANSITIONS?.[from as ReportStatus];
      return Boolean(
        (t as any)?.requireESign?.includes?.(toStatus) ||
        (t as any)?.eSignNext?.includes?.(toStatus),
      );
    }

    if (kind === "STERILITY") {
      const t = STERILITY_STATUS_TRANSITIONS?.[from as SterilityReportStatus];
      return Boolean(
        (t as any)?.requireESign?.includes?.(toStatus) ||
        (t as any)?.eSignNext?.includes?.(toStatus),
      );
    }

    const t = CHEM_STATUS_TRANSITIONS?.[from as ChemistryReportStatus];
    return Boolean(
      (t as any)?.requireESign?.includes?.(toStatus) ||
      (t as any)?.eSignNext?.includes?.(toStatus),
    );
  }

  function getTargetsForAction(clicked: Report): Report[] {
    const selected = selectedIds
      .map((id) => reports.find((r) => r.id === id))
      .filter(Boolean) as Report[];

    if (!selected.length) return [clicked];

    const clickedInsideSelection = selected.some((r) => r.id === clicked.id);

    return clickedInsideSelection ? selected : [clicked];
  }

  function canUpdateAnyReport(r: Report, user?: any) {
    if (!user) return false;

    return (
      r.status === "RECEIVED_BY_FRONTDESK" ||
      r.status === "FRONTDESK_ON_HOLD" ||
      r.status === "FRONTDESK_NEEDS_CORRECTION"
    );
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
      alert("No selected reports are available for update");
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
          <h1 className="text-2xl font-bold tracking-tight">
            Frontdesk Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            View and manage your lab reports
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* ✅ Bulk status update */}
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
              <div className="absolute right-0 mt-2 w-52 rounded-xl border bg-white shadow-lg ring-1 ring-black/5 z-20">
                <div className="py-1 text-sm">
                  {commonNextStatuses.map((s) => (
                    <button
                      key={s}
                      className="flex w-full items-center px-3 py-2 hover:bg-slate-100 text-left"
                      onClick={async () => {
                        if (bulkUpdating) return;

                        setBulkMenuOpen(false);

                        logUiEvent({
                          action: "UI_BULK_STATUS_CHANGE",
                          entity: "Report",
                          entityId: selectedIds.join(","),
                          details: `Bulk status → ${s} (${selectedIds.length})`,
                          meta: {
                            reportIds: selectedIds,
                            fromStatus: String(selected[0].status),
                            toStatus: s,
                            kind: getReportKind(selected[0]),
                          },
                          formNumber: selected[0]?.formNumber || null,
                          reportNumber: selected[0]?.reportNumber || null,
                          formType: selected[0]?.formType || null,
                          clientCode: user?.clientCode || null,
                        });

                        const needsESign = bulkRequiresESign({
                          report: selected[0],
                          toStatus: s,
                        });

                        if (needsESign) {
                          setBulkPendingStatus(s);
                          setBulkESignReason(""); // or default like "Bulk Status Change"
                          setBulkESignPassword("");
                          setBulkESignOpen(true);
                          setBulkESignReason(
                            `Bulk status change to ${niceStatus(s)}`,
                          );
                          return;
                        }

                        try {
                          await applyBulkStatusChange(s, "Bulk Status Change");
                        } catch (e: any) {
                          alert(e?.message || "❌ Bulk status update failed");
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
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {FRONTDESK_STATUSES.map((s) => (
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

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            placeholder="Search form #, report #, lot/batch #, formula, description, status..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[260px] rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
          />

          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "dateSent" | "reportNumber")
              }
              className="w-44 rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="dateSent">Date Sent</option>
              <option value="reportNumber">Report #</option>
            </select>

            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="inline-flex h-10 min-w-[42px] items-center justify-center rounded-lg border px-3 text-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
              aria-label="Toggle sort direction"
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
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
          </div>

          <div className="flex gap-3 flex-wrap">
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              className="w-52 shrink-0 rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
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
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
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
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setDatePreset("CUSTOM");
              }}
              disabled={datePreset !== "CUSTOM"}
              className={classNames(
                "w-40 rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500",
                datePreset !== "CUSTOM" && "opacity-60 cursor-not-allowed",
              )}
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={numberRangeType}
              onChange={(e) =>
                setNumberRangeType(e.target.value as "FORM" | "REPORT")
              }
              className="w-32 rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="FORM">Forms</option>
              <option value="REPORT">Reports</option>
            </select>

            <input
              type="number"
              placeholder={`${
                numberRangeType === "FORM" ? "Form" : "Report"
              } # from`}
              value={numberRangeType === "FORM" ? formNoFrom : reportNoFrom}
              onChange={(e) => {
                if (numberRangeType === "FORM") setFormNoFrom(e.target.value);
                else setReportNoFrom(e.target.value);
              }}
              className="w-36 rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />

            <input
              type="number"
              placeholder={`${
                numberRangeType === "FORM" ? "Form" : "Report"
              } # to`}
              value={numberRangeType === "FORM" ? formNoTo : reportNoTo}
              onChange={(e) => {
                if (numberRangeType === "FORM") setFormNoTo(e.target.value);
                else setReportNoTo(e.target.value);
              }}
              className="w-36 rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={clearAllFilters}
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
                    disabled={printingBulk}
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
                pageRows.map((r) => {
                  const isChemistry =
                    r.formType === "CHEMISTRY_MIX" || r.formType === "COA";
                  const rowBusy = updatingId === r.id;

                  const rowUploading = uploadingId === r.id;

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
                        {r.reportNumber}
                      </td>
                      <td className="px-4 py-3">{r.formNumber}</td>
                      <td className="px-4 py-3">{formatDate(r.dateSent)}</td>

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
                        <div className="flex flex-wrap items-center gap-2">
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
                                    : r.formType === "COA"
                                      ? "CoaReport"
                                      : r.formType === "STERILITY"
                                        ? "SterilityReport"
                                        : "Micro Report",
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
                                clientCode: user?.clientCode || null,
                              });

                              openViewTarget(r);
                            }}
                            disabled={rowBusy}
                          >
                            View
                          </button>

                          <button
                            disabled={rowBusy}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                            onClick={async () => {
                              if (rowBusy) return;
                              setUpdatingId(r.id);

                              try {
                                // Your existing transition:
                                // PRELIMINARY_TESTING_NEEDS_CORRECTION -> UNDER_CLIENT_PRELIMINARY_CORRECTION
                                if (
                                  r.status ===
                                  "PRELIMINARY_TESTING_NEEDS_CORRECTION"
                                ) {
                                  const newStatus =
                                    "UNDER_CLIENT_PRELIMINARY_CORRECTION";
                                  await setStatus(
                                    r,
                                    newStatus,
                                    "Sent back to client for correction",
                                  );
                                  setReports((prev) =>
                                    prev.map((x) =>
                                      x.id === r.id
                                        ? { ...x, status: newStatus }
                                        : x,
                                    ),
                                  );
                                }

                                openUpdateTarget(r);
                              } catch (e: any) {
                                alert(e?.message || "Failed to update status");
                              } finally {
                                setUpdatingId(null);
                              }
                            }}
                          >
                            {rowBusy ? <Spinner /> : null}
                            {rowBusy ? "Updating..." : "Update"}
                          </button>

                          <>
                            {/* Hidden input */}
                            <input
                              type="file"
                              accept=".pdf,image/*"
                              className="hidden"
                              ref={(el) => {
                                if (el) fileInputs.current[r.id] = el;
                                else delete fileInputs.current[r.id]; // cleanup on unmount
                              }}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                e.target.value = ""; // allow re-upload same file again
                                if (!file) return;

                                if (rowUploading) return;
                                setUploadingId(r.id);

                                // ✅ AUDIT
                                logUiEvent({
                                  action: "UI_UPLOAD_ATTACHMENT",
                                  entity:
                                    r.formType === "CHEMISTRY_MIX"
                                      ? "ChemistryReport"
                                      : r.formType === "COA"
                                        ? "CoaReport"
                                        : r.formType === "STERILITY"
                                          ? "SterilityReport"
                                          : "MicroReport",
                                  entityId: r.id,
                                  details: `Uploaded attachment for ${r.formNumber}`,
                                  meta: {
                                    filename: file.name,
                                    size: file.size,
                                    type: file.type,
                                  },
                                  formNumber: r.formNumber,
                                  reportNumber: r.reportNumber,
                                  formType: r.formType,
                                  clientCode: user?.clientCode || null,
                                });

                                try {
                                  await uploadAttachmentForReport(r, file);
                                  alert("✅ Uploaded!");
                                  // optional: if modal open for same report, switch pane
                                  if (selectedReport?.id === r.id)
                                    setModalPane("ATTACHMENTS");
                                } catch (err: any) {
                                  if (err?.status === 409) {
                                    alert(
                                      "ℹ️ Duplicate attachment already exists.",
                                    );
                                  } else if (err?.status === 403) {
                                    alert(
                                      "⚠️ Forbidden. Check role/scopes for attachment upload.",
                                    );
                                  } else {
                                    alert(err?.message || "Upload failed");
                                  }
                                } finally {
                                  setUploadingId(null);
                                }
                              }}
                            />

                            {/* Upload Button */}
                            <button
                              type="button"
                              disabled={rowBusy || rowUploading}
                              className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                              onClick={() => fileInputs.current[r.id]?.click()}
                            >
                              {rowUploading ? <Spinner /> : "⬆️"}
                              {rowUploading ? "Uploading..." : "Upload"}
                            </button>
                          </>
                        </div>
                      </td>
                    </tr>
                  );
                })}

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
                    disabled={modalUpdating}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                    onClick={async () => {
                      if (modalUpdating) return;
                      setModalUpdating(true);

                      try {
                        const r = selectedReport;
                        if (!r) return;

                        if (
                          r.status === "PRELIMINARY_TESTING_NEEDS_CORRECTION"
                        ) {
                          const newStatus =
                            "UNDER_CLIENT_PRELIMINARY_CORRECTION";
                          await setStatus(
                            r,
                            newStatus,
                            "Sent back to client for correction",
                          );

                          setReports((prev) =>
                            prev.map((x) =>
                              x.id === r.id ? { ...x, status: newStatus } : x,
                            ),
                          );
                        }

                        setSelectedReport(null);
                        openUpdateTarget(r);
                      } catch (e: any) {
                        alert(e?.message || "Failed to update status");
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
                            ? "CoaReport"
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
                      clientCode: user?.clientCode || null,
                    });
                    setPrintingSingle(true);
                    setSinglePrintReport(selectedReport);
                  }}
                >
                  {printingSingle ? <SpinnerDark /> : "🖨️"}
                  {printingSingle ? "Preparing..." : "Print"}
                </button>

                <button
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
                  onClick={() => {
                    setSelectedReport(null);
                    setModalPane("FORM"); // ✅ reset state so URL won't re-add it
                    setSearchParams(
                      (prev) => {
                        const sp = new URLSearchParams(prev);
                        sp.delete("pane");
                        return sp;
                      },
                      { replace: true },
                    );
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="overflow-y-auto px-6 py-4 max-h-[calc(90vh-72px)]">
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
              ) : selectedReport?.formType === "STERILITY" ? (
                <SterilityReportFormView
                  report={selectedReport}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane={modalPane}
                  onPaneChange={setModalPane}
                />
              ) : selectedReport?.formType === "CHEMISTRY_MIX" ? (
                <ChemistryMixReportFormView
                  report={selectedReport}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane={modalPane}
                  onPaneChange={setModalPane}
                />
              ) : selectedReport?.formType === "COA" ? (
                <COAReportFormView
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

      {bulkESignOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
              if (e.target === e.currentTarget && !bulkUpdating)
                setBulkESignOpen(false);
            }}
          >
            <div className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden">
              <div className="border-b px-5 py-4">
                <div className="text-lg font-semibold">E-Verify required</div>
                <div className="text-sm text-slate-500 mt-1">
                  You’re changing status for{" "}
                  <span className="font-medium">{selectedIds.length}</span>{" "}
                  reports to{" "}
                  <span className="font-medium">
                    {niceStatus(bulkPendingStatus)}
                  </span>
                  .
                </div>
              </div>

              <div className="px-5 py-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Reason
                  </label>
                  <input
                    value={bulkESignReason}
                    onChange={(e) => setBulkESignReason(e.target.value)}
                    placeholder="Enter change reason (21 CFR Part 11)"
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
                    disabled={bulkUpdating}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Password
                  </label>
                  <input
                    type="password"
                    value={bulkESignPassword}
                    onChange={(e) => setBulkESignPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
                    disabled={bulkUpdating}
                  />
                </div>

                <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  This will be recorded in the audit trail as an electronically
                  signed status change.
                </div>
              </div>

              <div className="border-t px-5 py-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-60"
                  onClick={() => setBulkESignOpen(false)}
                  disabled={bulkUpdating}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-2"
                  disabled={
                    bulkUpdating ||
                    !bulkPendingStatus ||
                    bulkESignReason.trim().length < 3 ||
                    bulkESignPassword.trim().length < 3
                  }
                  onClick={async () => {
                    try {
                      await applyBulkStatusChange(
                        bulkPendingStatus,
                        bulkESignReason.trim(),
                        bulkESignPassword,
                      );
                      setBulkESignOpen(false);
                    } catch (e: any) {
                      alert(e?.message || "❌ Bulk status update failed");
                    }
                  }}
                >
                  {bulkUpdating ? <Spinner /> : null}
                  {bulkUpdating ? "Signing..." : "E-Verify & Apply"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
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
