// AdminDashboard.tsx
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
import COAReportFormView from "../Reports/COAReportFormView";
import {
  ChemistryCOLS,
  COLS,
  getInt,
  type DashboardColKey,
} from "../../utils/globalUtils";
import {
  canShowSterilityUpdateButton,
  STERILITY_STATUS_COLORS,
  type SterilityReportStatus,
} from "../../utils/SterilityReportFormWorkflow";
import ReportWorkspaceModal from "../../utils/ReportWorkspaceModal";
import { getReportSearchBlob } from "../../utils/clientDashboardutils";
import { Pin } from "lucide-react";

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

  dateTested?: string | null;
  dateReceived?: string | null;

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

const ALL_STATUSES: (
  | "ALL"
  | ReportStatus
  | SterilityReportStatus
  | ChemistryReportStatus
)[] = [
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

  "UNDER_CHANGE_UPDATE",
  "CORRECTION_REQUESTED",
  "UNDER_CORRECTION_UPDATE",
  "CHANGE_REQUESTED",
];

// A status filter can be micro OR chemistry OR "ALL"
type DashboardStatus =
  | "ALL"
  | ReportStatus
  | SterilityReportStatus
  | ChemistryReportStatus;

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
  "VOID",

  "UNDER_CHANGE_UPDATE",
  "CORRECTION_REQUESTED",
  "UNDER_CORRECTION_UPDATE",
  "CHANGE_REQUESTED",
];

const ADMIN_STERILITY_STATUSES: ("ALL" | SterilityReportStatus)[] = [
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

  "UNDER_CHANGE_UPDATE",
  "CORRECTION_REQUESTED",
  "UNDER_CORRECTION_UPDATE",
  "CHANGE_REQUESTED",
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
  return "MICRO";
}

function getStatusesForReportFamily(family: ReportFamily): string[] {
  if (family === "CHEMISTRY") {
    return ADMIN_CHEM_STATUSES.filter((s) => s !== "ALL").map(String);
  }
  if (family === "STERILITY") {
    return ADMIN_STERILITY_STATUSES.filter((s) => s !== "ALL").map(String);
  }
  return ADMIN_MICRO_STATUSES.filter((s) => s !== "ALL").map(String);
}

const DEFAULT_ADMIN_FILTERS = {
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
  dateField: "createdAt" as
    | "dateSent"
    | "dateTested"
    | "dateReceived"
    | "createdAt"
    | "updatedAt",
};

