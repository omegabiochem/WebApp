// src/pages/Dashboards/MicroLoginBook.tsx
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { formatDate } from "../utils/dashboardsSharedTypes";

type Report = {
  id: string;

  formType: string;
  formNumber: string;
  reportNumber: string | null;
  status: string;
  prefix?: string;
  version: number;

  // flattened Micro details (from flattenReport in /reports)
  client?: string | null;

  // Micro fields (your schema uses these names on MicroMixDetails/MicroMixWaterDetails)
  description?: string | null; // sample description
  lotNo?: string | null; // lot #
  typeOfTest?: string | null; // type of test

  testedDate?: string | null;
  testedBy?: string | null;

  dateTested?: string | null; // fallback
  initial?: string | null; // fallback
};

function displayReportNo(r: Report) {
  return (r.reportNumber || "").trim() || "-";
}

/**
 * ReportNumber order only:
 * - Valid reportNumber first (ascending)
 * - Missing reportNumber at bottom
 */
function sortByReportNumberAsc(a: Report, b: Report) {
  const aNo = (a.reportNumber || "").trim();
  const bNo = (b.reportNumber || "").trim();

  const aHas = !!aNo;
  const bHas = !!bNo;

  if (aHas && bHas) return aNo.localeCompare(bNo);
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;

  return (a.formNumber || "").localeCompare(b.formNumber || "");
}

