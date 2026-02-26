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
  STATUS_COLORS,
  canShowUpdateButton,
  type ReportStatus as MicroReportStatus,
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

import { useLiveReportStatus } from "../../hooks/useLiveReportStatus";
import { logUiEvent } from "../../lib/uiAudit";
import SterilityReportFormView from "../Reports/SterilityReportFormView";
import {
  canShowSterilityUpdateButton,
  STERILITY_STATUS_COLORS,
  type SterilityReportStatus,
} from "../../utils/SterilityReportFormWorkflow";
import COAReportFormView from "../Reports/COAReportFormView";
import {
  canShowCOAUpdateButton,
  COA_STATUS_COLORS,
} from "../../utils/COAReportFormWorkflow";

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
  selectedActives?: string[];
  selectedActivesText?: string;
};

type UnifiedRow =
  | ({ kind: "MICRO" } & MicroReport)
  | ({ kind: "CHEMISTRY" } & ChemReport);

// ----------------------------------
// Status lists (same as your pages)
// ----------------------------------
const MICRO_STATUSES = [
  "ALL",
  "SUBMITTED_BY_CLIENT",
  "UNDER_PRELIMINARY_TESTING_REVIEW",
  "PRELIMINARY_APPROVED",
  "UNDER_FINAL_TESTING_REVIEW",
  "PRELIMINARY_TESTING_NEEDS_CORRECTION",
  "PRELIMINARY_RESUBMISSION_BY_CLIENT",
  "CLIENT_NEEDS_PRELIMINARY_CORRECTION",
  "UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW",
  "UNDER_FINAL_RESUBMISSION_TESTING_REVIEW",
  "CLIENT_NEEDS_FINAL_CORRECTION",
  "UNDER_CLIENT_PRELIMINARY_REVIEW",

  //STERILITY
  "UNDER_TESTING_REVIEW",
  "TESTING_NEEDS_CORRECTION",
  "RESUBMISSION_BY_CLIENT",
  "CLIENT_NEEDS_CORRECTION",
  "UNDER_RESUBMISSION_TESTING_REVIEW",
  "APPROVED",
] as const;

