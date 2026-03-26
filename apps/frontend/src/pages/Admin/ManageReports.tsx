import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw, Shield } from "lucide-react";
import { api } from "../../lib/api";

function cx(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition " +
  "disabled:opacity-50 disabled:cursor-not-allowed " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-200";

const btn = {
  outline: cx(
    btnBase,
    "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  ),
};

const card = "rounded-xl border border-slate-200 bg-white shadow-sm";
const cardHeader =
  "px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-white to-slate-50";

const inputBase =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 " +
  "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300";

const statCardBase = "rounded-xl border shadow-sm p-4 text-left transition";

const statCardStyles = {
  slate: "bg-white border-slate-200",
  indigo: "bg-indigo-50 border-indigo-200",
  sky: "bg-sky-50 border-sky-200",
  emerald: "bg-emerald-50 border-emerald-200",
  amber: "bg-amber-50 border-amber-200",
  violet: "bg-violet-50 border-violet-200",
  rose: "bg-rose-50 border-rose-200",
};
function fmtDate(x: string | null) {
  if (!x) return "—";
  const d = new Date(x);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function ManageReports() {
  type RangeType =
    | "ALL"
    | "TODAY"
    | "TOMORROW"
    | "YESTERDAY"
    | "LAST_7_DAYS"
    | "LAST_30_DAYS"
    | "THIS_MONTH"
    | "CUSTOM";

  type MetricType =
    | "ALL"
    | "MICRO_MIX"
    | "MICRO_MIX_WATER"
    | "STERILITY"
    | "CHEMISTRY_MIX"
    | "COA";

  type ClientReportSummaryRow = {
    clientCode: string;
    totalReports: number;
    microReports: number;
    microWaterReports: number;
    sterilityReports: number;
    chemistryReports: number;
    coaReports: number;
    latestReportAt: string | null;
  };

  type ReportListRow = {
    id: string;
    formType: string;
    formNumber: string;
    reportNumber: string | null;
    status: string;
    clientCode: string | null;
    createdAt: string;
  };

  const [clientCode, setClientCode] = useState("ALL");
  const [clientCodes, setClientCodes] = useState<string[]>(["ALL"]);
  const [range, setRange] = useState<RangeType>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ClientReportSummaryRow[]>([]);

  const [selectedMetric, setSelectedMetric] = useState<MetricType | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailItems, setDetailItems] = useState<ReportListRow[]>([]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(10);
  const [detailTotal, setDetailTotal] = useState(0);

  async function loadClientCodes() {
    try {
      const res = await api<string[]>("/admin/client-codes");
      setClientCodes(res?.length ? res : ["ALL"]);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load client codes");
    }
  }

  useEffect(() => {
    loadClientCodes();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await api<{
        items: ClientReportSummaryRow[];
        total: number;
        page: number;
        pageSize: number;
      }>(
        `/admin/reports/client-summary?clientCode=${encodeURIComponent(
          clientCode,
        )}&range=${encodeURIComponent(range)}&from=${encodeURIComponent(
          from,
        )}&to=${encodeURIComponent(to)}&page=${page}&pageSize=${pageSize}`,
      );

      setItems(res.items);
      setTotal(res.total);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load client report summary");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(
    metric: MetricType,
    nextPage = 1,
    nextPageSize = detailPageSize,
  ) {
    setSelectedMetric(metric);
    setDetailLoading(true);

    try {
      const res = await api<{
        items: ReportListRow[];
        total: number;
        page: number;
        pageSize: number;
      }>(
        `/admin/reports/client-summary/details?clientCode=${encodeURIComponent(
          clientCode,
        )}&range=${encodeURIComponent(range)}&from=${encodeURIComponent(
          from,
        )}&to=${encodeURIComponent(to)}&metric=${encodeURIComponent(
          metric,
        )}&page=${nextPage}&pageSize=${nextPageSize}`,
      );

      setDetailItems(res.items);
      setDetailTotal(res.total);
      setDetailPage(nextPage);
      setDetailPageSize(nextPageSize);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load reports");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => load(), 250);
    return () => clearTimeout(t);
  }, [clientCode, range, from, to, page, pageSize]);

  useEffect(() => {
    setSelectedMetric(null);
    setDetailItems([]);
  }, [clientCode, range, from, to]);

  useEffect(() => {
    setSelectedMetric(null);
    setDetailItems([]);
    setPage(1);
    setDetailPage(1);
  }, [clientCode, range, from, to]);

  const summary = useMemo(() => {
    return items.reduce(
      (acc, row) => {
        acc.clients += 1;
        acc.totalReports += row.totalReports;
        acc.microReports += row.microReports;
        acc.microWaterReports += row.microWaterReports;
        acc.sterilityReports += row.sterilityReports;
        acc.chemistryReports += row.chemistryReports;
        acc.coaReports += row.coaReports;
        return acc;
      },
      {
        clients: 0,
        totalReports: 0,
        microReports: 0,
        microWaterReports: 0,
        sterilityReports: 0,
        chemistryReports: 0,
        coaReports: 0,
      },
    );
  }, [items]);

  function metricTitle(metric: MetricType | null) {
    switch (metric) {
      case "ALL":
        return "All Reports";
      case "MICRO_MIX":
        return "Micro Reports";
      case "MICRO_MIX_WATER":
        return "Micro Water Reports";
      case "STERILITY":
        return "Sterility Reports";
      case "CHEMISTRY_MIX":
        return "Chemistry Reports";
      case "COA":
        return "COA Reports";
      default:
        return "";
    }
  }
  function summaryCard(
    title: string,
    value: number,
    metric: MetricType,
    tone: "slate" | "indigo" | "sky" | "emerald" | "amber" | "violet" | "rose",
  ) {
    const active = selectedMetric === metric;

    return (
      <button
        type="button"
        onClick={() => loadDetail(metric, 1, detailPageSize)}
        className={cx(
          statCardBase,
          statCardStyles[tone],
          "hover:shadow-md",
          active && "ring-2 ring-indigo-400 border-indigo-300",
        )}
      >
        <div className="text-xs font-medium text-slate-600">{title}</div>
        <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      </button>
    );
  }

  return (
    <div className="p-6 space-y-5 bg-slate-50 text-slate-900 min-h-[calc(100vh-64px)]">
      <div className={cx(card, "overflow-hidden")}>
        <div className={cx(cardHeader, "flex items-center justify-between")}>
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-slate-600" />
            <div className="font-semibold text-slate-900">
              Client Report Summary
            </div>
          </div>

          <button onClick={load} className={btn.outline} type="button">
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-slate-600 mb-1">Client</label>
            <select
              className={cx(inputBase, "cursor-pointer")}
              value={clientCode}
              onChange={(e) => {
                setClientCode(e.target.value);
                setItems([]);
                setPage(1);
              }}
            >
              {clientCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-600 mb-1">Range</label>
            <select
              className={cx(inputBase, "cursor-pointer")}
              value={range}
              onChange={(e) => {
                setRange(e.target.value as RangeType);
                setPage(1);
              }}
            >
              <option value="ALL">ALL</option>
              <option value="TODAY">TODAY</option>
              <option value="TOMORROW">TOMORROW</option>
              <option value="YESTERDAY">YESTERDAY</option>
              <option value="LAST_7_DAYS">LAST 7 DAYS</option>
              <option value="LAST_30_DAYS">LAST 30 DAYS</option>
              <option value="THIS_MONTH">THIS MONTH</option>
              <option value="CUSTOM">CUSTOM</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-600 mb-1">From</label>
            <input
              type="date"
              disabled={range !== "CUSTOM"}
              className={cx(
                inputBase,
                range !== "CUSTOM" &&
                  "opacity-60 cursor-not-allowed bg-slate-100",
              )}
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div>
            <label className="block text-xs text-slate-600 mb-1">To</label>
            <input
              type="date"
              disabled={range !== "CUSTOM"}
              className={cx(
                inputBase,
                range !== "CUSTOM" &&
                  "opacity-60 cursor-not-allowed bg-slate-100",
              )}
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <div className="border-t border-slate-200">
          {loading ? (
            <div className="p-4 text-sm text-slate-500">Loading...</div>
          ) : items.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">
              No client report data found.
            </div>
          ) : (
            <div className="p-3">
              <div className="hidden lg:grid grid-cols-[1fr_0.8fr_0.8fr_0.9fr_0.8fr_0.9fr_0.7fr_1fr] gap-3 px-3 py-2 text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                <div>Client</div>
                <div>Total</div>
                <div>Micro</div>
                <div>Micro Water</div>
                <div>Sterility</div>
                <div>Chemistry</div>
                <div>COA</div>
                <div>Latest Report</div>
              </div>

              <div className="divide-y divide-slate-200">
                {items.map((r) => (
                  <div key={r.clientCode} className="py-3">
                    <div className="hidden lg:grid grid-cols-[1fr_0.8fr_0.8fr_0.9fr_0.8fr_0.9fr_0.7fr_1fr] gap-3 items-start px-3">
                      <div className="font-semibold text-slate-900">
                        {r.clientCode}
                      </div>
                      <div className="text-slate-900">{r.totalReports}</div>
                      <div className="text-slate-900">{r.microReports}</div>
                      <div className="text-slate-900">
                        {r.microWaterReports}
                      </div>
                      <div className="text-slate-900">{r.sterilityReports}</div>
                      <div className="text-slate-900">{r.chemistryReports}</div>
                      <div className="text-slate-900">{r.coaReports}</div>
                      <div className="text-slate-900">
                        {fmtDate(r.latestReportAt)}
                      </div>
                    </div>

                    <div className="lg:hidden rounded-xl border border-slate-200 bg-white p-4 space-y-2 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold text-slate-900">
                          {r.clientCode}
                        </div>
                        <div className="text-sm font-medium text-slate-700">
                          Total: {r.totalReports}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="text-slate-500">
                          Micro
                          <div className="text-slate-900 font-medium">
                            {r.microReports}
                          </div>
                        </div>
                        <div className="text-slate-500">
                          Micro Water
                          <div className="text-slate-900 font-medium">
                            {r.microWaterReports}
                          </div>
                        </div>
                        <div className="text-slate-500">
                          Sterility
                          <div className="text-slate-900 font-medium">
                            {r.sterilityReports}
                          </div>
                        </div>
                        <div className="text-slate-500">
                          Chemistry
                          <div className="text-slate-900 font-medium">
                            {r.chemistryReports}
                          </div>
                        </div>
                        <div className="text-slate-500">
                          COA
                          <div className="text-slate-900 font-medium">
                            {r.coaReports}
                          </div>
                        </div>
                        <div className="text-slate-500">
                          Latest Report
                          <div className="text-slate-900 font-medium">
                            {fmtDate(r.latestReportAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-3 pt-3 text-xs text-slate-600">
                This view is based on actual report records grouped by client
                code.
              </div>
              <div className="px-4 py-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-sm text-slate-600">
                  Page{" "}
                  <span className="font-semibold text-slate-900">{page}</span>{" "}
                  of{" "}
                  <span className="font-semibold text-slate-900">
                    {Math.max(1, Math.ceil(total / pageSize))}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    className={cx(inputBase, "w-auto cursor-pointer")}
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    {[5, 10, 20, 50].map((n) => (
                      <option key={n} value={n}>
                        {n} / page
                      </option>
                    ))}
                  </select>

                  <button
                    className={btn.outline}
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    type="button"
                  >
                    Prev
                  </button>

                  <button
                    className={btn.outline}
                    disabled={page >= Math.max(1, Math.ceil(total / pageSize))}
                    onClick={() =>
                      setPage((p) =>
                        Math.min(
                          Math.max(1, Math.ceil(total / pageSize)),
                          p + 1,
                        ),
                      )
                    }
                    type="button"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Manage Reports
        </h1>
        <p className="text-sm text-slate-600">
          View report counts and details by client and date range.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <div className={cx(statCardBase, statCardStyles.slate)}>
          <div className="text-xs font-medium text-slate-600">Clients</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {summary.clients}
          </div>
        </div>

        {summaryCard("Total Reports", summary.totalReports, "ALL", "indigo")}
        {summaryCard("Micro", summary.microReports, "MICRO_MIX", "sky")}
        {summaryCard(
          "Micro Water",
          summary.microWaterReports,
          "MICRO_MIX_WATER",
          "violet",
        )}
        {summaryCard(
          "Sterility",
          summary.sterilityReports,
          "STERILITY",
          "amber",
        )}
        {summaryCard(
          "Chemistry",
          summary.chemistryReports,
          "CHEMISTRY_MIX",
          "emerald",
        )}
        {summaryCard("COA", summary.coaReports, "COA", "rose")}
      </div>

      {selectedMetric && (
        <div className={cx(card, "overflow-hidden")}>
          <div className={cx(cardHeader, "flex items-center justify-between")}>
            <div className="font-semibold text-slate-900">
              {metricTitle(selectedMetric)}
            </div>

            <button
              type="button"
              className={btn.outline}
              onClick={() => {
                setSelectedMetric(null);
                setDetailItems([]);
              }}
            >
              Close
            </button>
          </div>

          <div className="border-t border-slate-200">
            {detailLoading ? (
              <div className="p-4 text-sm text-slate-500">Loading...</div>
            ) : detailItems.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">
                No reports found.
              </div>
            ) : (
              <div className="p-3">
                <div className="hidden lg:grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr] gap-3 px-3 py-2 text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                  <div>Client</div>
                  <div>Form Type</div>
                  <div>Form #</div>
                  <div>Report #</div>
                  <div>Status</div>
                  <div>Created</div>
                </div>

                <div className="divide-y divide-slate-200">
                  {detailItems.map((r) => (
                    <div key={`${r.formType}-${r.id}`} className="py-3">
                      <div className="hidden lg:grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr] gap-3 px-3">
                        <div className="font-semibold text-slate-900">
                          {r.clientCode ?? "—"}
                        </div>
                        <div className="text-slate-900">{r.formType}</div>
                        <div className="text-slate-900">{r.formNumber}</div>
                        <div className="text-slate-900">
                          {r.reportNumber ?? "—"}
                        </div>
                        <div className="text-slate-900">{r.status}</div>
                        <div className="text-slate-900">
                          {fmtDate(r.createdAt)}
                        </div>
                      </div>

                      <div className="lg:hidden rounded-xl border border-slate-200 bg-white p-4 space-y-2 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="font-semibold text-slate-900">
                            {r.clientCode ?? "—"}
                          </div>
                          <div className="text-xs text-slate-500">
                            {fmtDate(r.createdAt)}
                          </div>
                        </div>

                        <div className="text-sm text-slate-700">
                          Form Type:{" "}
                          <span className="font-medium">{r.formType}</span>
                        </div>
                        <div className="text-sm text-slate-700">
                          Form #:{" "}
                          <span className="font-medium">{r.formNumber}</span>
                        </div>
                        <div className="text-sm text-slate-700">
                          Report #:{" "}
                          <span className="font-medium">
                            {r.reportNumber ?? "—"}
                          </span>
                        </div>
                        <div className="text-sm text-slate-700">
                          Status:{" "}
                          <span className="font-medium">{r.status}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-sm text-slate-600">
                    Page{" "}
                    <span className="font-semibold text-slate-900">
                      {detailPage}
                    </span>{" "}
                    of{" "}
                    <span className="font-semibold text-slate-900">
                      {Math.max(1, Math.ceil(detailTotal / detailPageSize))}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      className={cx(inputBase, "w-auto cursor-pointer")}
                      value={detailPageSize}
                      onChange={(e) => {
                        const nextSize = Number(e.target.value);
                        setDetailPageSize(nextSize);
                        setDetailPage(1);
                        if (selectedMetric)
                          loadDetail(selectedMetric, 1, nextSize);
                      }}
                    >
                      {[5, 10, 20, 50].map((n) => (
                        <option key={n} value={n}>
                          {n} / page
                        </option>
                      ))}
                    </select>

                    <button
                      className={btn.outline}
                      disabled={detailPage <= 1}
                      onClick={() =>
                        selectedMetric &&
                        loadDetail(
                          selectedMetric,
                          detailPage - 1,
                          detailPageSize,
                        )
                      }
                      type="button"
                    >
                      Prev
                    </button>

                    <button
                      className={btn.outline}
                      disabled={
                        detailPage >=
                        Math.max(1, Math.ceil(detailTotal / detailPageSize))
                      }
                      onClick={() =>
                        selectedMetric &&
                        loadDetail(
                          selectedMetric,
                          detailPage + 1,
                          detailPageSize,
                        )
                      }
                      type="button"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
