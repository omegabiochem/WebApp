import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";

type TemplateRow = {
  id: string;
  name: string;
  formType: "MICRO_MIX" | "MICRO_MIX_WATER" | "STERILITY" | "CHEMISTRY_MIX";
  version?: number;
  updatedAt?: string;
  createdAt?: string;
};

type CreateFromTemplateResponse =
  | { route: string }
  | { id: string; kind?: string; route?: string };

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function fmtDate(x?: string) {
  if (!x) return "-";
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(d);
}

function labelFor(formType: TemplateRow["formType"]) {
  switch (formType) {
    case "MICRO_MIX":
      return "Micro";
    case "MICRO_MIX_WATER":
      return "Micro Water";
    case "STERILITY":
      return "Sterility";
    case "CHEMISTRY_MIX":
      return "Chemistry";
  }
}

// ---------- Routes ----------
const TEMPLATE_NEW_PATH_BY_FORM: Record<TemplateRow["formType"], string> = {
  MICRO_MIX: "/reports/micro-mix/new?mode=template",
  MICRO_MIX_WATER: "/reports/micro-mix-water/new?mode=template",
  STERILITY: "/reports/sterility/new?mode=template",
  CHEMISTRY_MIX: "/reports/chemistry-mix/new?mode=template",
};

const TEMPLATE_VIEW_PATH_BY_FORM: Record<TemplateRow["formType"], string> = {
  MICRO_MIX: "/reports/micro-mix/new?mode=templateView",
  MICRO_MIX_WATER: "/reports/micro-mix-water/new?mode=templateView",
  STERILITY: "/reports/sterility/new?mode=templateView",
  CHEMISTRY_MIX: "/reports/chemistry-mix/new?mode=templateView",
};

function templateViewPath(t: TemplateRow) {
  const base = TEMPLATE_VIEW_PATH_BY_FORM[t.formType];
  const glue = base.includes("?") ? "&" : "?";
  return `${base}${glue}templateId=${encodeURIComponent(t.id)}`;
}
function templateEditPath(t: TemplateRow) {
  const base = TEMPLATE_NEW_PATH_BY_FORM[t.formType];
  const glue = base.includes("?") ? "&" : "?";
  return `${base}${glue}templateId=${encodeURIComponent(t.id)}`;
}

type FormFilter = "ALL" | "MICRO" | "MICROWATER" | "STERILITY" | "CHEMISTRY";
type SortBy = "updatedAt" | "name";
type SortDir = "asc" | "desc";