const CHEMISTRY_STATUSES = [
  "ALL",
  "SUBMITTED_BY_CLIENT",
  "UNDER_TESTING_REVIEW",
  "TESTING_NEEDS_CORRECTION",
  "RESUBMISSION_BY_CLIENT",
  "CLIENT_NEEDS_CORRECTION",
  "UNDER_RESUBMISSION_TESTING_REVIEW",
  "APPROVED",
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

// ----------------------------------
// Component: Combined dashboard
// ----------------------------------
export default function MCDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

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

  const [category, setCategory] = useState<Category>(
    (searchParams.get("cat") as Category) || "ALL",
  );

  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("status") || "ALL",
  );

  const [search, setSearch] = useState(searchParams.get("q") || "");

  const [allTypeFilter, setAllTypeFilter] = useState<AllTypeFilter>(
    (searchParams.get("type") as AllTypeFilter) || "ALL",
  );

  const [microFormFilter, setMicroFormFilter] = useState<MicroFormFilter>(
    (searchParams.get("mtype") as MicroFormFilter) || "ALL",
  );

  const [chemFormFilter, setChemFormFilter] = useState<ChemFormFilter>(
    (searchParams.get("ctype") as ChemFormFilter) || "ALL",
  );

  const [activeFilter, setActiveFilter] = useState(
    searchParams.get("active") || "ALL",
  );

  const [datePreset, setDatePreset] = useState<DatePreset>(
    (searchParams.get("dp") as DatePreset) || "ALL",
  );

  const [fromDate, setFromDate] = useState(searchParams.get("from") || "");
  const [toDate, setToDate] = useState(searchParams.get("to") || "");

  const [sortBy, setSortBy] = useState<"dateSent" | "reportNumber">(
    (searchParams.get("sortBy") as any) || "dateSent",
  );

  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    (searchParams.get("sortDir") as any) || "desc",
  );

  const [perPage, setPerPage] = useState(
    parseIntSafe(searchParams.get("pp"), 10),
  );
  const [page, setPage] = useState(parseIntSafe(searchParams.get("p"), 1));

  // type MicroFormFilter = "ALL" | "MICRO" | "MICRO_WATER" | "STERILITY";
  // const [microFormFilter, setMicroFormFilter] =
  //   useState<MicroFormFilter>("ALL");

  // type ChemFormFilter = "ALL" | "CHEMISTRY_MIX" | "COA";

  // const [chemFormFilter, setChemFormFilter] = useState<ChemFormFilter>("ALL");

  // const [statusFilter, setStatusFilter] = useState<string>("ALL");
  // const [search, setSearch] = useState("");
  // const [sortBy, setSortBy] = useState<"dateSent" | "reportNumber">("dateSent");
  // const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // const [page, setPage] = useState(1);
  // const [perPage, setPerPage] = useState(10);

  // const [datePreset, setDatePreset] = useState<DatePreset>("ALL");
  // const [fromDate, setFromDate] = useState<string>("");
  // const [toDate, setToDate] = useState<string>("");

  // const [activeFilter, setActiveFilter] = useState<string>("ALL"); // chemistry actives

  // Selection + print
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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

  // -----------------------------
  // Merge into unified list
  // -----------------------------
  const unified: UnifiedRow[] = useMemo(() => {
    const m = microReports.map((r) => ({ ...r, kind: "MICRO" as const }));
    const c = chemReports.map((r) => ({ ...r, kind: "CHEMISTRY" as const }));
    return [...m, ...c];
  }, [microReports, chemReports]);

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
    if (category === "MICRO") return MICRO_STATUSES as unknown as string[];

    if (category === "CHEMISTRY") {
      const set = new Set<string>(["ALL"]);
      CHEMISTRY_STATUSES.forEach((s) => s !== "ALL" && set.add(String(s)));
      Object.keys(COA_STATUS_COLORS).forEach((s) => set.add(String(s)));
      return Array.from(set);
    }

    // ALL: union
    const set = new Set<string>(["ALL"]);
    MICRO_STATUSES.forEach((s) => s !== "ALL" && set.add(String(s)));
    CHEMISTRY_STATUSES.forEach((s) => s !== "ALL" && set.add(String(s)));
    Object.keys(COA_STATUS_COLORS).forEach((s) => set.add(String(s)));
    return Array.from(set);
  }, [category]);

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
    if (statusFilter !== "ALL")
      rows = rows.filter((r) => r.status === statusFilter);

    // 2) search
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const combinedNo = displayReportNo(r).toLowerCase();
        const base =
          combinedNo.includes(q) ||
          r.client.toLowerCase().includes(q) ||
          String(r.status).toLowerCase().includes(q) ||
          r.formNumber.toLowerCase().includes(q) ||
          r.formType.toLowerCase().includes(q);

        if (base) return true;

        // chemistry actives search
        if (r.kind === "CHEMISTRY") {
          const activesStr = (
            r.selectedActivesText ||
            (r.selectedActives?.join(", ") ?? "")
          ).toLowerCase();
          return activesStr.includes(q);
        }

        return false;
      });
    }

    // 2.5) chemistry actives filter (ONLY when category === "CHEMISTRY")
    if (category === "CHEMISTRY" && activeFilter !== "ALL") {
      rows = rows.filter((r) => {
        if (r.kind !== "CHEMISTRY") return false;
        const list = r.selectedActivesText?.trim()
          ? r.selectedActivesText.split(",").map((s) => s.trim())
          : (r.selectedActives ?? []).map((s) => String(s).trim());
        return list.includes(activeFilter);
      });
    }

    // 3) date range
    rows = rows.filter((r) =>
      matchesDateRange(r.dateSent, fromDate || undefined, toDate || undefined),
    );

    // 4) sort
    const sorted = [...rows].sort((a, b) => {
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
    if (search.trim()) sp.set("q", search.trim());
    sp.set("type", allTypeFilter);
    sp.set("mtype", microFormFilter);
    sp.set("ctype", chemFormFilter);
    sp.set("active", activeFilter);
    sp.set("dp", datePreset);
    if (fromDate) sp.set("from", fromDate);
    if (toDate) sp.set("to", toDate);
    sp.set("sortBy", sortBy);
    sp.set("sortDir", sortDir);
    sp.set("pp", String(perPage));
    sp.set("p", String(pageClamped)); // keep valid

    setSearchParams(sp, { replace: true }); // no history spam
  }, [
    category,
    statusFilter,
    search,
    allTypeFilter,
    microFormFilter,
    chemFormFilter,
    activeFilter,
    datePreset,
    fromDate,
    toDate,
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
  const rowKey = (r: UnifiedRow) => `${r.kind}:${r.id}`;
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

  // -----------------------------
  // Update / Advance
  // -----------------------------
  async function autoAdvanceAndOpen(r: UnifiedRow, actor: string) {
    if (r.kind === "MICRO") {
      const isSterility = r.formType === "STERILITY";
      let nextStatus: string | null = null;

      if (isSterility) {
        // ✅ Sterility uses CHEMISTRY-like statuses
        if (r.status === "SUBMITTED_BY_CLIENT") {
          nextStatus = "UNDER_TESTING_REVIEW";
          await setMicroStatus(r, nextStatus, "Move to sterility testing");
        } else if (r.status === "CLIENT_NEEDS_CORRECTION") {
          nextStatus = "UNDER_RESUBMISSION_TESTING_REVIEW";
          await setMicroStatus(r, nextStatus, "Move to sterility resubmission");
        } else if (r.status === "RESUBMISSION_BY_CLIENT") {
          nextStatus = "UNDER_TESTING_REVIEW";
          await setMicroStatus(r, nextStatus, "Resubmitted by client");
        }
      } else {
        // ✅ Micro Mix / Water uses PRELIM + FINAL statuses
        if (r.status === "SUBMITTED_BY_CLIENT") {
          nextStatus = "UNDER_PRELIMINARY_TESTING_REVIEW";
          await setMicroStatus(r, nextStatus, "Move to prelim testing");
        } else if (r.status === "CLIENT_NEEDS_PRELIMINARY_CORRECTION") {
          nextStatus = "UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW";
          await setMicroStatus(r, nextStatus, "Move to RESUBMISSION");
        } else if (r.status === "PRELIMINARY_APPROVED") {
          nextStatus = "UNDER_FINAL_TESTING_REVIEW";
          await setMicroStatus(r, nextStatus, "Move to final testing");
        } else if (r.status === "PRELIMINARY_RESUBMISSION_BY_CLIENT") {
          nextStatus = "UNDER_PRELIMINARY_TESTING_REVIEW";
          await setMicroStatus(r, nextStatus, "Resubmitted by client");
        } else if (r.status === "CLIENT_NEEDS_FINAL_CORRECTION") {
          nextStatus = "UNDER_FINAL_RESUBMISSION_TESTING_REVIEW";
          await setMicroStatus(r, nextStatus, `Set by ${actor}`);
        }
      }

      if (nextStatus) {
        setMicroReports((prev) =>
          prev.map((x) => (x.id === r.id ? { ...x, status: nextStatus! } : x)),
        );
      }

      goToEditor(r);
      return;
    }

    // CHEMISTRY
    let nextStatus: string | null = null;

    if (r.formType === "COA") {
      if (r.status === "SUBMITTED_BY_CLIENT") {
        nextStatus = "UNDER_TESTING_REVIEW";
        await setChemStatus(r, nextStatus, "Move COA to testing");
      } else if (r.status === "CLIENT_NEEDS_CORRECTION") {
        nextStatus = "UNDER_RESUBMISSION_TESTING_REVIEW";
        await setChemStatus(
          r,
          nextStatus,
          `COA correction requested by ${actor}`,
        );
      } else if (r.status === "RESUBMISSION_BY_CLIENT") {
        nextStatus = "UNDER_TESTING_REVIEW";
        await setChemStatus(r, nextStatus, "COA resubmitted by client");
      }
    } else {
      // CHEMISTRY_MIX
      if (r.status === "SUBMITTED_BY_CLIENT") {
        nextStatus = "UNDER_TESTING_REVIEW";
        await setChemStatus(r, nextStatus, "Move to testing");
      } else if (r.status === "CLIENT_NEEDS_CORRECTION") {
        nextStatus = "UNDER_RESUBMISSION_TESTING_REVIEW";
        await setChemStatus(r, nextStatus, `Set by ${actor}`);
      } else if (r.status === "RESUBMISSION_BY_CLIENT") {
        nextStatus = "UNDER_TESTING_REVIEW";
        await setChemStatus(r, nextStatus, "Resubmitted by client");
      }
    }

    if (nextStatus) {
      setChemReports((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, status: nextStatus! } : x)),
      );
    }

    goToEditor(r);
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
      search.trim() !== "" ||
      sortBy !== "dateSent" ||
      sortDir !== "desc" ||
      perPage !== 10 ||
      datePreset !== "ALL" ||
      fromDate !== "" ||
      toDate !== "" ||
      activeFilter !== "ALL"
    );
  }, [
    category,
    allTypeFilter,
    microFormFilter,
    chemFormFilter,
    statusFilter,
    search,
    sortBy,
    sortDir,
    perPage,
    datePreset,
    fromDate,
    toDate,
    activeFilter,
  ]);

  const clearAllFilters = () => {
    setCategory("ALL");
    setAllTypeFilter("ALL");
    setMicroFormFilter("ALL");
    setChemFormFilter("ALL");
    setStatusFilter("ALL");
    setSearch("");
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
          <h1 className="text-2xl font-bold tracking-tight">Lab Dashboard</h1>
          <p className="text-sm text-slate-500">
            Combined queue for Micro + Chemistry reports.
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
      <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
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

        {/* Search + sort + rows */}
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search report #, client, status, form #, type, actives…"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            >
              <option value="dateSent">Date Sent</option>
              <option value="reportNumber">Report #</option>
            </select>
            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
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

        {/* Date + Actives + Clear */}
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-12 md:items-end">
          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Date preset
            </label>
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

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              From
            </label>
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

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              To
            </label>
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

          {/* Chemistry active filter only really useful when ALL or CHEMISTRY */}
          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Active
            </label>
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="w-full rounded-lg border bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
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
          </div>

          <div className="md:col-span-2 md:flex md:justify-end">
            <button
              type="button"
              onClick={clearAllFilters}
              disabled={!hasActiveFilters}
              className={classNames(
                "w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition",
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
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Report #</th>
                <th className="px-4 py-3 font-medium">Form #</th>
                <th className="px-4 py-3 font-medium">Actives</th>
                <th className="px-4 py-3 font-medium">Date Sent</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading &&
                [...Array(7)].map((_, i) => (
                  <tr key={`skel-${i}`} className="border-t">
                    <td className="px-4 py-3">
                      <div className="h-4 w-4 rounded bg-slate-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
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
                    <tr key={key} className="border-t hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isRowSelected(r)}
                          onChange={() => toggleRow(r)}
                          disabled={rowBusy}
                        />
                      </td>

                      <td className="px-4 py-3">
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
                      </td>

                      <td className="px-4 py-3 font-medium">
                        {displayReportNo(r)}
                      </td>
                      <td className="px-4 py-3">{r.formNumber}</td>

                      <td className="px-4 py-3">
                        {r.kind === "CHEMISTRY" ? (
                          <ActivesCell
                            selectedActives={r.selectedActives}
                            selectedActivesText={r.selectedActivesText}
                          />
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      <td className="px-4 py-3">{formatDate(r.dateSent)}</td>

                      <td className="px-4 py-3">
                        <span
                          className={classNames(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                            badge ||
                              "bg-slate-100 text-slate-800 ring-1 ring-slate-200",
                          )}
                        >
                          {niceStatus(String(r.status))}
                        </span>
                      </td>

                      <td className="px-4 py-3">
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
                              });

                              setSelectedReport(r);
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
                                    goToEditor({
                                      ...r,
                                      status: res.nextStatus,
                                    } as any);
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
                    colSpan={8}
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
                        matching <span className="font-medium">“{search}”</span>
                      </>
                    ) : null}
                    .
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
                          goToEditor({ ...(r as any), status: res.nextStatus });
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
    </div>
  );
}
