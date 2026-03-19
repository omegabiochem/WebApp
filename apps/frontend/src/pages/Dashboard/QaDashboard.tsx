// QaDashboard.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import {
  canShowSterilityUpdateButton,
  STERILITY_STATUS_COLORS,
  type SterilityReportStatus,
} from "../../utils/SterilityReportFormWorkflow";
import COAReportFormView from "../Reports/COAReportFormView";
import { parseIntSafe } from "../../utils/commonDashboardUtil";
import ReportWorkspaceModal from "../../utils/ReportWorkspaceModal";
import { getReportSearchBlob } from "../../utils/clientDashboardutils";

// ---------------------------------
// Types
// ---------------------------------
type Report = {
  id: string;
  client: string;
  clientCode?: string | null;
  formType: string;
  dateSent: string | null;
  status: ReportStatus | ChemistryReportStatus | SterilityReportStatus | string;
  reportNumber: string | number | null;
  formNumber: string | null;
  createdAt: string;
  version: number;

  // optional searchable fields
  updatedAt?: string | null;

  typeOfTest?: string | null;
  sampleType?: string | null;
  formulaNo?: string | null;
  description?: string | null;
  lotNo?: string | null;
  manufactureDate?: string | null;

  sampleDescription?: string | null;
  lotBatchNo?: string | null;
  formulaId?: string | null;
  sampleSize?: string | null;
  numberOfActives?: string | null;
  comments?: string | null;

  idNo?: string | null;
  samplingDate?: string | null;

  preliminaryResults?: string | null;
  tbc_result?: string | null;
  tbc_spec?: string | null;
  tmy_result?: string | null;
  tmy_spec?: string | null;

  volumeTested?: string | null;
  ftm_result?: string | null;
  scdb_result?: string | null;

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

// ---------------------------------
// Constants
// ---------------------------------
const formTypeToSlug: Record<string, string> = {
  MICRO_MIX: "micro-mix",
  MICRO_MIX_WATER: "micro-mix-water",
  STERILITY: "sterility",
  CHEMISTRY_MIX: "chemistry-mix",
  COA: "coa",
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
  "VOID",
];

// A status filter can be micro OR chemistry OR "ALL"
type DashboardStatus =
  | "ALL"
  | ReportStatus
  | ChemistryReportStatus
  | SterilityReportStatus;

const QA_MICRO_STATUSES: DashboardStatus[] = [
  "ALL",
  ...ALL_STATUSES.filter((s) => s !== "ALL"),
];

const QA_CHEM_STATUSES: DashboardStatus[] = [
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
];

const QA_STERILITY_STATUSES: DashboardStatus[] = [
  "ALL",
  // ✅ Put ONLY sterility-valid statuses here
  // Example (replace with your real ones):
  "DRAFT",
  "SUBMITTED_BY_CLIENT",
  "RECEIVED_BY_FRONTDESK",
  "UNDER_PRELIMINARY_TESTING_REVIEW",
  "PRELIMINARY_TESTING_NEEDS_CORRECTION",
  "UNDER_CLIENT_PRELIMINARY_CORRECTION",
  "UNDER_QA_PRELIMINARY_REVIEW",
  "QA_NEEDS_PRELIMINARY_CORRECTION",
  "UNDER_ADMIN_REVIEW",
  "FINAL_APPROVED",
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
  return r.reportNumber || "-";
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

// QA fields edited in Update view
const QA_FIELDS_ON_FORM = [
  "comments",
  "reviewedBy",
  "reviewedDate",
  "approvedBy",
  "approvedDate",
  "adminNotes",
  "dateCompleted",
];

// -----------------------------
// Bulk print area (QA)
// -----------------------------
// type PrintJob = {
//   report: Report;
//   isSingle: boolean;
// };

function BulkPrintAreaQA({
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
    <div id="bulk-print-root" className="hidden print:block">
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
        if (r.formType === "STERILITY") {
          return (
            <div key={r.id} className="report-page">
              <SterilityReportFormView
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

        if (r.formType === "COA") {
          return (
            <div key={r.id} className="report-page">
              <COAReportFormView
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

type ReportFamily = "MICRO" | "STERILITY" | "CHEMISTRY";

function getReportFamily(r: Report): ReportFamily {
  if (r.formType === "STERILITY") return "STERILITY";
  if (r.formType === "CHEMISTRY_MIX" || r.formType === "COA")
    return "CHEMISTRY";
  return "MICRO"; // MICRO_MIX + MICRO_MIX_WATER
}

function getStatusesForFamily(family: ReportFamily): string[] {
  if (family === "CHEMISTRY")
    return QA_CHEM_STATUSES.filter((s) => s !== "ALL").map(String);
  if (family === "STERILITY")
    return QA_STERILITY_STATUSES.filter((s) => s !== "ALL").map(String);
  return QA_MICRO_STATUSES.filter((s) => s !== "ALL").map(String);
}

const DEFAULT_QA_FILTERS = {
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
  datePreset: "ALL" as DatePreset,
  dateFrom: "",
  dateTo: "",
  numberRangeType: "FORM" as "FORM" | "REPORT",
  formNoFrom: "",
  formNoTo: "",
  reportNoFrom: "",
  reportNoTo: "",
  perPage: 10,
  page: 1,
};

function extractYearAndSequence(value?: string | number | null): {
  year: number | null;
  sequence: number | null;
} {
  if (value == null) return { year: null, sequence: null };

  const text = String(value).trim();

  // take the last continuous digit block, e.g. ABC-20260001 -> 20260001
  const match = text.match(/(\d{5,})$/);
  if (!match) return { year: null, sequence: null };

  const digits = match[1];

  // expect YYYY + sequence
  if (digits.length < 5) {
    return { year: null, sequence: null };
  }

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

// ---------------------------------
// Component
// ---------------------------------
export default function QaDashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const navigate = useNavigate();
  const { user } = useAuth();

  const userKey =
    (user as any)?.id ||
    (user as any)?.userId ||
    (user as any)?.sub ||
    (user as any)?.uid ||
    "qa";

  const FILTER_STORAGE_KEY = `qaDashboardFilters:user:${userKey}`;

  function getInitialQaFilters() {
    try {
      const spForm = searchParams.get("form");
      const spStatus = searchParams.get("status");
      const spClient = searchParams.get("client");
      const spReport = searchParams.get("report");
      const spDp = searchParams.get("dp");
      const spFrom = searchParams.get("from");
      const spTo = searchParams.get("to");
      const spPp = searchParams.get("pp");
      const spP = searchParams.get("p");
      const spQ = searchParams.get("q");
      const spFormFrom = searchParams.get("formFrom");
      const spFormTo = searchParams.get("formTo");
      const spReportFrom = searchParams.get("reportFrom");
      const spReportTo = searchParams.get("reportTo");
      const spRangeType = searchParams.get("rangeType");

      const hasUrlFilters =
        spForm ||
        spStatus ||
        spClient ||
        spReport ||
        spDp ||
        spFrom ||
        spTo ||
        spPp ||
        spP ||
        spQ ||
        spFormFrom ||
        spFormTo ||
        spReportFrom ||
        spReportTo ||
        spRangeType;

      if (hasUrlFilters) {
        return {
          formFilter: (spForm as any) || DEFAULT_QA_FILTERS.formFilter,
          statusFilter: (spStatus as any) || DEFAULT_QA_FILTERS.statusFilter,
          searchClient: spClient || DEFAULT_QA_FILTERS.searchClient,
          searchReport: spReport || DEFAULT_QA_FILTERS.searchReport,
          datePreset: (spDp as DatePreset) || DEFAULT_QA_FILTERS.datePreset,
          dateFrom: spFrom || DEFAULT_QA_FILTERS.dateFrom,
          dateTo: spTo || DEFAULT_QA_FILTERS.dateTo,
          perPage: parseIntSafe(spPp, DEFAULT_QA_FILTERS.perPage),
          page: parseIntSafe(spP, DEFAULT_QA_FILTERS.page),
          searchText: spQ || DEFAULT_QA_FILTERS.searchText,
          formNoFrom: spFormFrom || DEFAULT_QA_FILTERS.formNoFrom,
          formNoTo: spFormTo || DEFAULT_QA_FILTERS.formNoTo,
          reportNoFrom: spReportFrom || DEFAULT_QA_FILTERS.reportNoFrom,
          reportNoTo: spReportTo || DEFAULT_QA_FILTERS.reportNoTo,
          numberRangeType:
            (spRangeType as "FORM" | "REPORT") ||
            DEFAULT_QA_FILTERS.numberRangeType,
        };
      }

      const raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (raw) {
        return {
          ...DEFAULT_QA_FILTERS,
          ...JSON.parse(raw),
        };
      }
    } catch {
      // ignore
    }

    return DEFAULT_QA_FILTERS;
  }

  // Filters
  const initialFilters = getInitialQaFilters();

  const [searchClient, setSearchClient] = useState(initialFilters.searchClient);
  const [searchReport, setSearchReport] = useState(initialFilters.searchReport);
  const [dateFrom, setDateFrom] = useState(initialFilters.dateFrom);
  const [dateTo, setDateTo] = useState(initialFilters.dateTo);

  const [formFilter, setFormFilter] = useState<
    "ALL" | "MICRO" | "MICROWATER" | "STERILITY" | "CHEMISTRY" | "COA"
  >(initialFilters.formFilter);

  const [statusFilter, setStatusFilter] = useState<DashboardStatus>(
    initialFilters.statusFilter,
  );

  const [perPage, setPerPage] = useState(initialFilters.perPage);
  const [page, setPage] = useState(initialFilters.page);

  const [datePreset, setDatePreset] = useState<DatePreset>(
    initialFilters.datePreset,
  );

  const [searchText, setSearchText] = useState(initialFilters.searchText);
  const [formNoFrom, setFormNoFrom] = useState(initialFilters.formNoFrom);
  const [formNoTo, setFormNoTo] = useState(initialFilters.formNoTo);
  const [reportNoFrom, setReportNoFrom] = useState(initialFilters.reportNoFrom);
  const [reportNoTo, setReportNoTo] = useState(initialFilters.reportNoTo);

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

  const statusOptions =
    formFilter === "CHEMISTRY"
      ? QA_CHEM_STATUSES
      : formFilter === "STERILITY"
        ? QA_STERILITY_STATUSES
        : QA_MICRO_STATUSES;

  const [numberRangeType, setNumberRangeType] = useState<"FORM" | "REPORT">(
    (initialFilters as any).numberRangeType || "FORM",
  );

  // UX guards
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // -----------------------------
  // Selection + Printing (QA)
  // -----------------------------
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkPrinting, setIsBulkPrinting] = useState(false);
  const [singlePrintReport, setSinglePrintReport] = useState<Report | null>(
    null,
  );
  const [printingBulk, setPrintingBulk] = useState(false);
  const [printingSingle, setPrintingSingle] = useState(false);

  const isRowSelected = (id: string) => selectedIds.includes(id);

  const toggleRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

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
  const map = new Map<string, Report>();
  reports.forEach((r) => map.set(r.id, r));

  return workspaceIds
    .map((id) => map.get(id))
    .filter(Boolean)
    .map((r) => ({
      ...r!,
      formNumber: r!.formNumber ?? "",
      reportNumber:
        r!.reportNumber != null ? String(r!.reportNumber) : undefined,
    }));
}, [workspaceIds, reports]);

  // -----------------------------
  // Bulk Change Status (QA)
  // -----------------------------
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);

  const [bulkChangeReports, setBulkChangeReports] = useState<Report[]>([]);
  const [bulkNewStatus, setBulkNewStatus] = useState<string>("");
  const [bulkReason, setBulkReason] = useState<string>("");
  const [bulkESignPassword, setBulkESignPassword] = useState<string>("");
  const [bulkESignError, setBulkESignError] = useState<string>("");
  const [bulkSaving, setBulkSaving] = useState<boolean>(false);

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
  }, []);

  // ✅ Reset invalid status when switching formFilter
  useEffect(() => {
    const opts = statusOptions.map(String);
    if (statusFilter !== "ALL" && !opts.includes(String(statusFilter))) {
      setStatusFilter("ALL");
    }
  }, [formFilter, statusOptions]); // ✅ include statusOptions

const reportsWithSearch = useMemo(() => {
  return reports.map((r) => ({
    ...r,
    _searchBlob: getReportSearchBlob(r),
  }));
}, [reports]);


  // Derived rows (filter → search → sort)
  const processed = useMemo(() => {
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
            (r.formNumber || "").toLowerCase().includes(q)
          );
        })
      : byClient;

const bySearchText = searchText.trim()
  ? byReport.filter((r) => {
      const q = searchText.trim().toLowerCase();
      return (r._searchBlob || "").includes(q);
    })
  : byReport;

    const byNumberRange = (
      numberRangeType === "FORM"
        ? formNoFrom.trim() || formNoTo.trim()
        : reportNoFrom.trim() || reportNoTo.trim()
    )
      ? bySearchText.filter((r) => {
          if (numberRangeType === "FORM") {
            return inRange(
              extractYearAndSequence(r.formNumber).sequence,
              formNoFrom,
              formNoTo,
            );
          }

          return inRange(
            extractYearAndSequence(
              typeof r.reportNumber === "number" && r.formNumber
                ? r.formNumber.replace(/\d+$/, String(r.reportNumber))
                : r.reportNumber,
            ).sequence,
            reportNoFrom,
            reportNoTo,
          );
        })
      : bySearchText;

    // keep your behavior: filter/sort using dateSent
    const byDate = byNumberRange.filter((r) =>
      matchesDateRange(r.dateSent, dateFrom || undefined, dateTo || undefined),
    );

    return [...byDate].sort((a, b) => {
      const aT = a.dateSent ? new Date(a.dateSent).getTime() : 0;
      const bT = b.dateSent ? new Date(b.dateSent).getTime() : 0;
      return bT - aT;
    });
  }, [
 reportsWithSearch,
    formFilter,
    statusFilter,
    searchClient,
    searchReport,
    searchText,
    formNoFrom,
    formNoTo,
    numberRangeType,
    reportNoFrom,
    reportNoTo,
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
    formFilter,
    statusFilter,
    searchClient,
    searchReport,
    searchText,
    formNoFrom,
    formNoTo,
    reportNoFrom,
    reportNoTo,
    numberRangeType,
    datePreset,
    dateFrom,
    dateTo,
    perPage,
  ]);

  useEffect(() => {
    const sp = new URLSearchParams();

    // form + status
    if (formFilter && formFilter !== "ALL") sp.set("form", formFilter);
    sp.set("status", String(statusFilter));

    // search
    if (searchClient.trim()) sp.set("client", searchClient.trim());
    if (searchReport.trim()) sp.set("report", searchReport.trim());

    // date
    sp.set("dp", datePreset);
    if (dateFrom) sp.set("from", dateFrom);
    if (dateTo) sp.set("to", dateTo);

    // paging
    sp.set("pp", String(perPage));
    sp.set("p", String(pageClamped));

    if (searchText.trim()) sp.set("q", searchText.trim());

    if (formNoFrom.trim()) sp.set("formFrom", formNoFrom.trim());
    if (formNoTo.trim()) sp.set("formTo", formNoTo.trim());

    if (reportNoFrom.trim()) sp.set("reportFrom", reportNoFrom.trim());
    if (reportNoTo.trim()) sp.set("reportTo", reportNoTo.trim());
    sp.set("rangeType", numberRangeType);

    setSearchParams(sp, { replace: true });
  }, [
    formFilter,
    statusFilter,
    searchClient,
    searchReport,
    datePreset,
    dateFrom,
    dateTo,
    perPage,
    pageClamped,
    searchText,
    formNoFrom,
    formNoTo,
    reportNoFrom,
    reportNoTo,
    setSearchParams,
  ]);

  const allOnPageSelectedNow =
    pageRows.length > 0 && pageRows.every((r) => selectedIds.includes(r.id));

  const toggleSelectPage = () => {
    if (allOnPageSelectedNow) {
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
      details: `QA printed selected reports (${selectedIds.length})`,
      entityId: selectedIds.join(","),
      meta: { reportIds: selectedIds, count: selectedIds.length },
      formNumber: selectedReportObjects.map((r) => r.formNumber).join(","),
      reportNumber: selectedReportObjects.map((r) => r.reportNumber).join(","),
      formType: selectedReportObjects.map((r) => r.formType).join(","),
      clientCode: selectedReportObjects.map((r) => r.client || null).join(","),
    });

    setPrintingBulk(true);
    setIsBulkPrinting(true);
  };

  // clear selection when filters change (recommended)
  useEffect(() => {
    setSelectedIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formFilter,
    statusFilter,
    searchClient,
    searchReport,
    datePreset,
    dateFrom,
    dateTo,
    perPage,
    pageClamped,
    searchText,
    formNoFrom,
    formNoTo,
    reportNoFrom,
    reportNoTo,
  ]);

  // Permissions
  function canUpdateThisMicro(r: Report, userObj?: any) {
    return canShowUpdateButton(
      userObj?.role as Role,
      r.status as ReportStatus,
      QA_FIELDS_ON_FORM,
    );
  }
  function canUpdateThisSterility(r: Report, userObj?: any) {
    return canShowSterilityUpdateButton(
      userObj?.role as Role,
      r.status as SterilityReportStatus,
      QA_FIELDS_ON_FORM,
    );
  }
  function canUpdateThisChem(r: Report, userObj?: any) {
    return canShowChemistryUpdateButton(
      userObj?.role,
      r.status as ChemistryReportStatus,
      QA_FIELDS_ON_FORM,
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
        report.formType === "CHEMISTRY_MIX" || report.formType === "COA"
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
    if (r.formType === "CHEMISTRY_MIX" || r.formType === "COA") {
      navigate(`/chemistry-reports/${slug}/${r.id}`);
    } else {
      navigate(`/reports/${slug}/${r.id}`);
    }
  }

  const badgeClasses = (r: Report) => {
    const isChem = r.formType === "CHEMISTRY_MIX" || r.formType === "COA";
    const isSterility = r.formType === "STERILITY";
    return (
      (isChem
        ? CHEMISTRY_STATUS_COLORS?.[r.status as ChemistryReportStatus]
        : isSterility
          ? STERILITY_STATUS_COLORS?.[r.status as SterilityReportStatus]
          : STATUS_COLORS?.[r.status as ReportStatus]) ||
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
      searchText.trim() !== "" ||
      formNoFrom !== "" ||
      formNoTo !== "" ||
      reportNoFrom !== "" ||
      reportNoTo !== "" ||
      perPage !== 10
    );
  }, [
    formFilter,
    statusFilter,
    searchClient,
    searchReport,
    searchText,
    datePreset,
    dateFrom,
    dateTo,
    formNoFrom,
    formNoTo,
    reportNoFrom,
    reportNoTo,
    perPage,
  ]);

  const clearFilters = () => {
    setSearchClient(DEFAULT_QA_FILTERS.searchClient);
    setSearchReport(DEFAULT_QA_FILTERS.searchReport);
    setDatePreset(DEFAULT_QA_FILTERS.datePreset);
    setDateFrom(DEFAULT_QA_FILTERS.dateFrom);
    setDateTo(DEFAULT_QA_FILTERS.dateTo);
    setStatusFilter(DEFAULT_QA_FILTERS.statusFilter);
    setFormFilter(DEFAULT_QA_FILTERS.formFilter);
    setPerPage(DEFAULT_QA_FILTERS.perPage);
    setPage(DEFAULT_QA_FILTERS.page);
    setSearchText("");
    setFormNoFrom("");
    setFormNoTo("");
    setReportNoFrom("");
    setReportNoTo("");
    setNumberRangeType("FORM");

    try {
      localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify(DEFAULT_QA_FILTERS),
      );
    } catch {
      // ignore
    }
  };

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

  useLiveReportStatus(setReports);

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
      formNumber: voidableSelected.map((r) => r.formNumber).join(","),
      reportNumber: voidableSelected.map((r) => r.reportNumber).join(","),
      formType: voidableSelected.map((r) => r.formType).join(","),
      clientCode: voidableSelected.map((r) => r.client || null).join(","),
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

  const selectedFamilies = Array.from(
    new Set(selectedReportObjects.map(getReportFamily)),
  );
  const selectedSameFamily = selectedFamilies.length === 1;
  const selectedFamily = selectedSameFamily ? selectedFamilies[0] : null;

  const bulkStatusOptions = selectedFamily
    ? getStatusesForFamily(selectedFamily)
    : [];

  async function handleBulkChangeStatus(
    reportsToChange: Report[],
    nextStatus: string,
  ) {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Missing auth token");
      return;
    }

    setBulkSaving(true);
    setBulkESignError("");

    try {
      if (!bulkReason.trim()) {
        setBulkSaving(false);
        alert("Reason for change is required.");
        return;
      }

      if (needsESign(nextStatus) && !bulkESignPassword) {
        setBulkSaving(false);
        setBulkESignError("E-signature password is required.");
        return;
      }

      await Promise.all(
        reportsToChange.map(async (report) => {
          // ✅ same endpoint logic as handleChangeStatus
          const endpoint =
            report.formType === "CHEMISTRY_MIX" || report.formType === "COA"
              ? `/chemistry-reports/${report.id}/change-status`
              : `/reports/${report.id}/change-status`;

          await api(endpoint, {
            method: "PATCH",
            body: JSON.stringify({
              status: nextStatus,
              reason: bulkReason,
              eSignPassword: bulkESignPassword,
            }),
          });
        }),
      );

      setReports((prev) =>
        prev.map((r) =>
          reportsToChange.some((x) => x.id === r.id)
            ? { ...r, status: nextStatus }
            : r,
        ),
      );

      toast.success(`Updated ${reportsToChange.length} report(s)`);

      // reset
      setBulkChangeReports([]);
      setBulkNewStatus("");
      setBulkReason("");
      setBulkESignPassword("");
      setBulkESignError("");
      setSelectedIds([]);
    } catch (err: any) {
      const backendMsg =
        err?.message ||
        err?.response?.data?.message ||
        err?.error ||
        err?.toString() ||
        "";

      if (backendMsg.toLowerCase().includes("electronic")) {
        setBulkESignError("❌ Invalid e-signature password. Please try again.");
      } else if (backendMsg.toLowerCase().includes("reason")) {
        setBulkESignError("⚠️ Please provide a valid reason for this change.");
      } else {
        setBulkESignError("⚠️ Something went wrong while changing status.");
        console.error("Bulk status change error:", err);
      }
    } finally {
      setBulkSaving(false);
    }
  }

  useEffect(() => {
    const close = () => setBulkMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

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
          datePreset,
          dateFrom,
          dateTo,
          numberRangeType,
          formNoFrom,
          formNoTo,
          reportNoFrom,
          reportNoTo,
          perPage,
          page,
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
    datePreset,
    dateFrom,
    dateTo,
    perPage,
    page,
    searchText,
    formNoFrom,
    formNoTo,
    reportNoFrom,
    reportNoTo,
  ]);

  function getTargetsForAction(clicked: Report): Report[] {
    const selected = selectedIds
      .map((id) => reports.find((r) => r.id === id))
      .filter(Boolean) as Report[];

    if (!selected.length) return [clicked];

    const clickedInsideSelection = selected.some((r) => r.id === clicked.id);
    return clickedInsideSelection ? selected : [clicked];
  }

  function canUpdateAnyReport(r: Report, userObj?: any) {
    if (r.formType === "STERILITY") {
      return canUpdateThisSterility(r, userObj);
    }

    if (r.formType === "CHEMISTRY_MIX" || r.formType === "COA") {
      return canUpdateThisChem(r, userObj);
    }

    return canUpdateThisMicro(r, userObj);
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

  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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

            <BulkPrintAreaQA
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
          <h1 className="text-2xl font-bold tracking-tight">QA Dashboard</h1>
          <p className="text-sm text-slate-500">
            Oversee all reports and manage status transitions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {ENABLE_BULK_STATUS && (
            <div className="relative">
              <button
                type="button"
                disabled={
                  !selectedIds.length ||
                  !selectedSameFamily ||
                  printingBulk ||
                  bulkSaving
                }
                onClick={(e) => {
                  e.stopPropagation();
                  setBulkMenuOpen((o) => !o);
                }}
                className={classNames(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm disabled:opacity-60 disabled:cursor-not-allowed",
                  selectedIds.length && selectedSameFamily
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-slate-200 text-slate-500",
                )}
                title={
                  !selectedIds.length
                    ? "Select reports first"
                    : !selectedSameFamily
                      ? "Select same report type family only"
                      : "Bulk status change"
                }
              >
                ⚡ Bulk Status ({selectedIds.length})
              </button>

              {bulkMenuOpen && bulkStatusOptions.length > 0 && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl border bg-white shadow-lg ring-1 ring-black/5 z-20">
                  <div className="max-h-80 overflow-auto py-1 text-sm">
                    {bulkStatusOptions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="flex w-full items-center px-3 py-2 hover:bg-slate-100 text-left"
                        onClick={() => {
                          setBulkMenuOpen(false);
                          setBulkChangeReports(selectedReportObjects);
                          setBulkNewStatus(s);
                          setBulkReason("");
                          setBulkESignPassword("");
                          setBulkESignError("");
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
          {/* <input
            placeholder="Search by client"
            value={searchClient}
            onChange={(e) => setSearchClient(e.target.value)}
            className="flex-1 min-w-[160px] rounded-lg border px-3 py-2 text-sm
              ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
          /> */}
          {/* Global text search */}
          <input
           placeholder="Search client, code, form #, report #, lot #, formula, description, status..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="flex-1 min-w-[260px] rounded-lg border px-3 py-2 text-sm
    ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
          />

          {/* Search report */}
          {/* <input
            placeholder="Search by report #"
            value={searchReport}
            onChange={(e) => setSearchReport(e.target.value)}
            className="flex-1 min-w-[180px] rounded-lg border px-3 py-2 text-sm
              ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
          /> */}

          {/* Date preset + custom */}
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
          <div className="flex items-center gap-3">
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
              placeholder={`${numberRangeType === "FORM" ? "Form" : "Report"} # from`}
              value={numberRangeType === "FORM" ? formNoFrom : reportNoFrom}
              onChange={(e) => {
                if (numberRangeType === "FORM") {
                  setFormNoFrom(e.target.value);
                } else {
                  setReportNoFrom(e.target.value);
                }
              }}
              className="w-36 rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />

            <input
              type="number"
              placeholder={`${numberRangeType === "FORM" ? "Form" : "Report"} # to`}
              value={numberRangeType === "FORM" ? formNoTo : reportNoTo}
              onChange={(e) => {
                if (numberRangeType === "FORM") {
                  setFormNoTo(e.target.value);
                } else {
                  setReportNoTo(e.target.value);
                }
              }}
              className="w-36 rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
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
                {/* ✅ selection column */}
                <th className="px-4 py-3 font-medium w-10">
                  <input
                    type="checkbox"
                    checked={allOnPageSelectedNow}
                    onChange={toggleSelectPage}
                  />
                </th>

                <th className="px-4 py-3 font-medium">Report #</th>
                <th className="px-4 py-3 font-medium">Form #</th>
                <th className="px-4 py-3 font-medium">Client</th>
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
                    <td className="px-4 py-3">
                      <div className="h-8 w-40 animate-pulse rounded bg-slate-200" />
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
                  const rowBusy = updatingId === r.id;

                  return (
                    <tr key={r.id} className="border-t hover:bg-slate-50">
                      {/* ✅ row checkbox */}
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
                      <td className="px-4 py-3">{formatDate(r.dateSent)}</td>

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
                                    : r.formType === "COA"
                                      ? "CoaReport"
                                      : "Micro Report",
                                entityId: r.id,
                                details: `Viewed ${r.formNumber}`,
                                meta: {
                                  formNumber: r.formNumber,
                                  formType: r.formType,
                                  status: r.status,
                                },
                                formNumber: r.formNumber,
                                reportNumber: String(r.reportNumber),
                                formType: r.formType,
                                clientCode: r.client || null,
                              });

                              openViewTarget(r);
                            }}
                            disabled={rowBusy}
                          >
                            View
                          </button>

                          {/* ✅ Update buttons with your existing transitions */}
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
                                    await setStatus(r, next, "set by qa");
                                    setReports((prev) =>
                                      prev.map((x) =>
                                        x.id === r.id
                                          ? { ...x, status: next }
                                          : x,
                                      ),
                                    );
                                    toast.success("Report Status Updated");
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
                                    await setStatus(r, next, "set by qa");
                                    setReports((prev) =>
                                      prev.map((x) =>
                                        x.id === r.id
                                          ? { ...x, status: next }
                                          : x,
                                      ),
                                    );
                                    toast.success("Report Status Updated");
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
                              {rowBusy ? <Spinner /> : null}
                              {rowBusy ? "Updating..." : "Update"}
                            </button>
                          )}

                          {r.formType === "STERILITY" &&
                            canUpdateThisSterility(r, user) && (
                              <button
                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                disabled={rowBusy}
                                onClick={async () => {
                                  if (rowBusy) return;
                                  setUpdatingId(r.id);
                                  try {
                                    if (
                                      r.status === "CLIENT_NEEDS_CORRECTION"
                                    ) {
                                      const next =
                                        "UNDER_RESUBMISSION_TESTING_REVIEW";
                                      await setStatus(r, next, "set by qa");
                                      setReports((prev) =>
                                        prev.map((x) =>
                                          x.id === r.id
                                            ? { ...x, status: next }
                                            : x,
                                        ),
                                      );
                                      toast.success("Report Status Updated");
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
                                {rowBusy ? <Spinner /> : null}
                                {rowBusy ? "Updating..." : "Update"}
                              </button>
                            )}

                          {/* Change status dialog */}
                          <button
                            className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-purple-700"
                            onClick={() => {
                              setChangeStatusReport(r);

                              const options =
                                r.formType === "CHEMISTRY_MIX" ||
                                r.formType === "COA"
                                  ? QA_CHEM_STATUSES
                                  : r.formType === "STERILITY"
                                    ? QA_STERILITY_STATUSES
                                    : QA_MICRO_STATUSES;

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

              {/* ✅ Pane switcher */}
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
                        selectedReport.formType === "CHEMISTRY_MIX" ||
                        selectedReport.formType === "COA"
                          ? "ChemistryReport"
                          : "MicroReport",
                      entityId: selectedReport.id,
                      details: `QA printed ${selectedReport.formNumber ?? selectedReport.id}`,
                      meta: {
                        formNumber: selectedReport.formNumber,
                        formType: selectedReport.formType,
                        status: selectedReport.status,
                      },
                      formNumber: selectedReport.formNumber,
                      reportNumber: String(selectedReport.reportNumber),
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

                {/* ✅ show Update in modal for micro OR chem */}
                {(selectedReport.formType === "CHEMISTRY_MIX" ||
                selectedReport.formType === "COA"
                  ? canUpdateThisChem(selectedReport, user)
                  : selectedReport.formType === "STERILITY"
                    ? canUpdateThisSterility(selectedReport, user)
                    : canUpdateThisMicro(selectedReport, user)) && (
                  <button
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                    onClick={async () => {
                      try {
                        const r = selectedReport;

                        // keep your existing micro transition
                        if (
                          (r.formType === "MICRO_MIX" ||
                            r.formType === "MICRO_MIX_WATER") &&
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
                        openUpdateTarget(r);
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
              ) : selectedReport?.formType === "STERILITY" ? (
                <SterilityReportFormView
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
              ) : selectedReport?.formType === "CHEMISTRY_MIX" ? (
                <ChemistryMixReportFormView
                  report={selectedReport as any}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane={modalPane}
                  onPaneChange={setModalPane}
                />
              ) : selectedReport?.formType === "COA" ? (
                <COAReportFormView
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
                {(changeStatusReport.formType === "CHEMISTRY_MIX" ||
                changeStatusReport.formType === "COA"
                  ? QA_CHEM_STATUSES
                  : changeStatusReport.formType === "STERILITY"
                    ? QA_STERILITY_STATUSES
                    : QA_MICRO_STATUSES
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

                  {/* decoys */}
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

      {statusModal.open &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
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
              }
            }}
          >
            <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Void selected reports
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {selectedIds.length} report(s) will be marked{" "}
                    <span className="font-medium text-slate-700">VOID</span>.
                  </div>
                </div>

                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                  disabled={statusModal.submitting}
                  onClick={() =>
                    setStatusModal((s) => ({
                      ...s,
                      open: false,
                      reason: "",
                      password: "",
                      error: null,
                    }))
                  }
                  aria-label="Close"
                  title="Close"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <form
                className="space-y-3 px-4 py-3"
                autoComplete="off"
                onSubmit={(e) => e.preventDefault()}
              >
                {/* Selected reports (compact) */}
                <div className="rounded-lg border bg-slate-50 p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="text-[11px] font-semibold text-slate-700">
                      Selected
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {selectedReportObjects.length}
                    </div>
                  </div>

                  <div className="max-h-28 overflow-auto rounded-md bg-white ring-1 ring-slate-200">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-white">
                        <tr className="text-left text-slate-600">
                          <th className="px-2 py-1.5 font-medium">Form #</th>
                          <th className="px-2 py-1.5 font-medium">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedReportObjects.map((r) => (
                          <tr key={r.id} className="border-t">
                            <td className="px-2 py-1.5 font-medium text-slate-900">
                              {r.formNumber}
                            </td>
                            <td className="px-2 py-1.5 text-slate-700">
                              {niceFormType(r.formType)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-700">
                    Reason <span className="text-rose-600">*</span>
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
                    rows={2}
                    placeholder="Reason for voiding…"
                    className="mt-1 w-full rounded-md border px-2.5 py-2 text-sm outline-none ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-rose-500"
                    disabled={statusModal.submitting}
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-700">
                    E-sign password <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="password"
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
                    placeholder="Password…"
                    className="mt-1 w-full rounded-md border px-2.5 py-2 text-sm outline-none ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-rose-500"
                    disabled={statusModal.submitting}
                  />
                  <div className="mt-1 text-[10px] text-slate-500">
                    Required for 21 CFR Part 11.
                  </div>
                </div>

                {statusModal.error && (
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700">
                    {statusModal.error}
                  </div>
                )}
              </form>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
                <button
                  type="button"
                  className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                  disabled={statusModal.submitting}
                  onClick={() =>
                    setStatusModal((s) => ({
                      ...s,
                      open: false,
                      reason: "",
                      password: "",
                      error: null,
                    }))
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                  disabled={statusModal.submitting}
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
                    } catch (e: any) {
                      setStatusModal((s) => ({
                        ...s,
                        submitting: false,
                        error: e?.message || "Failed to void selected reports.",
                      }));
                    }
                  }}
                >
                  {statusModal.submitting ? <SpinnerDark /> : null}
                  {statusModal.submitting ? "Voiding..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {bulkChangeReports.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Bulk change status"
          onClick={(e) => {
            if (e.target === e.currentTarget && !bulkSaving) {
              setBulkChangeReports([]);
              setBulkNewStatus("");
              setBulkReason("");
              setBulkESignPassword("");
              setBulkESignError("");
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-2">Bulk Change Status</h2>

            <p className="mb-3 text-sm text-slate-600">
              <strong>Selected reports:</strong> {bulkChangeReports.length}
            </p>

            <form
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault();
                handleBulkChangeStatus(bulkChangeReports, bulkNewStatus);
              }}
            >
              <select
                value={bulkNewStatus}
                onChange={(e) => {
                  setBulkNewStatus(e.target.value);
                  setBulkESignError("");
                }}
                className="mb-3 w-full rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
              >
                {bulkStatusOptions.map((s) => (
                  <option key={s} value={s}>
                    {niceStatus(s)}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Reason for change"
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                className="mb-3 w-full rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
              />

              {needsESign(bulkNewStatus) && (
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span>E-signature password</span>
                  </div>

                  <input
                    type="password"
                    placeholder="Enter e-signature password"
                    value={bulkESignPassword}
                    onChange={(e) => {
                      setBulkESignPassword(e.target.value);
                      setBulkESignError("");
                    }}
                    className="w-full rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
                    aria-invalid={!!bulkESignError}
                    autoComplete="off"
                    name="bulk_esign_pwd_manual_only"
                  />

                  {bulkESignError && (
                    <p className="mb-2 mt-2 text-xs text-rose-600">
                      {bulkESignError}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50"
                  onClick={() => {
                    setBulkChangeReports([]);
                    setBulkNewStatus("");
                    setBulkReason("");
                    setBulkESignPassword("");
                    setBulkESignError("");
                  }}
                  disabled={bulkSaving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50 inline-flex items-center gap-2"
                  disabled={
                    bulkSaving ||
                    !bulkReason.trim() ||
                    (needsESign(bulkNewStatus) && !bulkESignPassword)
                  }
                >
                  {bulkSaving ? <Spinner /> : null}
                  {bulkSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
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
