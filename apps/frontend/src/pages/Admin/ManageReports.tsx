import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
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

const card = "rounded-2xl border border-slate-200 bg-white shadow-sm";
const cardHeader =
  "px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-white via-slate-50 to-indigo-50";

const inputBase =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 " +
  "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300";

const statCardBase =
  "rounded-2xl border shadow-sm p-4 text-left transition hover:-translate-y-0.5";

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
    createdAt: string | null;
  };

  const [clientCode, setClientCode] = useState("ALL");
  const [clientCodes, setClientCodes] = useState<string[]>(["ALL"]);
  const [items, setItems] = useState<ClientReportSummaryRow[]>([]);

  const [selectedMetric, setSelectedMetric] = useState<MetricType | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailItems, setDetailItems] = useState<ReportListRow[]>([]);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(5000);
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(10);
  const [detailTotal, setDetailTotal] = useState(0);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [calendarItems, setCalendarItems] = useState<ReportListRow[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

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
    try {
      const res = await api<{
        items: ClientReportSummaryRow[];
        total: number;
        page: number;
        pageSize: number;
      }>(
        `/admin/reports/client-summary?clientCode=${encodeURIComponent(
          clientCode,
        )}&range=ALL&from=&to=&page=${page}&pageSize=${pageSize}`,
      );

      setItems(res.items);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load client report summary");
    }
  }

  function monthBounds(monthValue = calendarMonth) {
    const [year, month] = monthValue.split("-").map(Number);
    const first = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);

    const fromKey = first.toISOString().slice(0, 10);
    const toKey = last.toISOString().slice(0, 10);

    return { fromKey, toKey };
  }

  async function loadDetail(
    metric: MetricType,
    nextPage = 1,
    nextPageSize = detailPageSize,
    dayKey = selectedDay,
  ) {
    setSelectedMetric(metric);
    setDetailLoading(true);

    const effectiveFrom = dayKey ?? "";
    const effectiveTo = dayKey ?? "";

    try {
      const res = await api<{
        items: ReportListRow[];
        total: number;
        page: number;
        pageSize: number;
      }>(
        `/admin/reports/client-summary/details?clientCode=${encodeURIComponent(
          clientCode,
        )}&range=${encodeURIComponent(
          dayKey ? "CUSTOM" : "ALL",
        )}&from=${encodeURIComponent(effectiveFrom)}&to=${encodeURIComponent(
          effectiveTo,
        )}&metric=${encodeURIComponent(
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

  async function loadCalendarMonth(monthValue = calendarMonth) {
    setCalendarLoading(true);

    const { fromKey, toKey } = monthBounds(monthValue);

    try {
      const res = await api<{
        items: ReportListRow[];
        total: number;
        page: number;
        pageSize: number;
      }>(
        `/admin/reports/client-summary/details?clientCode=${encodeURIComponent(
          clientCode,
        )}&range=CUSTOM&from=${encodeURIComponent(
          fromKey,
        )}&to=${encodeURIComponent(toKey)}&metric=ALL&page=1&pageSize=5000`,
      );

      setCalendarItems(res.items);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load calendar reports");
    } finally {
      setCalendarLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => load(), 250);
    return () => clearTimeout(t);
  }, [clientCode, page, pageSize]);

  useEffect(() => {
    setSelectedMetric(null);
    setDetailItems([]);
    setSelectedDay(null);
    setPage(1);
    setDetailPage(1);
  }, [clientCode]);

  useEffect(() => {
    loadCalendarMonth(calendarMonth);
  }, [clientCode, calendarMonth]);

  const summary = useMemo(() => {
    return items.reduce(
      (acc, row) => {
        acc.totalReports += row.totalReports;
        acc.microReports += row.microReports;
        acc.microWaterReports += row.microWaterReports;
        acc.sterilityReports += row.sterilityReports;
        acc.chemistryReports += row.chemistryReports;
        acc.coaReports += row.coaReports;
        return acc;
      },
      {
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

  function toDateKey(x: string | null) {
    if (!x) return "";
    const d = new Date(x);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  }

  function changeMonth(delta: number) {
    const [y, m] = calendarMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const nextMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setCalendarMonth(nextMonth);
    setSelectedDay(null);
    setDetailItems([]);
    setSelectedMetric(null);
  }

  function countTone(count: number) {
    if (count >= 41) return "bg-emerald-50 border-emerald-300 text-emerald-900";
    if (count >= 21) return "bg-sky-100 border-sky-300 text-sky-900";
    if (count >= 11) return "bg-amber-100 border-amber-300 text-amber-900";
    if (count > 0) return "bg-rose-100 border-rose-300 text-rose-900";
    return "bg-white border-slate-200 text-slate-700";
  }

  const calendarDays = useMemo(() => {
    const [year, month] = calendarMonth.split("-").map(Number);
    const first = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);

    const counts = calendarItems.reduce<
      Record<string, { total: number; types: Record<string, number> }>
    >((acc, report) => {
      const key = toDateKey(report.createdAt);
      if (!key) return acc;

      if (!acc[key]) {
        acc[key] = { total: 0, types: {} };
      }

      acc[key].total += 1;
      acc[key].types[report.formType] =
        (acc[key].types[report.formType] ?? 0) + 1;

      return acc;
    }, {});

    const days = [];

    for (let i = 1; i <= last.getDate(); i++) {
      const d = new Date(year, month - 1, i);
      const key = d.toISOString().slice(0, 10);

      days.push({
        day: i,
        key,
        count: counts[key]?.total ?? 0,
        types: counts[key]?.types ?? {},
      });
    }

    const blanks = Array.from({ length: first.getDay() }, () => null);
    return [...blanks, ...days];
  }, [calendarMonth, calendarItems]);

  const calendarWeeks = useMemo(() => {
    const weeks = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      const week = calendarDays.slice(i, i + 7);
      while (week.length < 7) week.push(null);
      weeks.push({
        days: week,
        total: week.reduce((sum, d) => sum + (d?.count ?? 0), 0),
      });
    }
    return weeks;
  }, [calendarDays]);

  const monthTotalReports = useMemo(
    () => calendarItems.length,
    [calendarItems],
  );

  function reportTypeLabel(type: string) {
    switch (type) {
      case "MICRO_MIX":
        return "Micro";
      case "MICRO_MIX_WATER":
        return "Water";
      case "STERILITY":
        return "Sterility";
      case "CHEMISTRY_MIX":
        return "Chem";
      case "COA":
        return "COA";
      default:
        return type || "Other";
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50 p-4 sm:p-6 space-y-5 text-slate-900">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Manage Reports
        </h1>
        <p className="text-sm text-slate-600">
          View report counts and details by client and created date.
        </p>
      </div>

      <div className={cx(card, "overflow-hidden")}>
        <div
          className={cx(
            cardHeader,
            "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
          )}
        >
          <div>
            <div className="font-semibold text-slate-900">Clients</div>
            <div className="mt-1 text-xs text-slate-500">
              Click a client to filter the calendar and report counts.
            </div>
          </div>

          <button onClick={load} className={btn.outline} type="button">
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        <div className="p-4">
          {clientCodes.length <= 1 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              No clients found.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {clientCodes.map((code) => {
                const active = clientCode === code;

                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      setClientCode(code);
                      setItems([]);
                      setSelectedMetric(null);
                      setDetailItems([]);
                      setSelectedDay(null);
                      setPage(1);
                      setDetailPage(1);
                    }}
                    className={cx(
                      "rounded-full border px-3 py-2 text-xs font-semibold transition",
                      active
                        ? "border-indigo-400 bg-indigo-600 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700",
                    )}
                  >
                    {code === "ALL" ? "All Clients" : code}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
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

      <div className={cx(card, "overflow-hidden")}>
        <div
          className={cx(
            cardHeader,
            "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between",
          )}
        >
          <div>
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <CalendarDays size={18} />
              Monthly Calendar - Created At
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Month Total:{" "}
              <span className="font-semibold text-slate-900">
                {monthTotalReports}
              </span>{" "}
              report(s)
              {selectedDay && (
                <>
                  {" "}
                  • Selected Day:{" "}
                  <span className="font-semibold text-indigo-700">
                    {selectedDay}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={btn.outline}
              onClick={() => changeMonth(-1)}
            >
              <ChevronLeft size={16} />
            </button>

            <input
              type="month"
              className={cx(inputBase, "w-auto")}
              value={calendarMonth}
              onChange={(e) => {
                setCalendarMonth(e.target.value);
                setSelectedDay(null);
                setSelectedMetric(null);
                setDetailItems([]);
              }}
            />

            <button
              type="button"
              className={btn.outline}
              onClick={() => changeMonth(1)}
            >
              <ChevronRight size={16} />
            </button>

            {selectedDay && (
              <button
                type="button"
                className={btn.outline}
                onClick={() => {
                  setSelectedDay(null);
                  setSelectedMetric(null);
                  setDetailItems([]);
                }}
              >
                Clear Day
              </button>
            )}
          </div>
        </div>

        <div className="p-4">
          {calendarLoading ? (
            <div className="text-sm text-slate-500">Loading calendar...</div>
          ) : (
            <>
              <div className="grid grid-cols-8 gap-2 text-center text-xs font-semibold text-slate-500 mb-2">
                <div>Sun</div>
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div>Sat</div>
                <div>Week Total</div>
              </div>

              <div className="space-y-2">
                {calendarWeeks.map((week, weekIndex) => (
                  <div
                    key={`week-${weekIndex}`}
                    className={cx(
                      "grid grid-cols-8 gap-2 rounded-xl border p-2",
                      weekIndex % 4 === 0 && "bg-slate-50 border-slate-200",
                      weekIndex % 4 === 1 &&
                        "bg-indigo-50/50 border-indigo-100",
                      weekIndex % 4 === 2 && "bg-sky-50/50 border-sky-100",
                      weekIndex % 4 === 3 &&
                        "bg-emerald-50/50 border-emerald-100",
                    )}
                  >
                    {week.days.map((d, dayIndex) =>
                      d ? (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => {
                            setSelectedDay(d.key);
                            setPage(1);
                            setDetailPage(1);
                            loadDetail(
                              selectedMetric ?? "ALL",
                              1,
                              detailPageSize,
                              d.key,
                            );
                          }}
                          className={cx(
                        "rounded-lg border p-3 text-left min-h-[125px] transition hover:shadow-sm",
                            countTone(d.count),
                            selectedDay === d.key &&
                              "ring-2 ring-indigo-500 border-indigo-400",
                          )}
                        >
                          <div className="text-sm font-bold">{d.day}</div>
                          <div className="mt-2 text-xs font-semibold">
                            {d.count} report(s)
                          </div>

                          {d.count > 0 && (
                            <div className="mt-2 space-y-1">
                              {Object.entries(d.types).map(([type, count]) => (
                                <div
                                  key={type}
                                  className="flex items-center justify-between gap-2 rounded-md bg-white/70 px-2 py-1 text-[10px] font-medium"
                                >
                                  <span className="truncate">
                                    {reportTypeLabel(type)}
                                  </span>
                                  <span>{count}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </button>
                      ) : (
                        <div
                          key={`blank-${weekIndex}-${dayIndex}`}
               className="rounded-lg border border-dashed border-slate-200 bg-white/60 min-h-[125px]"
                        />
                      ),
                    )}

                    <div className="rounded-lg border border-slate-300 bg-white p-3 min-h-[78px] flex flex-col justify-center text-center">
                      <div className="text-xs text-slate-500">Week</div>
                      <div className="text-xl font-bold text-slate-900">
                        {week.total}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-1">
                  1-10 reports
                </span>
                <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-1">
                  11-20 reports
                </span>
                <span className="rounded-full border border-sky-300 bg-sky-100 px-2 py-1">
                  21-40 reports
                </span>
                <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-1">
                  40+ reports
                </span>
              </div>
            </>
          )}
        </div>
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
                  <div>Created At</div>
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
