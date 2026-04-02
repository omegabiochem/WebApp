import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";

import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";

import MicroMixReportFormView from "../Reports/MicroMixReportFormView";
import MicroMixWaterReportFormView from "../Reports/MicroMixWaterReportFormView";
import ChemistryMixReportFormView from "../Reports/ChemistryMixReportFormView";

import {
  STATUS_TRANSITIONS as MICRO_STATUS_TRANSITIONS,
  STATUS_COLORS,
  canShowUpdateButton,
  type ReportStatus as MicroReportStatus,
  type Role,
} from "../../utils/microMixReportFormWorkflow";

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
import {
  canShowSterilityUpdateButton,
  STERILITY_STATUS_COLORS,
  STERILITY_STATUS_TRANSITIONS,
  type SterilityReportStatus,
} from "../../utils/SterilityReportFormWorkflow";
import COAReportFormView from "../Reports/COAReportFormView";
import {
  canShowCOAUpdateButton,
  COA_STATUS_COLORS,
} from "../../utils/COAReportFormWorkflow";
import ReportWorkspaceModal from "../../utils/ReportWorkspaceModal";
import { getReportSearchBlob } from "../../utils/clientDashboardutils";
import {
  ChemistryCOLS,
  COLS,
  type DashboardColKey,
} from "../../utils/globalUtils";
import { Pin } from "lucide-react";

// ----------------------------------
// Types
// ----------------------------------
type MicroReport = {
  id: string;
  client: string;
  formType: "MICRO_MIX" | "MICRO_MIX_WATER" | "STERILITY" | string;
  dateSent: string | null;
  status: string;
  reportNumber: string | null;
  formNumber: string;
  prefix?: string;
  version: number;

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

  comments?: string | null;
  testedBy?: string | null;
  reviewedBy?: string | null;

  pathogens?: unknown;
};

type ChemReport = {
  id: string;
  client: string;
  formType: "CHEMISTRY_MIX" | "COA" | string;
  dateSent: string | null;
  status: string;
  reportNumber: string | null;
  formNumber: string;
  prefix?: string;
  version: number;

  clientCode?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;

  selectedActives?: string[];
  selectedActivesText?: string;

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
};

type UnifiedRow =
  | ({ kind: "MICRO"; _searchBlob?: string } & MicroReport)
  | ({ kind: "CHEMISTRY"; _searchBlob?: string } & ChemReport);

type BulkWorkflowGroup = "MICRO" | "STERILITY" | "CHEMISTRY" | "COA";

function getBulkWorkflowGroup(r: UnifiedRow): BulkWorkflowGroup {
  if (r.kind === "MICRO") {
    if (r.formType === "STERILITY") return "STERILITY";
    return "MICRO";
  }

  if (r.formType === "COA") return "COA";
  return "CHEMISTRY";
}

