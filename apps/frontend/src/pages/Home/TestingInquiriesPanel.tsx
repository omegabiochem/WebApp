import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";

type Inquiry = {
  id: string;
  reference: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  testingTypes: string[];
  productType: string | null;
  sampleCount: number | null;
  requirements: string;
  turnaround: string;
  consent: boolean;
  status: string;
  emailStatus: string;
  emailedAt: string | null;
  emailError: string | null;
  createdAt: string;
};
type PageResult = {
  items: Inquiry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: {
    NEW: number;
    CONTACTED: number;
    QUOTED: number;
    CONVERTED: number;
    CLOSED: number;
  };
};
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");
const label = (s: string) =>
  s
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (v) => v.toUpperCase());
const statuses = ["All", "NEW", "CONTACTED", "QUOTED", "CONVERTED", "CLOSED"];
const badge = (s: string) =>
  s === "NEW"
    ? "bg-blue-50 text-blue-700"
    : s === "CLOSED"
      ? "bg-slate-100 text-slate-700"
      : s === "CONVERTED" || s === "SENT"
        ? "bg-emerald-50 text-emerald-700"
        : s === "FAILED"
          ? "bg-rose-50 text-rose-700"
          : "bg-amber-50 text-amber-800";
export default function TestingInquiriesPanel() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PageResult | null>(null);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [statusDraft, setStatusDraft] = useState("NEW");
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(id);
  }, [query]);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
      });
      if (search) params.set("q", search);
      if (status !== "All") params.set("status", status);
      const result = await api<PageResult>(
        `/testing-inquiries?${params.toString()}`,
      );
      setData(result);
      setSelected(
        (old) => result.items.find((item) => item.id === old?.id) ?? null,
      );
    } catch (e: any) {
      setError(e?.message || "Unable to load testing inquiries.");
    } finally {
      setBusy(false);
    }
  }, [page, search, status, reload]);
  useEffect(() => {
    void load();
  }, [load]);
  const saveStatus = async () => {
    if (!selected || statusDraft === selected.status) return;
    setSavingStatus(true);
    setStatusError("");
    try {
      const updated = await api<Inquiry>(
        `/testing-inquiries/${selected.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: statusDraft }),
        },
      );
      setSelected(updated);
      setReload((x) => x + 1);
    } catch (e: any) {
      setStatusError(e?.message || "Unable to update inquiry status.");
    } finally {
      setSavingStatus(false);
    }
  };
  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Testing Inquiries
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            New client requests submitted through the public Request Testing
            form.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="Search testing inquiries"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reference, company, contact..."
            className="min-w-[240px] flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-[var(--brand)]"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => setReload((x) => x + 1)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {statuses.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${status === s ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-slate-200 bg-white text-slate-700"}`}
          >
            {label(s)}
            {s !== "All" && data?.counts
              ? ` (${data.counts[s as keyof typeof data.counts] ?? 0})`
              : ""}
          </button>
        ))}
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          {error}
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-12">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-8">
          <div className="border-b border-slate-200 p-4 text-sm font-semibold text-slate-800">
            {busy ? "Loading..." : `${data?.total ?? 0} inquiries`}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {[
                    "Reference",
                    "Company / Contact",
                    "Testing",
                    "Status",
                    "Email",
                    "Received",
                  ].map((x) => (
                    <th key={x} className="px-3 py-3">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.items ?? []).map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => {
                      setSelected(item);
                      setStatusDraft(item.status);
                      setStatusError("");
                    }}
                    className={`cursor-pointer hover:bg-slate-50 ${selected?.id === item.id ? "bg-blue-50" : ""}`}
                  >
                    <td className="px-3 py-3 font-semibold text-slate-800">
                      {item.reference}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold">{item.companyName}</div>
                      <div className="text-xs text-slate-500">
                        {item.contactName} · {item.email}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {item.testingTypes.join(", ")}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${badge(item.status)}`}
                      >
                        {label(item.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${badge(item.emailStatus)}`}
                      >
                        {label(item.emailStatus)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">
                      {fmt(item.createdAt)}
                    </td>
                  </tr>
                ))}
                {!busy && !data?.items.length && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-slate-500">
                      No testing inquiries found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 p-4 text-xs text-slate-500">
            <span>
              Page {data?.page ?? page} of {data?.totalPages ?? 1}
            </span>
            <div className="flex gap-2">
              <button
                disabled={busy || page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border px-3 py-2 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={busy || page >= (data?.totalPages ?? 1)}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border px-3 py-2 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </section>
        <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-4">
          <div className="border-b p-4 font-semibold">Inquiry Details</div>
          {selected ? (
            <div className="space-y-4 p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <strong className="break-all">{selected.reference}</strong>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-xs text-slate-500"
                >
                  Clear
                </button>
              </div>
              {(
                [
                  ["Company", selected.companyName],
                  ["Contact", selected.contactName],
                  ["Email", selected.email],
                  ["Phone", selected.phone],
                  ["Product / Sample", selected.productType],
                  ["Sample count", selected.sampleCount],
                  ["Testing types", selected.testingTypes.join(", ")],
                  ["Turnaround", label(selected.turnaround)],
                  ["Status", label(selected.status)],
                  ["Email delivery", label(selected.emailStatus)],
                  ["Email sent", fmt(selected.emailedAt)],
                  ["Created", fmt(selected.createdAt)],
                ] as Array<[string, unknown]>
              ).map(([k, v]) => (
                <div key={k}>
                  <div className="text-xs font-semibold text-slate-500">
                    {k}
                  </div>
                  <div className="mt-1 break-words text-slate-800">
                    {v == null || v === "" ? "—" : String(v)}
                  </div>
                </div>
              ))}
              <div>
                <div className="text-xs font-semibold text-slate-500">
                  Requirements
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 leading-6">
                  {selected.requirements}
                </p>
              </div>
              {selected.emailStatus === "FAILED" && selected.emailError && (
                <div className="break-words rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  Email error: {selected.emailError}
                </div>
              )}
              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                <h3 className="font-semibold text-slate-900">Manage Inquiry</h3>
                <label
                  htmlFor="inquiry-status"
                  className="mt-3 block text-xs font-semibold text-slate-600"
                >
                  Update Status
                </label>
                <div className="mt-2 flex gap-2">
                  <select
                    id="inquiry-status"
                    value={statusDraft}
                    onChange={(e) => setStatusDraft(e.target.value)}
                    disabled={savingStatus}
                    className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {statuses
                      .filter((s) => s !== "All")
                      .map((s) => (
                        <option key={s} value={s}>
                          {label(s)}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    disabled={savingStatus || statusDraft === selected.status}
                    onClick={() => void saveStatus()}
                    className="rounded-xl bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    {savingStatus ? "Saving..." : "Save Status"}
                  </button>
                </div>
                {statusError && (
                  <div role="alert" className="mt-2 text-xs text-rose-700">
                    {statusError}
                  </div>
                )}
              </div>
              <a
                href={`mailto:${selected.email}?subject=${encodeURIComponent(`Testing Inquiry ${selected.reference}`)}`}
                className="inline-flex rounded-xl bg-[var(--brand)] px-4 py-2.5 font-semibold text-white"
              >
                Email Contact
              </a>
            </div>
          ) : (
            <p className="p-8 text-center text-sm text-slate-500">
              Select an inquiry to view its details.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