function extractYearAndSequence(value?: string | number | null): {
  year: number | null;
  sequence: number | null;
} {
  if (value == null) return { year: null, sequence: null };

  const text = String(value).trim();

  // Example:
  // ABC-20260001  => year=2026, sequence=1
  // XYZ20260025   => year=2026, sequence=25
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

// ---------------------------------
// Component
// ---------------------------------
export default function AdminDashboard() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  function getInitialAdminFilters() {
    return {
      formFilter:
        (searchParams.get("form") as any) || DEFAULT_ADMIN_FILTERS.formFilter,
      statusFilter:
        (searchParams.get("status") as DashboardStatus) ||
        DEFAULT_ADMIN_FILTERS.statusFilter,
      searchClient:
        searchParams.get("client") || DEFAULT_ADMIN_FILTERS.searchClient,
      searchReport:
        searchParams.get("report") || DEFAULT_ADMIN_FILTERS.searchReport,
      searchText: searchParams.get("q") || DEFAULT_ADMIN_FILTERS.searchText,
      datePreset:
        (searchParams.get("dp") as DatePreset) ||
        DEFAULT_ADMIN_FILTERS.datePreset,
      dateFrom: searchParams.get("from") || DEFAULT_ADMIN_FILTERS.dateFrom,
      dateTo: searchParams.get("to") || DEFAULT_ADMIN_FILTERS.dateTo,
      numberRangeType:
        (searchParams.get("rangeType") as "FORM" | "REPORT") ||
        DEFAULT_ADMIN_FILTERS.numberRangeType,
      formNoFrom:
        searchParams.get("formFrom") || DEFAULT_ADMIN_FILTERS.formNoFrom,
      formNoTo: searchParams.get("formTo") || DEFAULT_ADMIN_FILTERS.formNoTo,
      reportNoFrom:
        searchParams.get("reportFrom") || DEFAULT_ADMIN_FILTERS.reportNoFrom,
      reportNoTo:
        searchParams.get("reportTo") || DEFAULT_ADMIN_FILTERS.reportNoTo,
      perPage: getInt(searchParams, "pp", DEFAULT_ADMIN_FILTERS.perPage),
      page: getInt(searchParams, "p", DEFAULT_ADMIN_FILTERS.page),
      dateField:
        (searchParams.get("dateField") as
          | "dateSent"
          | "dateTested"
          | "dateReceived"
          | "createdAt"
          | "updatedAt") || DEFAULT_ADMIN_FILTERS.dateField,
      sortOrder: (searchParams.get("sort") as "asc" | "desc") || "desc",
    };
  }

  const initialFilters = getInitialAdminFilters();

  const [formFilter, setFormFilter] = useState<
    "ALL" | "MICRO" | "MICROWATER" | "STERILITY" | "CHEMISTRY" | "COA"
  >(initialFilters.formFilter);

  const [searchClient, setSearchClient] = useState(initialFilters.searchClient);
  const [searchReport, setSearchReport] = useState(initialFilters.searchReport);
  const [searchText, setSearchText] = useState(initialFilters.searchText);

  const [datePreset, setDatePreset] = useState<DatePreset>(
    initialFilters.datePreset,
  );
  const [dateFrom, setDateFrom] = useState(initialFilters.dateFrom);
  const [dateTo, setDateTo] = useState(initialFilters.dateTo);

  const [numberRangeType, setNumberRangeType] = useState<"FORM" | "REPORT">(
    initialFilters.numberRangeType,
  );

  const [formNoFrom, setFormNoFrom] = useState(initialFilters.formNoFrom);
  const [formNoTo, setFormNoTo] = useState(initialFilters.formNoTo);
  const [reportNoFrom, setReportNoFrom] = useState(initialFilters.reportNoFrom);
  const [reportNoTo, setReportNoTo] = useState(initialFilters.reportNoTo);
  const [dateField, setDateField] = useState<
    "dateSent" | "dateTested" | "dateReceived" | "createdAt" | "updatedAt"
  >(initialFilters.dateField);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const allowedPP = [10, 20, 50] as const;
  const [perPage, setPerPage] = useState<(typeof allowedPP)[number]>(
    (allowedPP as readonly number[]).includes(initialFilters.perPage)
      ? (initialFilters.perPage as any)
      : 10,
  );
  const [page, setPage] = useState(initialFilters.page);

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

  // ✅ status filter now uses combined type
  const [statusFilter, setStatusFilter] = useState<DashboardStatus>(
    (searchParams.get("status") as any) || "ALL",
  );

  const statusOptions =
    formFilter === "CHEMISTRY" || formFilter === "COA"
      ? ADMIN_CHEM_STATUSES
      : formFilter === "STERILITY"
        ? ADMIN_STERILITY_STATUSES
        : ADMIN_MICRO_STATUSES;

  // ✅ UX guards
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // -----------------------------
  // Selection + Printing (Admin)
  // -----------------------------
  const [selectedIds, setSelectedIds] = useState<string[]>(
    (searchParams.get("sel") || "").split(",").filter(Boolean),
  );

  const [isBulkPrinting, setIsBulkPrinting] = useState(false);
  const [singlePrintReport, setSinglePrintReport] = useState<Report | null>(
    null,
  );

  const [printingBulk, setPrintingBulk] = useState(false);
  const [printingSingle, setPrintingSingle] = useState(false);

  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);

  const [bulkChangeReports, setBulkChangeReports] = useState<Report[]>([]);
  const [bulkNewStatus, setBulkNewStatus] = useState<string>("");
  const [bulkReason, setBulkReason] = useState<string>("");
  const [bulkESignPassword, setBulkESignPassword] = useState<string>("");
  const [bulkESignError, setBulkESignError] = useState<string>("");
  const [bulkSaving, setBulkSaving] = useState<boolean>(false);

  const navigate = useNavigate();
  const { user } = useAuth();

  const userKey =
    (user as any)?.id ||
    (user as any)?.userId ||
    (user as any)?.sub ||
    (user as any)?.uid;

  const PIN_STORAGE_KEY = userKey
    ? `clientDashboardPinned:user:${userKey}`
    : null;

  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pinsHydrated, setPinsHydrated] = useState(false);

  const rowRefs = React.useRef<Record<string, HTMLTableRowElement | null>>({});
  const prevPositions = React.useRef<Record<string, DOMRect>>({});

  const colBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const [colPos, setColPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  const colUserKey =
    (user as any)?.id ||
    (user as any)?.userId ||
    (user as any)?.sub ||
    (user as any)?.uid ||
    "qa";

  const COL_STORAGE_KEY = `qaDashboardCols:user:${colUserKey}`;

  const [colOpen, setColOpen] = useState(false);

  const DEFAULT_COLS: DashboardColKey[] = [
    "reportNumber",
    "formNumber",
    "client",
    "dateSent",
  ];

  const [selectedCols, setSelectedCols] =
    useState<DashboardColKey[]>(DEFAULT_COLS);
  const [colsHydrated, setColsHydrated] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Reset invalid status when switching formFilter
  useEffect(() => {
    const opts =
      formFilter === "CHEMISTRY" || formFilter === "COA"
        ? ADMIN_CHEM_STATUSES.map(String)
        : formFilter === "STERILITY"
          ? ADMIN_STERILITY_STATUSES.map(String)
          : ADMIN_MICRO_STATUSES.map(String);

    if (statusFilter !== "ALL" && !opts.includes(String(statusFilter))) {
      setStatusFilter("ALL");
    }
  }, [formFilter, statusFilter]);

  const reportsWithSearch = useMemo(() => {
    return reports.map((r) => ({
      ...r,
      _searchBlob: getReportSearchBlob(r),
    }));
  }, [reports]);

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
            extractYearAndSequence(r.reportNumber).sequence,
            reportNoFrom,
            reportNoTo,
          );
        })
      : bySearchText;

    // const byDate = byNumberRange.filter((r) =>
    //   matchesDateRange(r.createdAt, dateFrom || undefined, dateTo || undefined),
    // );

    // return [...byDate].sort((a, b) => {
    //   const aPinned = pinnedIds.includes(a.id) ? 1 : 0;
    //   const bPinned = pinnedIds.includes(b.id) ? 1 : 0;

    //   if (aPinned !== bPinned) {
    //     return bPinned - aPinned; // pinned first
    //   }
    //   const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    //   const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    //   return bT - aT;
    // });
    const getDateValue = (r: Report): string | null => {
      switch (dateField) {
        case "dateTested":
          return r.dateTested ?? null;
        case "dateReceived":
          return r.dateReceived ?? null;
        case "createdAt":
          return r.createdAt ?? null;
        case "updatedAt":
          return r.updatedAt ?? null;
        default:
          return r.dateSent ?? null;
      }
    };

    const byDate = byNumberRange.filter((r) =>
      matchesDateRange(
        getDateValue(r),
        dateFrom || undefined,
        dateTo || undefined,
      ),
    );

    const getTime = (r: Report) => {
      const val = getDateValue(r);
      return val ? new Date(val).getTime() : 0;
    };

    return [...byDate].sort((a, b) => {
      const aPinned = pinnedIds.includes(a.id) ? 1 : 0;
      const bPinned = pinnedIds.includes(b.id) ? 1 : 0;

      if (aPinned !== bPinned) {
        return bPinned - aPinned;
      }

      const diff = getTime(a) - getTime(b);

      return sortOrder === "asc" ? diff : -diff;
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
    dateFrom,
    dateTo,
    pinnedIds,
    dateField,
    sortOrder,
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
    datePreset,
    dateFrom,
    dateTo,
    perPage,
  ]);

  useEffect(() => {
    const sp = new URLSearchParams();

    if (formFilter !== "ALL") sp.set("form", formFilter);
    sp.set("status", String(statusFilter));

    if (searchClient.trim()) sp.set("client", searchClient.trim());
    if (searchReport.trim()) sp.set("report", searchReport.trim());
    if (searchText.trim()) sp.set("q", searchText.trim());
    sp.set("dateField", dateField);
    sp.set("sort", sortOrder);
    sp.set("dp", datePreset);
    if (dateFrom) sp.set("from", dateFrom);
    if (dateTo) sp.set("to", dateTo);

    sp.set("rangeType", numberRangeType);
    if (formNoFrom.trim()) sp.set("formFrom", formNoFrom.trim());
    if (formNoTo.trim()) sp.set("formTo", formNoTo.trim());
    if (reportNoFrom.trim()) sp.set("reportFrom", reportNoFrom.trim());
    if (reportNoTo.trim()) sp.set("reportTo", reportNoTo.trim());

    if (perPage !== 10) sp.set("pp", String(perPage));
    if (pageClamped !== 1) sp.set("p", String(pageClamped));
    if (selectedIds.length) sp.set("sel", selectedIds.join(","));

    setSearchParams(sp, { replace: true });
  }, [
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
    pageClamped,
    selectedIds,
    setSearchParams,
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
      formNumber: null,
      reportNumber: null,
      formType: null,
      clientCode: null,
    });

    setPrintingBulk(true);
    setIsBulkPrinting(true);
  };

  // optional: clear selection when filters change (avoids printing hidden rows)
  useEffect(() => {
    setSelectedIds([]);
  }, [formFilter]);

  // Permissions
  function canUpdateThisMicro(r: Report, userObj?: any) {
    return canShowUpdateButton(
      userObj?.role as Role,
      r.status as ReportStatus,
      ADMIN_FIELDS_ON_FORM,
    );
  }

  function canUpdateThisSterility(r: Report, userObj?: any) {
    return canShowSterilityUpdateButton(
      userObj?.role as Role,
      r.status as SterilityReportStatus,
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

    const cls = isChem
      ? CHEMISTRY_STATUS_COLORS[r.status as ChemistryReportStatus]
      : isSterility
        ? STERILITY_STATUS_COLORS[r.status as SterilityReportStatus]
        : STATUS_COLORS[r.status as ReportStatus];

    return cls || "bg-slate-100 text-slate-800 ring-1 ring-slate-200";
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
      searchText.trim() !== "" ||
      datePreset !== "ALL" ||
      dateFrom !== "" ||
      dateTo !== "" ||
      formNoFrom !== "" ||
      formNoTo !== "" ||
      reportNoFrom !== "" ||
      reportNoTo !== "" ||
      perPage !== 10 ||
      dateField !== DEFAULT_ADMIN_FILTERS.dateField
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
    dateField,
  ]);
  const clearFilters = () => {
    setSearchClient("");
    setSearchReport("");
    setSearchText("");
    setDatePreset("ALL");
    setDateFrom("");
    setDateTo("");
    setStatusFilter("ALL");
    setFormFilter("ALL");
    setNumberRangeType("FORM");
    setFormNoFrom("");
    setFormNoTo("");
    setReportNoFrom("");
    setReportNoTo("");
    setPerPage(10);
    setPage(1);
    setDateField(DEFAULT_ADMIN_FILTERS.dateField);
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
      formNumber: null,
      reportNumber: null,
      formType: null,
      clientCode: null,
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
    ? getStatusesForReportFamily(selectedFamily)
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

      setBulkChangeReports([]);
      setBulkNewStatus("");
      setBulkReason("");
      setBulkESignPassword("");
      setBulkESignError("");
      setSelectedIds([]);

      toast.success("Bulk status updated successfully");
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

  const DASHBOARD_COLS = useMemo(() => {
    const map = new Map<string, { key: DashboardColKey; label: string }>();

    for (const c of COLS) {
      map.set(c.key, c as { key: DashboardColKey; label: string });
    }

    for (const c of ChemistryCOLS) {
      map.set(c.key, c as { key: DashboardColKey; label: string });
    }

    return Array.from(map.values());
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DashboardColKey[];
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

  function getCellValue(r: Report, key: DashboardColKey) {
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

      case "dateTested":
        return formatDate(r.dateTested ?? null);

      case "dateReceived":
        return formatDate(r.dateReceived ?? null);

      case "manufactureDate":
        return formatDate(r.manufactureDate ?? null);

      case "createdAt":
        return formatDate(r.createdAt ?? null);

      case "updatedAt":
        return formatDate(r.updatedAt ?? null);

      case "actives": {
        const list =
          typeof r.actives === "string"
            ? r.actives
            : Array.isArray(r.actives)
              ? r.actives.join(", ")
              : "-";
        return list || "-";
      }

      default: {
        const v = (r as any)[key];
        return v == null || v === "" ? "-" : String(v);
      }
    }
  }

  const toggleCol = (key: DashboardColKey) => {
    setSelectedCols((prev) => {
      const exists = prev.includes(key);
      if (exists) return prev.filter((k) => k !== key);
      return [...prev, key];
    });
  };

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
          <div className="relative">
            <button
              type="button"
              disabled={
                !selectedIds.length || !selectedSameFamily || bulkSaving
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
                          ? "COA"
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

          {/* <input
            placeholder="Search by client / client code"
            value={searchClient}
            onChange={(e) => setSearchClient(e.target.value)}
            className="flex-1 min-w-[180px] rounded-lg border px-3 py-2 text-sm
      ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
          />

          <input
            placeholder="Search by report # / form #"
            value={searchReport}
            onChange={(e) => setSearchReport(e.target.value)}
            className="flex-1 min-w-[180px] rounded-lg border px-3 py-2 text-sm
      ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
          /> */}

          <input
            placeholder="Search client, code, form #, report #, lot #, formula, description, status..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="flex-1 min-w-[260px] rounded-lg border px-3 py-2 text-sm
      ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
          />

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

          {/* after date filters, same line */}
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

          <select
            value={dateField}
            onChange={(e) => setDateField(e.target.value as any)}
            className="w-44 rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
          >
            <option value="dateSent">Date Sent</option>
            <option value="dateReceived">Date Received</option>
            <option value="dateTested">Date Tested</option>
            <option value="createdAt">Created At</option>
            <option value="updatedAt">Updated At</option>
          </select>

          <button
            type="button"
            onClick={() => setSortOrder((d) => (d === "asc" ? "desc" : "asc"))}
            className="inline-flex h-10 min-w-[42px] items-center justify-center rounded-lg border px-3 text-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
            title={sortOrder === "asc" ? "Ascending" : "Descending"}
          >
            {sortOrder === "asc" ? "↑" : "↓"}
          </button>

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
                      {DASHBOARD_COLS.find((c) => c.key === k)?.label ?? k}
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
                                {DASHBOARD_COLS.map((c) => {
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
                  [...Array(6)].map((_, i) => (
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
                        <div className="h-8 w-40 animate-pulse rounded bg-slate-200" />
                      </td>
                    </tr>
                  ))}

                {!loading &&
                  pageRows.map((r) => {
                    const isSterility = r.formType === "STERILITY";
                    const isMicro =
                      r.formType === "MICRO_MIX" ||
                      r.formType === "MICRO_MIX_WATER";
                    const isChemistry =
                      r.formType === "CHEMISTRY_MIX" || r.formType === "COA";
                    const rowBusy = updatingId === r.id;

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

                        <td className="pl-4 pr-3 py-3">
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
                              badgeClasses(r),
                            )}
                          >
                            {niceStatus(String(r.status))}
                          </span>
                        </td>

                        <td className="sticky right-0 z-20 bg-white px-4 py-3 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.08)]">
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
                                  formNumber: null,
                                  reportNumber: null,
                                  formType: null,
                                  clientCode: null,
                                });
                                openViewTarget(r);
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
                                      r.status ===
                                      "CLIENT_NEEDS_FINAL_CORRECTION"
                                    ) {
                                      const next = "UNDER_FINAL_TESTING_REVIEW";
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

                            {isSterility && canUpdateThisSterility(r, user) && (
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
                                      const next = "UNDER_TESTING_REVIEW";
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
                                    if (
                                      r.status === "CLIENT_NEEDS_CORRECTION"
                                    ) {
                                      const next = "UNDER_TESTING_REVIEW";
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

                            <button
                              className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-purple-700"
                              onClick={() => {
                                setChangeStatusReport(r);
                                const options =
                                  r.formType === "CHEMISTRY_MIX" ||
                                  r.formType === "COA"
                                    ? ADMIN_CHEM_STATUSES
                                    : r.formType === "STERILITY"
                                      ? ADMIN_STERILITY_STATUSES
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
                      colSpan={2 + selectedCols.length + 2}
                      className="px-4 py-12 text-center text-slate-500"
                    >
                      No reports match filters.
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
                onChange={(e) =>
                  setPerPage(Number(e.target.value) as typeof perPage)
                }
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
                        selectedReport.formType === "CHEMISTRY_MIX" ||
                        selectedReport.formType === "COA"
                          ? "ChemistryReport"
                          : "MicroReport",
                      entityId: selectedReport.id,
                      details: `Printed ${selectedReport.formNumber ?? selectedReport.id}`,
                      meta: {
                        formNumber: selectedReport.formNumber,
                        formType: selectedReport.formType,
                        status: selectedReport.status,
                      },
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

                {/* ✅ show Update in modal for micro or chem */}
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
                  ? ADMIN_CHEM_STATUSES
                  : changeStatusReport.formType === "STERILITY"
                    ? ADMIN_STERILITY_STATUSES
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
                  <option key={String(s)} value={String(s)}>
                    {niceStatus(String(s))}
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