function getNextStatusesForRow(r: UnifiedRow): string[] {
  const s = String(r.status);

  if (r.kind === "MICRO") {
    if (r.formType === "STERILITY") {
      return (STERILITY_STATUS_TRANSITIONS?.[s as SterilityReportStatus]
        ?.next ?? []) as string[];
    }

    const next = MICRO_STATUS_TRANSITIONS?.[s as MicroReportStatus]?.next ?? [];

    // keep Start Final as row/modal-only action
    return next.filter(
      (ns) =>
        !(
          ns === "UNDER_FINAL_TESTING_REVIEW" &&
          (s === "PRELIMINARY_APPROVED" ||
            s === "UNDER_CLIENT_PRELIMINARY_REVIEW")
        ),
    ) as string[];
  }

  // CHEMISTRY + COA
  return (CHEM_STATUS_TRANSITIONS?.[s as ChemistryReportStatus]?.next ??
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

// ----------------------------------
// Status lists (same as your pages)
// ----------------------------------
const MICRO_STATUSES = [
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

  "UNDER_CHANGE_UPDATE",
  "CORRECTION_REQUESTED",
  "UNDER_CORRECTION_UPDATE",
  "CHANGE_REQUESTED",
] as const;

const STERILITY_STATUSES = [
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
] as const;

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

  "UNDER_CHANGE_UPDATE",
  "CORRECTION_REQUESTED",
  "UNDER_CORRECTION_UPDATE",
  "CHANGE_REQUESTED",
] as const;

// ----------------------------------
// Utilities
// ----------------------------------
const microFormTypeToSlug: Record<string, string> = {
  MICRO_MIX: "micro-mix",
  MICRO_MIX_WATER: "micro-mix-water",
  STERILITY: "sterility",
};

const chemFormTypeToSlug: Record<string, string> = {
  CHEMISTRY_MIX: "chemistry-mix",
  COA: "coa",
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function niceStatus(s: string) {
  return s.replace(/_/g, " ");
}

function displayReportNo(r: { reportNumber: string | null }) {
  return r.reportNumber || "-";
}

// ----------------------------------
// API helpers
// ----------------------------------
async function setMicroStatus(
  r: MicroReport,
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

async function setChemStatus(
  r: ChemReport,
  newStatus: string,
  reason = "Common Status Change",
) {
  await api(`/chemistry-reports/${r.id}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      reason,
      status: newStatus,
      expectedVersion: r.version,
    }),
  });
}

async function startMicroFinal(r: MicroReport) {
  const reason =
    window.prompt(
      "Reason for change (21 CFR Part 11):",
      "Start final testing",
    ) || "";

  if (!reason.trim()) {
    toast.error("Reason is required.");
    return { ok: false as const };
  }

  const nextStatus = "UNDER_FINAL_TESTING_REVIEW";

  await api(`/reports/${r.id}/change-status`, {
    method: "PATCH",
    body: JSON.stringify({ status: nextStatus, reason }),
  });

  return { ok: true as const, nextStatus };
}

// ----------------------------------
// Spinners
// ----------------------------------
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

// ----------------------------------
// Bulk print area (mixed)
// ----------------------------------
function BulkPrintArea({
  reports,
  onAfterPrint,
}: {
  reports: UnifiedRow[];
  onAfterPrint: () => void;
}) {
  if (!reports.length) return null;

  const isSingle = reports.length === 1;

  React.useEffect(() => {
    const tid = setTimeout(() => window.print(), 200);
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
        if (r.kind === "MICRO") {
          if (r.formType === "MICRO_MIX") {
            return (
              <div key={`${r.kind}-${r.id}`} className="report-page">
                <MicroMixReportFormView
                  report={r}
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
              <div key={`${r.kind}-${r.id}`} className="report-page">
                <SterilityReportFormView
                  report={r}
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
              <div key={`${r.kind}-${r.id}`} className="report-page">
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
            <div key={`${r.kind}-${r.id}`} className="report-page">
              <h1>{r.formNumber}</h1>
              <p>Unknown micro form type: {r.formType}</p>
            </div>
          );
        }

        // CHEMISTRY
        if (r.formType === "CHEMISTRY_MIX") {
          return (
            <div key={`${r.kind}-${r.id}`} className="report-page">
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

        // COA
        if (r.formType === "COA") {
          return (
            <div key={`${r.kind}-${r.id}`} className="report-page">
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
          <div key={`${r.kind}-${r.id}`} className="report-page">
            <h1>{r.formNumber}</h1>
            <p>Unknown chemistry form type: {r.formType}</p>
          </div>
        );
      })}
    </div>
  );
}

// ----------------------------------
// Small chemistry actives cell (same UX)
// ----------------------------------
function ActivesCell({
  selectedActives,
  selectedActivesText,
}: {
  selectedActives?: string[];
  selectedActivesText?: string;
}) {
  const list = React.useMemo(() => {
    if (selectedActivesText?.trim()) {
      return selectedActivesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return (selectedActives ?? []).map((s) => String(s).trim()).filter(Boolean);
  }, [selectedActives, selectedActivesText]);

  const first = list[0];
  const rest = list.slice(1);
  const moreCount = rest.length;

  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement | null>(null);
  const popRef = React.useRef<HTMLDivElement | null>(null);

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

function typeLabel(r: UnifiedRow) {
  if (r.kind === "MICRO") {
    if (r.formType === "MICRO_MIX") return "MICRO";
    if (r.formType === "MICRO_MIX_WATER") return "MICRO WATER";
    if (r.formType === "STERILITY") return "STERILITY";
    return "MICRO";
  }

  // CHEMISTRY
  if (r.formType === "COA") return "COA";
  if (r.formType === "CHEMISTRY_MIX") return "CHEMISTRY MIX";
  return "CHEM";
}

function parseIntSafe(v: string | null, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const DEFAULT_MC_FILTERS = {
  category: "ALL" as "ALL" | "MICRO" | "CHEMISTRY",
  statusFilter: "ALL",
  searchClient: "",
  searchReport: "",
  searchText: "",
  allTypeFilter: "ALL" as
    | "ALL"
    | "MICRO_MIX"
    | "MICRO_MIX_WATER"
    | "STERILITY"
    | "CHEMISTRY_MIX"
    | "COA",
  microFormFilter: "ALL" as "ALL" | "MICRO" | "MICRO_WATER" | "STERILITY",
  chemFormFilter: "ALL" as "ALL" | "CHEMISTRY_MIX" | "COA",
  activeFilter: "ALL",
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

function getInitialMCFilters(searchParams: URLSearchParams) {
  try {
    const spCategory = searchParams.get("cat");
    const spStatus = searchParams.get("status");
    const spClient = searchParams.get("client");
    const spReport = searchParams.get("report");
    const spQ = searchParams.get("q");

    const spType = searchParams.get("type");
    const spMType = searchParams.get("mtype");
    const spCType = searchParams.get("ctype");
    const spActive = searchParams.get("active");

    const spDp = searchParams.get("dp");
    const spFrom = searchParams.get("from");
    const spTo = searchParams.get("to");

    const spRangeType = searchParams.get("rangeType");
    const spFormFrom = searchParams.get("formFrom");
    const spFormTo = searchParams.get("formTo");
    const spReportFrom = searchParams.get("reportFrom");
    const spReportTo = searchParams.get("reportTo");

    const spSortBy = searchParams.get("sortBy");
    const spSortDir = searchParams.get("sortDir");
    const spPp = searchParams.get("pp");
    const spP = searchParams.get("p");

    const hasUrlFilters =
      spCategory ||
      spStatus ||
      spClient ||
      spReport ||
      spQ ||
      spType ||
      spMType ||
      spCType ||
      spActive ||
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
      spP;

    if (hasUrlFilters) {
      return {
        category:
          (spCategory as "ALL" | "MICRO" | "CHEMISTRY") ||
          DEFAULT_MC_FILTERS.category,
        statusFilter: spStatus || DEFAULT_MC_FILTERS.statusFilter,
        searchClient: spClient || DEFAULT_MC_FILTERS.searchClient,
        searchReport: spReport || DEFAULT_MC_FILTERS.searchReport,
        searchText: spQ || DEFAULT_MC_FILTERS.searchText,
        allTypeFilter:
          (spType as typeof DEFAULT_MC_FILTERS.allTypeFilter) ||
          DEFAULT_MC_FILTERS.allTypeFilter,
        microFormFilter:
          (spMType as typeof DEFAULT_MC_FILTERS.microFormFilter) ||
          DEFAULT_MC_FILTERS.microFormFilter,
        chemFormFilter:
          (spCType as typeof DEFAULT_MC_FILTERS.chemFormFilter) ||
          DEFAULT_MC_FILTERS.chemFormFilter,
        activeFilter: spActive || DEFAULT_MC_FILTERS.activeFilter,
        datePreset: (spDp as DatePreset) || DEFAULT_MC_FILTERS.datePreset,
        fromDate: spFrom || DEFAULT_MC_FILTERS.fromDate,
        toDate: spTo || DEFAULT_MC_FILTERS.toDate,
        numberRangeType:
          (spRangeType as "FORM" | "REPORT") ||
          DEFAULT_MC_FILTERS.numberRangeType,
        formNoFrom: spFormFrom || DEFAULT_MC_FILTERS.formNoFrom,
        formNoTo: spFormTo || DEFAULT_MC_FILTERS.formNoTo,
        reportNoFrom: spReportFrom || DEFAULT_MC_FILTERS.reportNoFrom,
        reportNoTo: spReportTo || DEFAULT_MC_FILTERS.reportNoTo,
        sortBy:
          (spSortBy as "dateSent" | "reportNumber") ||
          DEFAULT_MC_FILTERS.sortBy,
        sortDir: (spSortDir as "asc" | "desc") || DEFAULT_MC_FILTERS.sortDir,
        perPage: parseIntSafe(spPp, DEFAULT_MC_FILTERS.perPage),
        page: parseIntSafe(spP, DEFAULT_MC_FILTERS.page),
      };
    }
  } catch {
    // ignore
  }

  return DEFAULT_MC_FILTERS;
}

// ----------------------------------
// Component: Combined dashboard
// ----------------------------------
export default function MCDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const userKey =
    (user as any)?.id ||
    (user as any)?.userId ||
    (user as any)?.sub ||
    (user as any)?.uid;

  // Separate stores (clean + compatible with your existing live hook)
  const [microReports, setMicroReports] = useState<MicroReport[]>([]);
  const [chemReports, setChemReports] = useState<ChemReport[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  type Category = "ALL" | "MICRO" | "CHEMISTRY";
  // const [category, setCategory] = useState<Category>("ALL");

  type AllTypeFilter =
    | "ALL"
    | "MICRO_MIX"
    | "MICRO_MIX_WATER"
    | "STERILITY"
    | "CHEMISTRY_MIX"
    | "COA";

  type MicroFormFilter = "ALL" | "MICRO" | "MICRO_WATER" | "STERILITY";

  type ChemFormFilter = "ALL" | "CHEMISTRY_MIX" | "COA";

  const [searchParams, setSearchParams] = useSearchParams();

  const initialFilters = getInitialMCFilters(searchParams);

  const [category, setCategory] = useState<Category>(initialFilters.category);

  const [statusFilter, setStatusFilter] = useState(initialFilters.statusFilter);

  const [searchClient, setSearchClient] = useState(initialFilters.searchClient);

  const [searchReport, setSearchReport] = useState(initialFilters.searchReport);

  const [search, setSearch] = useState(initialFilters.searchText);

  const [allTypeFilter, setAllTypeFilter] = useState<AllTypeFilter>(
    initialFilters.allTypeFilter,
  );

  const [microFormFilter, setMicroFormFilter] = useState<MicroFormFilter>(
    initialFilters.microFormFilter,
  );

  const [chemFormFilter, setChemFormFilter] = useState<ChemFormFilter>(
    initialFilters.chemFormFilter,
  );

  const [activeFilter, setActiveFilter] = useState(initialFilters.activeFilter);

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

  const [sortBy, setSortBy] = useState<"dateSent" | "reportNumber">(
    initialFilters.sortBy,
  );

  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    initialFilters.sortDir,
  );

  const [perPage, setPerPage] = useState(initialFilters.perPage);
  const [page, setPage] = useState(initialFilters.page);

  // Selection + print
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const PIN_STORAGE_KEY = userKey
    ? `clientDashboardPinned:user:${userKey}`
    : null;

  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pinsHydrated, setPinsHydrated] = useState(false);
  const [isBulkPrinting, setIsBulkPrinting] = useState(false);
  const [singlePrintReport, setSinglePrintReport] = useState<UnifiedRow | null>(
    null,
  );

  // UI guards
  const [printingBulk, setPrintingBulk] = useState(false);
  const [printingSingle, setPrintingSingle] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null); // `${kind}:${id}`
  const [modalUpdating, setModalUpdating] = useState(false);

  const [selectedReport, setSelectedReport] = useState<UnifiedRow | null>(null);

  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);

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

  // -----------------------------
  // Merge into unified list
  // -----------------------------
  const unified: UnifiedRow[] = useMemo(() => {
    const m = microReports.map((r) => ({
      ...r,
      kind: "MICRO" as const,
      _searchBlob: getReportSearchBlob(r),
    }));

    const c = chemReports.map((r) => ({
      ...r,
      kind: "CHEMISTRY" as const,
      _searchBlob: getReportSearchBlob({
        ...r,
        actives:
          r.actives ?? r.selectedActives ?? r.selectedActivesText ?? null,
      }),
    }));

    return [...m, ...c];
  }, [microReports, chemReports]);
  const rowKey = (r: UnifiedRow) => `${r.kind}:${r.id}`;

  const workspaceReports = useMemo(() => {
    const map = new Map<string, UnifiedRow>();
    unified.forEach((r) => map.set(rowKey(r), r));

    return workspaceIds
      .map((id) => map.get(id))
      .filter(Boolean) as UnifiedRow[];
  }, [workspaceIds, unified]);

  // -----------------------------
  // Fetch both queues
  // -----------------------------
  useEffect(() => {
    let abort = false;

    async function fetchAll() {
      try {
        setLoading(true);
        setError(null);

        const [allMicro, allChem] = await Promise.all([
          api<MicroReport[]>("/reports"),
          api<ChemReport[]>("/chemistry-reports"),
        ]);

        if (abort) return;

        const keepMicro = new Set(MICRO_STATUSES.filter((s) => s !== "ALL"));
        const keepChem = new Set<string>([
          ...CHEMISTRY_STATUSES.filter((s) => s !== "ALL").map(String),
          ...Object.keys(COA_STATUS_COLORS), // ✅ include all COA statuses
        ]);

        setMicroReports(allMicro.filter((r) => keepMicro.has(r.status as any)));
        setChemReports(allChem.filter((r) => keepChem.has(String(r.status))));
      } catch (e: any) {
        if (!abort) setError(e?.message ?? "Failed to fetch reports");
      } finally {
        if (!abort) setLoading(false);
      }
    }

    fetchAll();
    return () => {
      abort = true;
    };
  }, []);

  // Live status updates (if your hook works generically)
  useLiveReportStatus(setMicroReports as any);
  useLiveReportStatus(setChemReports as any);

  // -----------------------------
  // Date preset → from/to
  // -----------------------------
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

  // Which status chips to show?
  // const statusOptions = useMemo(() => {
  //   if (category === "MICRO") return MICRO_STATUSES as unknown as string[];
  //   if (category === "CHEMISTRY")
  //     return CHEMISTRY_STATUSES as unknown as string[];
  //   // ALL: union, but keep it tidy:
  //   const set = new Set<string>(["ALL"]);
  //   MICRO_STATUSES.forEach((s) => s !== "ALL" && set.add(String(s)));
  //   CHEMISTRY_STATUSES.forEach((s) => s !== "ALL" && set.add(String(s)));
  //   return Array.from(set);
  // }, [category]);
  const statusOptions = useMemo(() => {
    // MICRO tab
    if (category === "MICRO") {
      if (microFormFilter === "STERILITY") {
        return STERILITY_STATUSES as unknown as string[];
      }

      // MICRO + MICRO_WATER + ALL under MICRO tab should use micro statuses
      return MICRO_STATUSES as unknown as string[];
    }

    // CHEMISTRY tab
    if (category === "CHEMISTRY") {
      // CHEMISTRY_MIX + COA both use chemistry-style statuses
      return CHEMISTRY_STATUSES as unknown as string[];
    }

    // ALL tab
    if (category === "ALL") {
      if (
        allTypeFilter === "MICRO_MIX" ||
        allTypeFilter === "MICRO_MIX_WATER"
      ) {
        return MICRO_STATUSES as unknown as string[];
      }

      if (allTypeFilter === "STERILITY") {
        return STERILITY_STATUSES as unknown as string[];
      }

      if (allTypeFilter === "CHEMISTRY_MIX" || allTypeFilter === "COA") {
        return CHEMISTRY_STATUSES as unknown as string[];
      }

      // true ALL = union of all statuses
      const set = new Set<string>(["ALL"]);
      MICRO_STATUSES.forEach((s) => s !== "ALL" && set.add(String(s)));
      STERILITY_STATUSES.forEach((s) => s !== "ALL" && set.add(String(s)));
      CHEMISTRY_STATUSES.forEach((s) => s !== "ALL" && set.add(String(s)));
      return Array.from(set);
    }

    return ["ALL"];
  }, [category, microFormFilter, chemFormFilter, allTypeFilter]);

  // Chemistry actives list (only from chemReports)
  const allActives = useMemo(() => {
    const set = new Set<string>();
    for (const r of chemReports) {
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
  }, [chemReports]);

  useEffect(() => {
    if (!statusOptions.includes(statusFilter)) {
      setStatusFilter("ALL");
    }
  }, [statusOptions, statusFilter]);

  // -----------------------------
  // Filtering + sorting
  // -----------------------------
  const processed = useMemo(() => {
    // 0) category filter
    let rows = unified;

    if (category === "MICRO") {
      rows = rows.filter((r) => r.kind === "MICRO");
    } else if (category === "CHEMISTRY") {
      // ✅ show CHEMISTRY_MIX + COA together
      rows = rows.filter((r) => r.kind === "CHEMISTRY");
    }

    // ✅ ADD THIS BLOCK (ONLY when category === ALL)
    if (category === "ALL" && allTypeFilter !== "ALL") {
      rows = rows.filter((r) => r.formType === allTypeFilter);
    }

    // 0.5) micro subtype filter (ONLY when category === "MICRO")
    if (category === "MICRO" && microFormFilter !== "ALL") {
      rows = rows.filter((r) => {
        if (r.kind !== "MICRO") return false; // only show micro rows in micro tab
        if (microFormFilter === "MICRO") return r.formType === "MICRO_MIX";
        if (microFormFilter === "MICRO_WATER")
          return r.formType === "MICRO_MIX_WATER";
        if (microFormFilter === "STERILITY") return r.formType === "STERILITY";
        return true;
      });
    }
    // 0.6) chemistry subtype filter
    // 0.6) chemistry subtype filter (ONLY when category === "CHEMISTRY")
    if (category === "CHEMISTRY" && chemFormFilter !== "ALL") {
      rows = rows.filter((r) => {
        if (r.kind !== "CHEMISTRY") return false; // only show chemistry rows in chemistry tab
        if (chemFormFilter === "CHEMISTRY_MIX")
          return r.formType === "CHEMISTRY_MIX";
        if (chemFormFilter === "COA") return r.formType === "COA";
        return true;
      });
    }

    // 1) status
    if (statusFilter !== "ALL") {
      rows = rows.filter((r) => String(r.status) === String(statusFilter));
    }

    // 2) search client
    if (searchClient.trim()) {
      const q = searchClient.toLowerCase();
      rows = rows.filter((r) => r.client.toLowerCase().includes(q));
    }

    // 3) search report
    if (searchReport.trim()) {
      const q = searchReport.toLowerCase();
      rows = rows.filter((r) => {
        return (
          String(displayReportNo(r)).toLowerCase().includes(q) ||
          String(r.formNumber || "")
            .toLowerCase()
            .includes(q)
        );
      });
    }

    // 4) global search
    if (search.trim()) {
      const q = search.trim().toLowerCase();

      rows = rows.filter((r) => {
        return (r._searchBlob || "").includes(q);
      });
    }

    // 5) number range
    if (numberRangeType === "FORM") {
      if (formNoFrom.trim() || formNoTo.trim()) {
        rows = rows.filter((r) =>
          inRange(
            extractYearAndSequence(r.formNumber).sequence,
            formNoFrom,
            formNoTo,
          ),
        );
      }
    } else {
      if (reportNoFrom.trim() || reportNoTo.trim()) {
        rows = rows.filter((r) =>
          inRange(
            extractYearAndSequence(r.reportNumber).sequence,
            reportNoFrom,
            reportNoTo,
          ),
        );
      }
    }

    // 6) chemistry actives filter
    if (category === "CHEMISTRY" && activeFilter !== "ALL") {
      rows = rows.filter((r) => {
        if (r.kind !== "CHEMISTRY") return false;

        const list = r.selectedActivesText?.trim()
          ? r.selectedActivesText.split(",").map((s) => s.trim())
          : (r.selectedActives ?? []).map((s) => String(s).trim());

        return list.includes(activeFilter);
      });
    }

    // 7) date range
    rows = rows.filter((r) =>
      matchesDateRange(r.dateSent, fromDate || undefined, toDate || undefined),
    );

    // 4) sort
    const sorted = [...rows].sort((a, b) => {
      const aPinned = pinnedIds.includes(a.id) ? 1 : 0;
      const bPinned = pinnedIds.includes(b.id) ? 1 : 0;

      if (aPinned !== bPinned) {
        return bPinned - aPinned; // pinned first
      }
      if (sortBy === "reportNumber") {
        const aK = (a.reportNumber || "").toLowerCase();
        const bK = (b.reportNumber || "").toLowerCase();
        return sortDir === "asc" ? aK.localeCompare(bK) : bK.localeCompare(aK);
      }
      const aT = a.dateSent ? new Date(a.dateSent).getTime() : 0;
      const bT = b.dateSent ? new Date(b.dateSent).getTime() : 0;
      return sortDir === "asc" ? aT - bT : bT - aT;
    });

    return sorted;
  }, [
    unified,
    category,
    allTypeFilter,
    microFormFilter,
    chemFormFilter,
    statusFilter,
    search,
    activeFilter,
    fromDate,
    toDate,
    sortBy,
    sortDir,
    searchClient,
    searchReport,
    numberRangeType,
    formNoFrom,
    formNoTo,
    reportNoFrom,
    reportNoTo,
    pinnedIds,
  ]);

  // Pagination
  const total = processed.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageClamped = Math.min(page, totalPages);
  const start = (pageClamped - 1) * perPage;
  const end = start + perPage;
  const pageRows = processed.slice(start, end);

  useEffect(() => {
    setPage(1);
  }, [
    category,
    allTypeFilter,
    microFormFilter,
    chemFormFilter,
    statusFilter,
    search,
    perPage,
    datePreset,
    fromDate,
    toDate,
    activeFilter,
  ]);

  // Keep statusFilter valid when switching category
  const didMount = React.useRef(false);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return; // ✅ skip initial run
    }

    // runs only for real category changes after mount
    setSelectedIds([]);
    setStatusFilter("ALL");

    if (category === "ALL") {
      setMicroFormFilter("ALL");
      setChemFormFilter("ALL");
      setActiveFilter("ALL");
    } else if (category === "MICRO") {
      setChemFormFilter("ALL");
      setActiveFilter("ALL");
    } else if (category === "CHEMISTRY") {
      setMicroFormFilter("ALL");
    }
  }, [category]);

  useEffect(() => {
    const sp = new URLSearchParams();

    sp.set("cat", category);
    sp.set("status", statusFilter);

    if (searchClient.trim()) sp.set("client", searchClient.trim());
    if (searchReport.trim()) sp.set("report", searchReport.trim());
    if (search.trim()) sp.set("q", search.trim());

    sp.set("type", allTypeFilter);
    sp.set("mtype", microFormFilter);
    sp.set("ctype", chemFormFilter);
    sp.set("active", activeFilter);

    sp.set("dp", datePreset);
    if (fromDate) sp.set("from", fromDate);
    if (toDate) sp.set("to", toDate);

    sp.set("rangeType", numberRangeType);
    if (formNoFrom.trim()) sp.set("formFrom", formNoFrom.trim());
    if (formNoTo.trim()) sp.set("formTo", formNoTo.trim());
    if (reportNoFrom.trim()) sp.set("reportFrom", reportNoFrom.trim());
    if (reportNoTo.trim()) sp.set("reportTo", reportNoTo.trim());

    sp.set("sortBy", sortBy);
    sp.set("sortDir", sortDir);
    sp.set("pp", String(perPage));
    sp.set("p", String(pageClamped));

    setSearchParams(sp, { replace: true });
  }, [
    category,
    statusFilter,
    searchClient,
    searchReport,
    search,
    allTypeFilter,
    microFormFilter,
    chemFormFilter,
    activeFilter,
    datePreset,
    fromDate,
    toDate,
    numberRangeType,
    formNoFrom,
    formNoTo,
    reportNoFrom,
    reportNoTo,
    sortBy,
    sortDir,
    perPage,
    pageClamped,
    setSearchParams,
  ]);

  // -----------------------------
  // Helpers: permissions + nav
  // -----------------------------
  function canUpdateMicroLocal(r: MicroReport, user?: any) {
    const fieldsUsedOnForm = [
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
      user?.role as Role,
      r.status as MicroReportStatus,
      fieldsUsedOnForm,
    );
  }

  function canUpdateSterilityLocal(r: MicroReport, user?: any) {
    const sterilityFieldsUsedOnForm = [
      "testSopNo",
      "dateTested",
      "ftm_turbidity",
      "ftm_observation",
      "ftm_result",
      "scdb_turbidity",
      "scdb_observation",
      "scdb_result",
    ];

    return canShowSterilityUpdateButton(
      user?.role,
      r.status as SterilityReportStatus,
      sterilityFieldsUsedOnForm,
    );
  }

  function canUpdateChemLocal(r: ChemReport, user?: any) {
    const chemistryFieldsUsedOnForm = [
      "sop",
      "results",
      "dateTested",
      "initial",
      "comments",
      "testedBy",
      "testedDate",
    ];

    return canShowChemistryUpdateButton(
      user?.role,
      r.status as ChemistryReportStatus,
      chemistryFieldsUsedOnForm,
    );
  }

  function canUpdateCoaLocal(r: ChemReport, user?: any) {
    const coaFieldsUsedOnForm = [
      "dateReceived",
      "comments",
      "testedBy",
      "testedDate",
      "coaRows",
    ];

    return canShowCOAUpdateButton(
      user?.role,
      r.status as ChemistryReportStatus,
      coaFieldsUsedOnForm,
    );
  }

  function goToEditor(r: UnifiedRow) {
    if (r.kind === "MICRO") {
      const slug = microFormTypeToSlug[r.formType] || "micro-mix";
      navigate(`/reports/${slug}/${r.id}`);
      return;
    }
    const slug = chemFormTypeToSlug[r.formType] || "chemistry-mix";
    navigate(`/chemistry-reports/${slug}/${r.id}`);
  }

  // -----------------------------
  // Selection
  // -----------------------------

  const isRowSelected = (r: UnifiedRow) => selectedIds.includes(rowKey(r));

  const toggleRow = (r: UnifiedRow) => {
    const key = rowKey(r);
    setSelectedIds((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
    );
  };

  const allOnPageSelected =
    pageRows.length > 0 &&
    pageRows.every((r) => selectedIds.includes(rowKey(r)));

  const toggleSelectPage = () => {
    if (allOnPageSelected) {
      setSelectedIds((prev) =>
        prev.filter((id) => !pageRows.some((r) => rowKey(r) === id)),
      );
    } else {
      setSelectedIds((prev) => {
        const set = new Set(prev);
        pageRows.forEach((r) => set.add(rowKey(r)));
        return Array.from(set);
      });
    }
  };

  const selectedReportObjects: UnifiedRow[] = useMemo(() => {
    const map = new Map<string, UnifiedRow>();
    unified.forEach((r) => map.set(rowKey(r), r));
    return selectedIds.map((id) => map.get(id)).filter(Boolean) as UnifiedRow[];
  }, [selectedIds, unified]);
  const selected = selectedReportObjects;

  const selectedSameGroupAndStatus = useMemo(() => {
    if (!selected.length) return false;

    const group0 = getBulkWorkflowGroup(selected[0]);
    const status0 = String(selected[0].status);

    return selected.every(
      (r) => getBulkWorkflowGroup(r) === group0 && String(r.status) === status0,
    );
  }, [selected]);

  const commonNextStatuses = useMemo(() => {
    if (!selected.length) return [];
    if (!selectedSameGroupAndStatus) return [];

    return intersectAll(selected.map(getNextStatusesForRow));
  }, [selected, selectedSameGroupAndStatus]);

  useEffect(() => {
    const close = () => setBulkMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

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

  // -----------------------------
  // Update / Advance
  // -----------------------------
  async function autoAdvanceAndOpen(r: UnifiedRow, actor: string) {
    if (r.kind === "MICRO") {
      const isSterility = r.formType === "STERILITY";
      let nextStatus: string | null = null;

      if (isSterility) {
        if (r.status === "SUBMITTED_BY_CLIENT") {
          nextStatus = "UNDER_TESTING_REVIEW";
          await setMicroStatus(r, nextStatus, "Move to sterility testing");
        } else if (r.status === "CLIENT_NEEDS_CORRECTION") {
          nextStatus = "UNDER_TESTING_REVIEW";
          await setMicroStatus(r, nextStatus, "Move to sterility resubmission");
        } else if (r.status === "RESUBMISSION_BY_CLIENT") {
          nextStatus = "UNDER_TESTING_REVIEW";
          await setMicroStatus(r, nextStatus, "Resubmitted by client");
        } else if (r.status === "QA_NEEDS_CORRECTION") {
          nextStatus = "UNDER_TESTING_REVIEW";
          await setMicroStatus(r, nextStatus, `Set by ${actor}`);
        }
      } else {
        if (r.status === "SUBMITTED_BY_CLIENT") {
          nextStatus = "UNDER_PRELIMINARY_TESTING_REVIEW";
          await setMicroStatus(r, nextStatus, "Move to prelim testing");
        } else if (r.status === "CLIENT_NEEDS_PRELIMINARY_CORRECTION") {
          nextStatus = "UNDER_PRELIMINARY_TESTING_REVIEW";
          await setMicroStatus(r, nextStatus, "Move to RESUBMISSION");
        } else if (r.status === "PRELIMINARY_APPROVED") {
          nextStatus = "UNDER_FINAL_TESTING_REVIEW";
          await setMicroStatus(r, nextStatus, "Move to final testing");
        } else if (r.status === "PRELIMINARY_RESUBMISSION_BY_CLIENT") {
          nextStatus = "UNDER_PRELIMINARY_TESTING_REVIEW";
          await setMicroStatus(r, nextStatus, "Resubmitted by client");
        } else if (r.status === "CLIENT_NEEDS_FINAL_CORRECTION") {
          nextStatus = "UNDER_FINAL_TESTING_REVIEW";
          await setMicroStatus(r, nextStatus, `Set by ${actor}`);
        } else if (r.status === "QA_NEEDS_PRELIMINARY_CORRECTION") {
          nextStatus = "UNDER_PRELIMINARY_TESTING_REVIEW";
          await setMicroStatus(r, nextStatus, `Set by ${actor}`);
        } else if (r.status === "QA_NEEDS_FINAL_CORRECTION") {
          nextStatus = "UNDER_FINAL_TESTING_REVIEW";
          await setMicroStatus(r, nextStatus, `Set by ${actor}`);
        }
      }

      if (nextStatus) {
        setMicroReports((prev) =>
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

    let nextStatus: string | null = null;

    if (r.formType === "COA") {
      if (r.status === "SUBMITTED_BY_CLIENT") {
        nextStatus = "UNDER_TESTING_REVIEW";
        await setChemStatus(r, nextStatus, "Move COA to testing");
      } else if (r.status === "CLIENT_NEEDS_CORRECTION") {
        nextStatus = "UNDER_TESTING_REVIEW";
        await setChemStatus(
          r,
          nextStatus,
          `COA correction requested by ${actor}`,
        );
      } else if (r.status === "RESUBMISSION_BY_CLIENT") {
        nextStatus = "UNDER_TESTING_REVIEW";
        await setChemStatus(r, nextStatus, "COA resubmitted by client");
      } else if (r.status === "QA_NEEDS_CORRECTION") {
        nextStatus = "UNDER_TESTING_REVIEW";
        await setChemStatus(
          r,
          nextStatus,
          `COA correction requested by QA (${actor})`,
        );
      }
    } else {
      if (r.status === "SUBMITTED_BY_CLIENT") {
        nextStatus = "UNDER_TESTING_REVIEW";
        await setChemStatus(r, nextStatus, "Move to testing");
      } else if (r.status === "CLIENT_NEEDS_CORRECTION") {
        nextStatus = "UNDER_TESTING_REVIEW";
        await setChemStatus(r, nextStatus, `Set by ${actor}`);
      } else if (r.status === "RESUBMISSION_BY_CLIENT") {
        nextStatus = "UNDER_TESTING_REVIEW";
        await setChemStatus(r, nextStatus, "Resubmitted by client");
      } else if (r.status === "QA_NEEDS_CORRECTION") {
        nextStatus = "UNDER_TESTING_REVIEW";
        await setChemStatus(r, nextStatus, `Set by ${actor}`);
      }
    }

    if (nextStatus) {
      setChemReports((prev) =>
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

  // Micro Start Final (only when micro & allowed statuses)
  const rowCanStartFinal = (r: UnifiedRow) =>
    r.kind === "MICRO" &&
    (r.status === "UNDER_CLIENT_PRELIMINARY_REVIEW" ||
      r.status === "PRELIMINARY_APPROVED");

  const modalShowStartFinal =
    !!selectedReport &&
    selectedReport.kind === "MICRO" &&
    (selectedReport.status === "UNDER_CLIENT_PRELIMINARY_REVIEW" ||
      selectedReport.status === "PRELIMINARY_APPROVED");

  // -----------------------------
  // Clear filters
  // -----------------------------
  const hasActiveFilters = useMemo(() => {
    return (
      category !== "ALL" ||
      allTypeFilter !== "ALL" ||
      microFormFilter !== "ALL" ||
      chemFormFilter !== "ALL" ||
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
      activeFilter !== "ALL" ||
      numberRangeType !== "FORM" ||
      formNoFrom !== "" ||
      formNoTo !== "" ||
      reportNoFrom !== "" ||
      reportNoTo !== ""
    );
  }, [
    category,
    allTypeFilter,
    microFormFilter,
    chemFormFilter,
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
    activeFilter,
    numberRangeType,
    formNoFrom,
    formNoTo,
    reportNoFrom,
    reportNoTo,
  ]);

  const clearAllFilters = () => {
    setCategory("ALL");
    setAllTypeFilter("ALL");
    setMicroFormFilter("ALL");
    setChemFormFilter("ALL");
    setStatusFilter("ALL");

    setSearchClient("");
    setSearchReport("");
    setSearch("");

    setNumberRangeType("FORM");
    setFormNoFrom("");
    setFormNoTo("");
    setReportNoFrom("");
    setReportNoTo("");

    setSortBy("dateSent");
    setSortDir("desc");
    setPerPage(10);

    setDatePreset("ALL");
    setFromDate("");
    setToDate("");

    setActiveFilter("ALL");
    setPage(1);
  };

  function canUpdateUnified(r: UnifiedRow, user?: any) {
    if (r.kind === "MICRO") {
      return r.formType === "STERILITY"
        ? canUpdateSterilityLocal(r as MicroReport, user)
        : canUpdateMicroLocal(r as MicroReport, user);
    }

    // CHEMISTRY
    return r.formType === "COA"
      ? canUpdateCoaLocal(r as ChemReport, user)
      : canUpdateChemLocal(r as ChemReport, user);
  }

  async function applyBulkStatusChange(toStatus: string) {
    setBulkUpdating(true);

    try {
      await Promise.all(
        selected.map((r) => {
          if (r.kind === "MICRO") {
            return setMicroStatus(
              r as MicroReport,
              toStatus,
              "Bulk Status Change",
            );
          }

          return setChemStatus(r as ChemReport, toStatus, "Bulk Status Change");
        }),
      );

      const keepMicro = new Set(
        MICRO_STATUSES.filter((s) => s !== "ALL").map(String),
      );

      const keepChem = new Set<string>([
        ...CHEMISTRY_STATUSES.filter((s) => s !== "ALL").map(String),
        ...Object.keys(COA_STATUS_COLORS),
      ]);

      setMicroReports((prev) => {
        const updated = prev.map((x) =>
          selectedIds.includes(`MICRO:${x.id}`)
            ? { ...x, status: toStatus, version: (x.version ?? 0) + 1 }
            : x,
        );

        return updated.filter((r) => keepMicro.has(String(r.status)));
      });

      setChemReports((prev) => {
        const updated = prev.map((x) =>
          selectedIds.includes(`CHEMISTRY:${x.id}`)
            ? { ...x, status: toStatus, version: (x.version ?? 0) + 1 }
            : x,
        );

        return updated.filter((r) => keepChem.has(String(r.status)));
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
          group: selected[0] ? getBulkWorkflowGroup(selected[0]) : "",
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

  function getTargetsForAction(clicked: UnifiedRow): UnifiedRow[] {
    const selected = selectedReportObjects;

    if (!selected.length) return [clicked];

    const clickedInsideSelection = selected.some(
      (r) => rowKey(r) === rowKey(clicked),
    );
    return clickedInsideSelection ? selected : [clicked];
  }

  function openViewTarget(clicked: UnifiedRow) {
    const targets = getTargetsForAction(clicked);

    if (targets.length <= 1) {
      setSelectedReport(clicked);
      return;
    }

    setWorkspaceIds(targets.map((r) => rowKey(r)));
    setWorkspaceMode("VIEW");
    setWorkspaceLayout("VERTICAL");
    setWorkspaceActiveId(rowKey(clicked));
    setWorkspaceOpen(true);
  }

  function openUpdateTarget(clicked: UnifiedRow) {
    const targets = getTargetsForAction(clicked).filter((r) =>
      canUpdateUnified(r, user),
    );

    if (!targets.length) {
      toast.error("No selected reports are available for update");
      return;
    }

    if (targets.length <= 1) {
      goToEditor(clicked);
      return;
    }

    setWorkspaceIds(targets.map((r) => rowKey(r)));
    setWorkspaceMode("UPDATE");
    setWorkspaceLayout("VERTICAL");
    setWorkspaceActiveId(rowKey(clicked));
    setWorkspaceOpen(true);
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
    "mc";

  const COL_STORAGE_KEY = `mcDashboardCols:user:${colUserKey}`;

  const [colOpen, setColOpen] = useState(false);
  const DEFAULT_COLS: DashboardColKey[] = [
    "formType",
    "reportNumber",
    "formNumber",
    "dateSent",
    "actives",
  ];

  const [selectedCols, setSelectedCols] =
    useState<DashboardColKey[]>(DEFAULT_COLS);
  const [colsHydrated, setColsHydrated] = useState(false);

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

  function getCellValue(r: UnifiedRow, key: DashboardColKey) {
    switch (key) {
      case "reportNumber":
        return displayReportNo(r);

      case "formNumber":
        return r.formNumber || "-";

      case "client":
        return r.client || "-";

      case "formType":
        return typeLabel(r);

      case "dateSent":
        return formatDate(r.dateSent);

      case "manufactureDate":
        return formatDate(r.manufactureDate ?? null);

      case "createdAt":
        return formatDate(r.createdAt ?? null);

      case "updatedAt":
        return formatDate(r.updatedAt ?? null);

      case "actives":
        if (r.kind !== "CHEMISTRY") return "-";
        return "__ACTIVES__";

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
      .map((id) => unified.find((r) => rowKey(r) === id))
      .filter(Boolean) as UnifiedRow[];

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
      const microSlug =
        microFormTypeToSlug[(r.formType ?? "").trim()] || "micro-mix";
      const chemSlug =
        chemFormTypeToSlug[(r.formType ?? "").trim()] || "chemistry-mix";
      const returnTo = location.pathname + location.search;

      const navState = {
        correctionLaunch: true,
        correctionKinds: kinds,
      };

      if (r.formType === "CHEMISTRY_MIX" || r.formType === "COA") {
        navigate(
          `/chemistry-reports/${chemSlug}/${r.id}?returnTo=${encodeURIComponent(returnTo)}`,
          { state: navState },
        );
      } else {
        navigate(
          `/reports/${microSlug}/${r.id}?returnTo=${encodeURIComponent(returnTo)}`,
          { state: navState },
        );
      }
      return;
    }

   setWorkspaceIds(selected.map((r) => rowKey(r)));
    setWorkspaceMode("UPDATE"); // ✅ still UPDATE only
    setWorkspaceLayout("VERTICAL");
setWorkspaceActiveId(rowKey(selected[0]));
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

  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  // ----------------------------------
  // Render
  // ----------------------------------
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
          <h1 className="text-2xl font-bold tracking-tight">Lab Dashboard</h1>
          <p className="text-sm text-slate-500">
            Combined queue for Micro + Chemistry reports.
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
                            toast.error(e?.message || "Bulk update failed");
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
  if (!selectedIds.length || selectedHasCorrectionLockedStatus) return;

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

      {/* Category tabs */}
      <div className="mb-3 border-b border-slate-200">
        <nav className="-mb-px flex gap-6 text-sm">
          {(["ALL", "MICRO", "CHEMISTRY"] as const).map((c) => {
            const isActive = category === c;

            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={classNames(
                  "pb-2 border-b-2 text-sm font-medium",
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300",
                )}
              >
                {c === "ALL"
                  ? "All"
                  : c === "MICRO"
                    ? "Micro"
                    : c === "CHEMISTRY"
                      ? "Chemistry"
                      : "COA"}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Micro subtype tabs (only when ALL or MICRO) */}
      {category === "MICRO" && (
        <div className="mb-3 border-b border-slate-100">
          <nav className="-mb-px flex gap-6 text-sm">
            {(["ALL", "MICRO", "MICRO_WATER", "STERILITY"] as const).map(
              (ft) => {
                const isActive = microFormFilter === ft;
                return (
                  <button
                    key={ft}
                    type="button"
                    onClick={() => setMicroFormFilter(ft)}
                    className={classNames(
                      "pb-2 border-b-2 text-sm font-medium",
                      isActive
                        ? "border-slate-800 text-slate-800"
                        : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-200",
                    )}
                  >
                    {ft === "ALL"
                      ? "All Micro"
                      : ft === "MICRO"
                        ? "Micro Mix"
                        : ft === "STERILITY"
                          ? "Sterility"
                          : "Micro Water"}
                  </button>
                );
              },
            )}
          </nav>
        </div>
      )}

      {/* Chemistry subtype tabs (only when ALL or CHEMISTRY) */}
      {category === "CHEMISTRY" && (
        <div className="mb-3 border-b border-slate-100">
          <nav className="-mb-px flex gap-6 text-sm">
            {(["ALL", "CHEMISTRY_MIX", "COA"] as const).map((ft) => {
              const isActive = chemFormFilter === ft;
              return (
                <button
                  key={ft}
                  type="button"
                  onClick={() => setChemFormFilter(ft)}
                  className={classNames(
                    "pb-2 border-b-2 text-sm font-medium",
                    isActive
                      ? "border-slate-800 text-slate-800"
                      : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-200",
                  )}
                >
                  {ft === "ALL"
                    ? "All Chemistry"
                    : ft === "CHEMISTRY_MIX"
                      ? "Chemistry Mix"
                      : "COA"}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {category === "ALL" && (
        <div className="mb-3 border-b border-slate-100">
          <nav className="-mb-px flex gap-6 text-sm">
            {(
              [
                ["ALL", "All Types"],
                ["MICRO_MIX", "Micro Mix"],
                ["MICRO_MIX_WATER", "Micro Water"],
                ["STERILITY", "Sterility"],
                ["CHEMISTRY_MIX", "Chemistry Mix"],
                ["COA", "COA"],
              ] as const
            ).map(([key, label]) => {
              const isActive = allTypeFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAllTypeFilter(key)}
                  className={classNames(
                    "pb-2 border-b-2 text-sm font-medium",
                    isActive
                      ? "border-slate-800 text-slate-800"
                      : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-200",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {/* Controls */}
      {/* Controls */}
      <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm overflow-hidden">
        {/* Status chips */}
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
            >
              {niceStatus(String(s))}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* Global search */}
          <input
            placeholder="Search client, code, form #, report #, lot/batch #, formula, status, type, actives..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[260px] rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
          />

          {/* Sort */}
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
              title={sortDir === "asc" ? "Ascending" : "Descending"}
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>

          {/* Rows */}
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

          {/* Date preset + custom */}
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

          {/* Number range */}
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
              placeholder={`${
                numberRangeType === "FORM" ? "Form" : "Report"
              } # to`}
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

          {/* Actives */}
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className="w-52 rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            disabled={category === "MICRO"}
            title={
              category === "MICRO"
                ? "Actives filter applies to chemistry only"
                : undefined
            }
          >
            {allActives.map((a) => (
              <option key={a} value={a}>
                {a === "ALL" ? "All actives" : a}
              </option>
            ))}
          </select>

          {/* Clear */}
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
                    const key = rowKey(r);
                    const rowBusy = updatingKey === key;

                    const badge =
                      r.kind === "MICRO"
                        ? r.formType === "STERILITY"
                          ? STERILITY_STATUS_COLORS[
                              r.status as SterilityReportStatus
                            ]
                          : STATUS_COLORS[r.status as MicroReportStatus]
                        : r.formType === "COA"
                          ? COA_STATUS_COLORS[r.status as ChemistryReportStatus]
                          : CHEMISTRY_STATUS_COLORS[
                              r.status as ChemistryReportStatus
                            ];

                    const canUpdateRow = canUpdateUnified(r, user);

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
                            checked={isRowSelected(r)}
                            onChange={() => toggleRow(r)}
                            disabled={rowBusy}
                          />
                        </td>

                        {selectedCols.map((k) => (
                          <td key={k} className="px-4 py-3 whitespace-nowrap">
                            {k === "formType" ? (
                              <span
                                className={classNames(
                                  "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ring-1",
                                  r.kind === "MICRO"
                                    ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                                    : "bg-violet-50 text-violet-800 ring-violet-200",
                                )}
                              >
                                {typeLabel(r)}
                              </span>
                            ) : k === "actives" ? (
                              r.kind === "CHEMISTRY" ? (
                                <ActivesCell
                                  selectedActives={r.selectedActives}
                                  selectedActivesText={r.selectedActivesText}
                                />
                              ) : (
                                <span className="text-slate-400">-</span>
                              )
                            ) : k === "formNumber" || k === "reportNumber" ? (
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
                              badge ||
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
                                  reportNumber: r.reportNumber,
                                  formType: r.formType,
                                  clientCode: r.client || null,
                                });

                                openViewTarget(r);
                              }}
                              disabled={rowBusy}
                            >
                              View
                            </button>

                            {rowCanStartFinal(r) ? (
                              <button
                                disabled={rowBusy}
                                className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                onClick={async () => {
                                  if (rowBusy) return;
                                  setUpdatingKey(key);
                                  try {
                                    const res = await startMicroFinal(r);
                                    if (res.ok) {
                                      setMicroReports((prev) =>
                                        prev.map((x) =>
                                          x.id === r.id
                                            ? { ...x, status: res.nextStatus }
                                            : x,
                                        ),
                                      );
                                      openUpdateTarget({
                                        ...r,
                                        status: res.nextStatus,
                                      } as UnifiedRow);
                                    }
                                  } catch (e: any) {
                                    toast.error(
                                      e?.message || "Failed to start final",
                                    );
                                  } finally {
                                    setUpdatingKey(null);
                                  }
                                }}
                              >
                                {rowBusy ? <Spinner /> : null}
                                {rowBusy ? "Starting..." : "Start Final"}
                              </button>
                            ) : (
                              canUpdateRow && (
                                <button
                                  disabled={rowBusy}
                                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                  onClick={async () => {
                                    if (rowBusy) return;
                                    setUpdatingKey(key);
                                    try {
                                      await autoAdvanceAndOpen(r, "lab");
                                      openUpdateTarget(r);
                                    } catch (e: any) {
                                      toast.error(
                                        e?.message || "Failed to update status",
                                      );
                                    } finally {
                                      setUpdatingKey(null);
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
                      No reports found
                      {statusFilter !== "ALL" ? (
                        <>
                          {" "}
                          for{" "}
                          <span className="font-medium">
                            {niceStatus(statusFilter)}
                          </span>
                        </>
                      ) : null}
                      {search ? (
                        <>
                          {" "}
                          matching{" "}
                          <span className="font-medium">“{search}”</span>
                        </>
                      ) : null}
                      .
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
                {selectedReport.kind === "MICRO" ? "Micro" : "Chemistry"} Report
                ({displayReportNo(selectedReport)})
              </h2>

              <div className="flex items-center gap-2">
                {/* Print single */}
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
                        const r = selectedReport as UnifiedRow;
                        setSelectedReport(null);

                        const res = await startMicroFinal(r as any);
                        if (res.ok) {
                          setMicroReports((prev) =>
                            prev.map((x) =>
                              x.id === r.id
                                ? { ...x, status: res.nextStatus }
                                : x,
                            ),
                          );
                          openUpdateTarget({
                            ...(r as any),
                            status: res.nextStatus,
                          });
                        }
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
                  canUpdateUnified(selectedReport, user) && (
                    <button
                      disabled={modalUpdating}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                      onClick={async () => {
                        if (modalUpdating) return;
                        setModalUpdating(true);
                        try {
                          const r = selectedReport;
                          setSelectedReport(null);
                          await autoAdvanceAndOpen(r, "lab");
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
              {selectedReport.kind === "MICRO" ? (
                selectedReport.formType === "MICRO_MIX" ? (
                  <MicroMixReportFormView
                    report={selectedReport as any}
                    onClose={() => setSelectedReport(null)}
                    showSwitcher={false}
                    pane="FORM"
                  />
                ) : selectedReport.formType === "STERILITY" ? (
                  <SterilityReportFormView
                    report={selectedReport as any}
                    onClose={() => setSelectedReport(null)}
                    showSwitcher={false}
                    pane="FORM"
                  />
                ) : selectedReport.formType === "MICRO_MIX_WATER" ? (
                  <MicroMixWaterReportFormView
                    report={selectedReport as any}
                    onClose={() => setSelectedReport(null)}
                    showSwitcher={false}
                    pane="FORM"
                  />
                ) : (
                  <div className="text-sm text-slate-600">
                    This micro form type ({selectedReport.formType}) doesn’t
                    have a viewer yet.
                  </div>
                )
              ) : selectedReport.formType === "CHEMISTRY_MIX" ? (
                <ChemistryMixReportFormView
                  report={selectedReport as any}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane="FORM"
                />
              ) : selectedReport.formType === "COA" ? (
                <COAReportFormView
                  report={selectedReport as any}
                  onClose={() => setSelectedReport(null)}
                  showSwitcher={false}
                  pane="FORM"
                />
              ) : (
                <div className="text-sm text-slate-600">
                  This chemistry form type ({selectedReport.formType}) doesn’t
                  have a viewer yet.
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