export default function TemplatesPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // UI controls (dashboard-like)
  const [formFilter, setFormFilter] = useState<FormFilter>("ALL");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // actions
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  // dropdown
  const [newOpen, setNewOpen] = useState(false);

  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await api<{ items: TemplateRow[] }>("/templates");
      setRows(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load templates");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!newOpen) return;

    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-new-template]")) setNewOpen(false);
    };

    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [newOpen]);

  async function createFromTemplate(t: TemplateRow) {
    if (creatingId === t.id) return;
    setCreatingId(t.id);
    try {
      const res = await api<CreateFromTemplateResponse>(
        `/templates/${t.id}/create-report`,
        { method: "POST" },
      );

      const route = (res as any)?.route;
      if (route) return navigate(route);

      const id = (res as any)?.id;
      if (!id) return;

      if (t.formType === "CHEMISTRY_MIX")
        return navigate(`/chemistry-reports/chemistry-mix/${id}`);
      if (t.formType === "MICRO_MIX")
        return navigate(`/reports/micro-mix/${id}`);
      if (t.formType === "MICRO_MIX_WATER")
        return navigate(`/reports/micro-mix-water/${id}`);
      if (t.formType === "STERILITY")
        return navigate(`/reports/sterility/${id}`);
    } catch (e: any) {
      alert(e?.message ?? "Failed to create submission from template");
    } finally {
      setCreatingId(null);
    }
  }

  async function deleteTemplate(t: TemplateRow) {
    const ok = window.confirm(
      `Delete template "${t.name}"? This cannot be restored.`,
    );
    if (!ok) return;

    setDeletingId(t.id);
    try {
      await api(`/templates/${t.id}`, {
        method: "DELETE",
        body: JSON.stringify({
          expectedVersion:
            typeof t.version === "number" ? t.version : undefined,
          reason: "Delete template",
        }),
      });
      setRows((prev) => prev.filter((x) => x.id !== t.id));
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete template");
    } finally {
      setDeletingId(null);
    }
  }

  // processed (filter/search/sort)
  const processed = useMemo(() => {
    // 1) form filter
    const byForm =
      formFilter === "ALL"
        ? rows
        : rows.filter((t) => {
            if (formFilter === "MICRO") return t.formType === "MICRO_MIX";
            if (formFilter === "MICROWATER")
              return t.formType === "MICRO_MIX_WATER";
            if (formFilter === "STERILITY") return t.formType === "STERILITY";
            if (formFilter === "CHEMISTRY")
              return t.formType === "CHEMISTRY_MIX";
            return true;
          });

    // 2) search
    const s = search.trim().toLowerCase();
    const bySearch = s
      ? byForm.filter((t) =>
          `${t.name} ${t.formType}`.toLowerCase().includes(s),
        )
      : byForm;

    // 3) sort
    const sorted = [...bySearch].sort((a, b) => {
      if (sortBy === "name") {
        const aN = (a.name || "").toLowerCase();
        const bN = (b.name || "").toLowerCase();
        return sortDir === "asc" ? aN.localeCompare(bN) : bN.localeCompare(aN);
      }

      const aT = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
      const bT = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
      return sortDir === "asc" ? aT - bT : bT - aT;
    });

    return sorted;
  }, [rows, formFilter, search, sortBy, sortDir]);

  // pagination
  const total = processed.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageClamped = Math.min(page, totalPages);
  const start = (pageClamped - 1) * perPage;
  const end = start + perPage;
  const pageRows = processed.slice(start, end);

  useEffect(() => {
    setPage(1);
  }, [formFilter, search, perPage, sortBy, sortDir]);

  const hasActiveFilters = useMemo(() => {
    return (
      formFilter !== "ALL" ||
      search.trim() !== "" ||
      sortBy !== "updatedAt" ||
      sortDir !== "desc" ||
      perPage !== 10
    );
  }, [formFilter, search, sortBy, sortDir, perPage]);

  const clearAllFilters = () => {
    setFormFilter("ALL");
    setSearch("");
    setSortBy("updatedAt");
    setSortDir("desc");
    setPerPage(10);
    setPage(1);
  };

  // small spinner
  function Spinner({ dark = false }: { dark?: boolean }) {
    return (
      <span
        className={classNames(
          "inline-block h-4 w-4 animate-spin rounded-full border-2",
          dark
            ? "border-slate-300 border-t-slate-700"
            : "border-white/60 border-t-white",
        )}
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
          <p className="text-sm text-slate-500">
            Create submissions quickly using saved templates
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? <Spinner dark /> : "↻"}
            {loading ? "Loading..." : "Refresh"}
          </button>

          <div className="relative" data-new-template>
            <button
              type="button"
              onClick={() => setNewOpen((v) => !v)}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              New Template ▾
            </button>

            {newOpen && (
              <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border bg-white p-3 shadow-lg">
                <div className="mb-2 text-xs font-semibold text-slate-600">
                  Choose template type
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    Object.keys(TEMPLATE_NEW_PATH_BY_FORM) as Array<
                      TemplateRow["formType"]
                    >
                  ).map((k) => (
                    <button
                      key={k}
                      className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={() => {
                        setNewOpen(false);
                        navigate(TEMPLATE_NEW_PATH_BY_FORM[k]);
                      }}
                    >
                      {labelFor(k)}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                    onClick={() => setNewOpen(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Form type tabs */}
      <div className="mb-4 border-b border-slate-200">
        <nav className="-mb-px flex gap-6 text-sm">
          {(
            ["ALL", "MICRO", "MICROWATER", "STERILITY", "CHEMISTRY"] as const
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
                  ? "All templates"
                  : ft === "MICRO"
                    ? "Micro"
                    : ft === "MICROWATER"
                      ? "Micro Water"
                      : ft === "STERILITY"
                        ? "Sterility"
                        : "Chemistry"}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Controls Card */}
      <div className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
        {/* Sort chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {(
            [
              { key: "updatedAt", label: "Updated" },
              { key: "name", label: "Name" },
            ] as const
          ).map((s) => (
            <button
              key={s.key}
              onClick={() => setSortBy(s.key)}
              className={classNames(
                "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ring-1",
                sortBy === s.key
                  ? "bg-blue-600 text-white ring-blue-600"
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100 ring-slate-200",
              )}
              aria-pressed={sortBy === s.key}
            >
              Sort: {s.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ring-1 bg-white text-slate-700 hover:bg-slate-50 ring-slate-200"
            title="Toggle sort direction"
          >
            {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>
        </div>

        {/* Search + Rows */}
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="relative md:col-span-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates by name or type…"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
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

        {/* Clear row */}
        <div className="mt-3 flex items-center justify-end">
          <button
            type="button"
            onClick={clearAllFilters}
            disabled={!hasActiveFilters}
            className={classNames(
              "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition",
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
        {err && (
          <div className="border-b bg-rose-50 p-3 text-sm text-rose-700">
            {err}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="text-left text-slate-600">
                <th className="px-4 py-3 font-medium">Template</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading &&
                [...Array(8)].map((_, i) => (
                  <tr key={`skel-${i}`} className="border-t">
                    <td className="px-4 py-3">
                      <div className="h-4 w-56 animate-pulse rounded bg-slate-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
                    </td>
                  </tr>
                ))}

              {!loading &&
                pageRows.map((t) => (
                  <tr key={t.id} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-slate-500">
                        v{typeof t.version === "number" ? t.version : 0}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                        {labelFor(t.formType)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {fmtDate(t.updatedAt ?? t.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                          disabled={creatingId === t.id}
                          onClick={() => createFromTemplate(t)}
                        >
                          {creatingId === t.id ? <Spinner /> : null}
                          {creatingId === t.id
                            ? "Creating..."
                            : "Create submission"}
                        </button>

                        <button
                          className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                          onClick={() => navigate(templateViewPath(t))}
                        >
                          View
                        </button>

                        <button
                          className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
                          onClick={() => navigate(templateEditPath(t))}
                        >
                          Edit
                        </button>

                        <button
                          disabled={deletingId === t.id}
                          className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                          onClick={() => deleteTemplate(t)}
                        >
                          {deletingId === t.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

              {!loading && pageRows.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-12 text-center text-slate-500"
                  >
                    No templates found
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
    </div>
  );
}