function exportCsv(rows: Report[]) {
  const headers = [
    "ReportNumber",
    "Client",
    "SampleDescription",
    "LotNo",
    "TypeOfTest",
    "Date",
    "Initials",
    "Status",
    "FormNumber",
    "FormType",
  ];

  const escape = (v: any) => {
    const s = String(v ?? "");
    const needs = /[",\n]/.test(s);
    const out = s.replace(/"/g, '""');
    return needs ? `"${out}"` : out;
  };

  const lines = [
    headers.join(","),
    ...rows.map((r) => {
      const dateVal = r.testedDate || (r as any).dateTested || null;
      const initialsVal =
        r.testedBy || (r as any).initial || (r as any).testedBy || null;

      return [
        displayReportNo(r),
        r.client ?? "",
        r.description ?? "",
        r.lotNo ?? "",
        r.typeOfTest ?? "",
        dateVal ? formatDate(dateVal) : "",
        initialsVal ?? "",
        r.status ?? "",
        r.formNumber ?? "",
        r.formType ?? "",
      ]
        .map(escape)
        .join(",");
    }),
  ];

  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `micro-login-book-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function StatusPill({ value }: { value: string }) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1";
  const v = String(value || "").toUpperCase();

  if (v.includes("APPROVED"))
    return (
      <span
        className={`${base} bg-emerald-50 text-emerald-700 ring-emerald-200`}
      >
        APPROVED
      </span>
    );

  if (v.includes("NEEDS_CORRECTION"))
    return (
      <span className={`${base} bg-rose-50 text-rose-700 ring-rose-200`}>
        NEEDS CORRECTION
      </span>
    );

  if (v.includes("UNDER_"))
    return (
      <span className={`${base} bg-blue-50 text-blue-700 ring-blue-200`}>
        IN PROGRESS
      </span>
    );

  return (
    <span className={`${base} bg-slate-50 text-slate-700 ring-slate-200`}>
      {v.replace(/_/g, " ").slice(0, 24)}
    </span>
  );
}

function PageBtn({
  active,
  disabled,
  children,
  onClick,
  ariaLabel,
}: {
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={onClick}
      className={[
        "inline-flex h-9 min-w-[36px] items-center justify-center rounded-lg border px-2 text-sm font-semibold",
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "bg-white text-slate-700 hover:bg-slate-50",
        disabled ? "cursor-not-allowed opacity-50 hover:bg-white" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** Small helper: show page numbers like 1 ... 5 6 7 ... 20 */
function getPageItems(current: number, total: number) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const items: Array<number | "..."> = [];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);

  items.push(1);
  if (left > 2) items.push("...");

  for (let p = left; p <= right; p++) items.push(p);

  if (right < total - 1) items.push("...");
  items.push(total);

  return items;
}

export default function MicroLoginBook() {
  const [rows, setRows] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  // ✅ pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  useEffect(() => {
    let abort = false;

    async function load() {
      try {
        setLoading(true);

        // Micro reports are from /reports (flattened)
        const all = await api<Report[]>("/reports");
        if (abort) return;

        const micro = all.filter(
          (r) => r.formType === "MICRO_MIX" || r.formType === "MICRO_MIX_WATER",
        );
        setRows(micro);
      } catch (e: any) {
        toast.error(e?.message || "Failed to load Micro Login Book");
      } finally {
        if (!abort) setLoading(false);
      }
    }

    load();
    return () => {
      abort = true;
    };
  }, []);

  const processed = useMemo(() => {
    const query = q.trim().toLowerCase();

    // ✅ ONLY rows that have a real reportNumber
    const withReportNo = rows.filter(
      (r) => (r.reportNumber || "").trim() !== "",
    );

    const filtered = query
      ? withReportNo.filter((r) => {
          const rn = displayReportNo(r).toLowerCase();
          const client = (r.client || "").toLowerCase();
          const sd = (r.description || "").toLowerCase();
          const lot = (r.lotNo || "").toLowerCase();
          const tot = (r.typeOfTest || "").toLowerCase();
          const st = (r.status || "").toLowerCase();
          const fn = (r.formNumber || "").toLowerCase();

          return (
            rn.includes(query) ||
            client.includes(query) ||
            sd.includes(query) ||
            lot.includes(query) ||
            tot.includes(query) ||
            st.includes(query) ||
            fn.includes(query)
          );
        })
      : withReportNo;

    return [...filtered].sort(sortByReportNumberAsc);
  }, [rows, q]);

  // ✅ reset to page 1 when search or page size changes
  useEffect(() => {
    setPage(1);
  }, [q, pageSize]);

  const stats = useMemo(() => {
    const total = processed.length;
    const approved = processed.filter((r) =>
      String(r.status).toUpperCase().includes("APPROVED"),
    ).length;
    const needs = processed.filter((r) =>
      String(r.status).toUpperCase().includes("NEEDS_CORRECTION"),
    ).length;

    return { total, approved, needs };
  }, [processed]);

  // ✅ paging computed from processed
  const paging = useMemo(() => {
    const total = processed.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);

    const startIndex = (safePage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, total);

    const pageRows = processed.slice(startIndex, endIndex);

    return { total, totalPages, safePage, startIndex, endIndex, pageRows };
  }, [processed, page, pageSize]);

  // keep page in range if data changes
  useEffect(() => {
    if (page !== paging.safePage) setPage(paging.safePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paging.safePage]);

  const isPrinting =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("print").matches
      : false;

  // ✅ for print: show all rows
  const displayRows = isPrinting ? processed : paging.pageRows;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50/70 p-6">
      {/* Print styles */}
      <style>
        {`
          @media print {
            @page { size: A4 landscape; margin: 10mm; }
            body { background: white !important; }
            .no-print { display: none !important; }
            .print-card { box-shadow: none !important; border: none !important; }
            .print-pad { padding: 0 !important; }
            thead { display: table-header-group; }
            tr { break-inside: avoid; page-break-inside: avoid; }
          }
        `}
      </style>

      {/* Header bar */}
      <div className="no-print mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Micro Login Book
            </h1>
            <span className="inline-flex items-center rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
              REPORT # ORDER ONLY
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            One-row-per-report summary for quick lab log review.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative w-full sm:w-[420px]">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search report #, client, form #, sample description, lot, type of test, status…"
              className="w-full rounded-xl border bg-white px-3 py-2.5 pr-10 text-sm text-slate-900 shadow-sm outline-none ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
                aria-label="Clear search"
              >
                ✕
              </button>
            ) : (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                ⌕
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => exportCsv(processed)}
              className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              ⭳ Export CSV
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              🖨️ Print
            </button>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="no-print mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Total rows</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {loading ? "—" : stats.total}
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Approved</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {loading ? "—" : stats.approved}
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">
            Needs correction
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {loading ? "—" : stats.needs}
          </div>
        </div>
      </div>

      {/* Card */}
      <div className="print-card overflow-hidden rounded-2xl border bg-white shadow-sm">
        {/* ✅ Pagination top bar */}
        <div className="no-print flex flex-col gap-2 border-b bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            {loading ? (
              "Loading…"
            ) : paging.total === 0 ? (
              "No rows"
            ) : (
              <>
                Showing{" "}
                <span className="font-semibold text-slate-900">
                  {paging.startIndex + 1}–{paging.endIndex}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-slate-900">
                  {paging.total}
                </span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-slate-500">
              Rows/page
            </label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-9 rounded-lg border bg-white px-2 text-sm font-semibold text-slate-700"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>

            <div className="mx-2 h-6 w-px bg-slate-200" />

            <PageBtn
              disabled={loading || paging.safePage <= 1}
              onClick={() => setPage(1)}
              ariaLabel="First page"
            >
              «
            </PageBtn>
            <PageBtn
              disabled={loading || paging.safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              ariaLabel="Previous page"
            >
              ‹
            </PageBtn>

            {/* page numbers */}
            <div className="flex items-center gap-1">
              {getPageItems(paging.safePage, paging.totalPages).map(
                (it, idx) =>
                  it === "..." ? (
                    <span
                      key={`e-${idx}`}
                      className="px-2 text-sm text-slate-400"
                    >
                      …
                    </span>
                  ) : (
                    <PageBtn
                      key={it}
                      active={it === paging.safePage}
                      disabled={loading}
                      onClick={() => setPage(it)}
                      ariaLabel={`Page ${it}`}
                    >
                      {it}
                    </PageBtn>
                  ),
              )}
            </div>

            <PageBtn
              disabled={loading || paging.safePage >= paging.totalPages}
              onClick={() => setPage((p) => Math.min(paging.totalPages, p + 1))}
              ariaLabel="Next page"
            >
              ›
            </PageBtn>
            <PageBtn
              disabled={loading || paging.safePage >= paging.totalPages}
              onClick={() => setPage(paging.totalPages)}
              ariaLabel="Last page"
            >
              »
            </PageBtn>
          </div>
        </div>

        <div className="print-pad overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="border-b px-4 py-3">Report #</th>
                <th className="border-b px-4 py-3">Client</th>
                <th className="border-b px-4 py-3">Sample description</th>
                <th className="border-b px-4 py-3">Lot #</th>
                <th className="border-b px-4 py-3">Type of test</th>
                <th className="border-b px-4 py-3">Status</th>
              </tr>
            </thead>

            <tbody>
              {loading &&
                [...Array(12)].map((_, i) => (
                  <tr key={`sk-${i}`} className="border-b">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!loading &&
                displayRows.map((r, idx) => {
                  // keep zebra correct in paged view:
                  const absoluteIndex = isPrinting
                    ? idx
                    : paging.startIndex + idx;

                  return (
                    <tr
                      key={r.id}
                      className={
                        absoluteIndex % 2 === 0
                          ? "bg-white"
                          : "bg-slate-50/50 hover:bg-slate-50"
                      }
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">
                          {displayReportNo(r)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Form: {r.formNumber}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {r.client || "-"}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {r.formType === "MICRO_MIX"
                            ? "Micro"
                            : r.formType === "MICRO_MIX_WATER"
                              ? "Micro Water"
                              : r.formType}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="max-w-[420px] truncate text-slate-800">
                          {r.description || "-"}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                          {r.lotNo || "-"}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="max-w-[420px] truncate text-slate-800">
                          {r.typeOfTest || "-"}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <StatusPill value={r.status} />
                      </td>
                    </tr>
                  );
                })}

              {!loading && processed.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-14 text-center text-slate-500"
                  >
                    No records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!loading && processed.length > 0 && (
          <div className="no-print flex items-center justify-between gap-3 border-t bg-white px-4 py-3 text-sm">
            <div className="text-slate-600">
              Page{" "}
              <span className="font-semibold text-slate-900">
                {paging.safePage}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-slate-900">
                {paging.totalPages}
              </span>
            </div>

            <div className="text-xs text-slate-500">
              Tip: Use Export CSV for Excel.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
