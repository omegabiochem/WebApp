import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

type Ticket = {
  id: string;
  createdAt: string;
  category: string;
  status?: string | null;
  reportId?: string | null;
  reportType?: string | null;
  description: string;
  createdBy?: {
    id: string;
    name?: string | null;
    email: string;
    role: string;
  } | null;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function Chip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset",
        active
          ? "bg-slate-900 text-white ring-slate-900"
          : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
      )}
    >
      {children}
    </button>
  );
}

export default function SupportTicketsPage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [status, setStatus] = useState<string>("All");
  const [page, setPage] = useState(1);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<{
    items: Ticket[];
    total: number;
    totalPages: number;
  } | null>(null);

  const [selected, setSelected] = useState<Ticket | null>(null);

  const categories = useMemo(
    () => [
      "All",
      "LOGIN_ACCESS",
      "OTP_VERIFICATION",
      "REPORTS_WORKFLOW",
      "ATTACHMENTS_PRINTING",
      "PERFORMANCE",
      "BUG_ERROR",
      "OTHER",
    ],
    [],
  );

  const statuses = useMemo(
    () => ["All", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
    [],
  );

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (category !== "All") params.set("category", category);
      if (status !== "All") params.set("status", status);
      params.set("page", String(page));
      params.set("pageSize", "20");

      type TicketsResponse = {
        items: Ticket[];
        total: number;
        totalPages: number;
      };

      const res = await api<TicketsResponse>(
        `/support/tickets?${params.toString()}`,
      );
      setData(res);
      setData(res);
    } catch (e: any) {
      setErr(e?.message || "Failed to load tickets.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, category, status]);

  // search should reset to page 1
  useEffect(() => {
    const t = window.setTimeout(() => {
      setPage(1);
      load();
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Support Tickets
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Track login issues, workflow questions, and bug reports.
              </p>
            </div>

            <div className="w-full sm:w-[420px]">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search: ticket id, email, report id, keywords…"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-slate-400"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Chip
                  key={c}
                  active={category === c}
                  onClick={() => {
                    setCategory(c);
                    setPage(1);
                  }}
                >
                  {c === "All" ? "All Categories" : c.replaceAll("_", " ")}
                </Chip>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {statuses.map((s) => (
                <Chip
                  key={s}
                  active={status === s}
                  onClick={() => {
                    setStatus(s);
                    setPage(1);
                  }}
                >
                  {s === "All" ? "All Status" : s.replaceAll("_", " ")}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="text-sm font-medium text-slate-900">
                {busy ? "Loading…" : `Tickets (${data?.total ?? 0})`}
              </div>
              <button
                type="button"
                onClick={load}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                Refresh
              </button>
            </div>

            {err ? (
              <div className="p-4 text-sm text-rose-700">{err}</div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Ticket</th>
                    <th className="px-4 py-3 text-left font-medium">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">
                      Created By
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Report</th>
                    <th className="px-4 py-3 text-left font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.items ?? []).map((t) => (
                    <tr
                      key={t.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => setSelected(t)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{t.id}</div>
                        <div className="text-xs text-slate-500 line-clamp-1">
                          {t.description}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {t.category?.replaceAll("_", " ")}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {(t.status ?? "OPEN").replaceAll("_", " ")}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {t.createdBy ? (
                          <div>
                            <div className="font-medium">
                              {t.createdBy.name ?? "User"}
                            </div>
                            <div className="text-xs text-slate-500">
                              {t.createdBy.email}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-rose-600">
                            Missing createdBy
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {t.reportId ? (
                          <div>
                            <div className="font-medium">{t.reportId}</div>
                            {t.reportType ? (
                              <div className="text-xs text-slate-500">
                                {t.reportType}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {new Date(t.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {!busy && (data?.items?.length ?? 0) === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-slate-600" colSpan={6}>
                        No tickets found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
              <div>
                Page {page} of {data?.totalPages ?? 1}
              </div>
              <div className="flex gap-2">
                <button
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <button
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={page >= (data?.totalPages ?? 1)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: details drawer */}
        <aside className="lg:col-span-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Ticket Details
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Select a ticket to review.
                </div>
              </div>
              {selected ? (
                <button
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                  onClick={() => setSelected(null)}
                >
                  Clear
                </button>
              ) : null}
            </div>

            {selected ? (
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Ticket
                  </div>
                  <div className="font-medium text-slate-900">
                    {selected.id}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-medium text-slate-500">
                      Category
                    </div>
                    <div className="text-slate-900">
                      {selected.category?.replaceAll("_", " ")}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500">
                      Status
                    </div>
                    <div className="text-slate-900">
                      {(selected.status ?? "OPEN").replaceAll("_", " ")}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Created By
                  </div>
                  <div className="text-slate-900">
                    {selected.createdBy?.email ?? "—"}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Report
                  </div>
                  <div className="text-slate-900">
                    {selected.reportId ?? "—"}
                    {selected.reportType ? ` (${selected.reportType})` : ""}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Description
                  </div>
                  <div className="whitespace-pre-wrap text-slate-800">
                    {selected.description}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
