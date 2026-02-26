import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";

type TemplateRow = {
  id: string;
  name: string;
  formType:
    | "MICRO_MIX"
    | "MICRO_MIX_WATER"
    | "STERILITY"
    | "CHEMISTRY_MIX"
    | "COA";
  version?: number;
  updatedAt?: string;
  createdAt?: string;
};

type CreateFromTemplateResponse =
  | { route: string }
  | { id: string; kind?: string; route?: string };

function fmtDate(x?: string) {
  if (!x) return "";
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

function emojiFor(formType: TemplateRow["formType"]) {
  switch (formType) {
    case "MICRO_MIX":
      return "🧫";
    case "MICRO_MIX_WATER":
      return "💧";
    case "STERILITY":
      return "🧪";
    case "CHEMISTRY_MIX":
      return "🧴";
    case "COA":
      return "📜";
    default:
      return "📄";
  }
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
    case "COA":
      return "Coa";
    default:
      return formType;
  }
}

function TemplateRowItem({
  t,
  onCreate,
  onEdit,
  onDelete,
  deleting,
}: {
  t: TemplateRow;
  onCreate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleting?: boolean;
}) {
  return (
    <div
      className="group flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-slate-800 hover:bg-slate-50/80"
      title="Create a new submission from this template"
    >
      {/* main click area */}
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={onCreate}
      >
        <span className="text-lg">{emojiFor(t.formType)}</span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">{t.name}</span>
            <span className="shrink-0 text-[10px] text-slate-500">
              {labelFor(t.formType)}
            </span>
          </div>

          {(t.updatedAt || t.createdAt) && (
            <div className="text-[11px] text-slate-500">
              Updated {fmtDate(t.updatedAt ?? t.createdAt)}
            </div>
          )}
        </div>
      </button>

      {/* edit/delete actions */}
      <div className="ml-2 flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="rounded-lg border px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-white"
          title="Edit template"
        >
          Edit
        </button>

        <button
          type="button"
          disabled={deleting}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className={[
            "rounded-lg border px-2 py-1 text-[11px] font-semibold",
            deleting
              ? "cursor-not-allowed opacity-60 text-rose-700"
              : "text-rose-700 hover:bg-rose-50",
          ].join(" ")}
          title="Delete template"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}

export default function TemplatesDropdown({
  align = "right",
}: {
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [showNewTemplateMenu, setShowNewTemplateMenu] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const navigate = useNavigate();

  const TEMPLATE_NEW_PATH_BY_FORM: Record<
    "MICRO_MIX" | "MICRO_MIX_WATER" | "STERILITY" | "CHEMISTRY_MIX" | "COA",
    string
  > = {
    MICRO_MIX: "/reports/micro-mix/new?mode=template",
    MICRO_MIX_WATER: "/reports/micro-mix-water/new?mode=template",
    STERILITY: "/reports/sterility/new?mode=template",
    CHEMISTRY_MIX: "/reports/chemistry-mix/new?mode=template",
    COA: "/reports/coa/new?mode=template",
  };

  // Close on outside click
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!menuRef.current || !btnRef.current) return;
      if (menuRef.current.contains(t) || btnRef.current.contains(t)) return;
      closeAll();
    }
    if (open) document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeAll();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function loadTemplates() {
    setLoading(true);
    setErr(null);
    try {
      // You can support query params if needed: `/templates?mine=1` etc.
      const data = await api<{ items: TemplateRow[] }>("/templates");
      setRows(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load templates");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function deleteTemplate(t: TemplateRow) {
    const ok = window.confirm(
      `Delete template "${t.name}"? This cannot be Restored.`,
    );
    if (!ok) return;

    setDeletingId(t.id);
    try {
      // If your backend requires expectedVersion for non-admin, send it:
      // (Adjust depending on your API contract)
      await api(`/templates/${t.id}`, {
        method: "DELETE",
        body: JSON.stringify({
          expectedVersion:
            typeof t.version === "number" ? t.version : undefined,
          reason: "Delete template",
        }),
      });

      // remove from UI
      setRows((prev) => prev.filter((x) => x.id !== t.id));
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete template");
    } finally {
      setDeletingId(null);
    }
  }

  // Lazy-load when opening
  useEffect(() => {
    if (open) loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const grouped = useMemo(() => {
    const micro = rows.filter((r) =>
      ["MICRO_MIX", "MICRO_MIX_WATER", "STERILITY"].includes(r.formType),
    );
    const chem = rows.filter((r) =>
      ["CHEMISTRY_MIX", "COA"].includes(r.formType),
    );
    return { micro, chem };
  }, [rows]);

  async function createFromTemplate(t: TemplateRow) {
    closeAll();

    try {
      const res = await api<CreateFromTemplateResponse>(
        `/templates/${t.id}/create-report`,
        { method: "POST" },
      );

      // 1) Prefer route if backend returns it
      const route = (res as any)?.route;
      if (route) {
        navigate(route);
        return;
      }

      // 2) Fallback: build route from returned id + clicked template formType
      const id = (res as any)?.id;
      if (!id) {
        navigate("/templatesPage");
        return;
      }

      if (t.formType === "CHEMISTRY_MIX") {
        navigate(`/chemistry-reports/chemistry-mix/${id}`);
        return;
      }

      if (t.formType === "COA") {
        navigate(`/chemistry-reports/coa/${id}`);
        return;
      }

      // Micro / Water / Sterility (your existing patterns)
      if (t.formType === "MICRO_MIX") {
        navigate(`/reports/micro-mix/${id}`);
        return;
      }
      if (t.formType === "MICRO_MIX_WATER") {
        navigate(`/reports/micro-mix-water/${id}`);
        return;
      }
      if (t.formType === "STERILITY") {
        navigate(`/reports/sterility/${id}`);
        return;
      }

      // last fallback
      navigate("/templatesPage");
    } catch (e: any) {
      alert(e?.message ?? "Failed to create submission from template");
    }
  }

  // function goAddTemplate() {
  //   setOpen(false);
  //   navigate("/templates/new");
  // }

  function goTemplatesPage() {
    closeAll();
    navigate("/templatesPage"); // if that exists
  }

  function closeAll() {
    setOpen(false);
    setShowNewTemplateMenu(false);
  }

  function templateEditPath(t: TemplateRow) {
    const base = TEMPLATE_NEW_PATH_BY_FORM[t.formType]; // already includes ?mode=template
    const glue = base.includes("?") ? "&" : "?";
    return `${base}${glue}templateId=${encodeURIComponent(t.id)}`;
  }

  return (
    <div className="relative">
      {/* trigger */}
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-0 py-1 text-sm font-semibold text-slate-700 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>Templates</span>
        <svg
          className={`h-4 w-4 transition-transform ${
            open ? "rotate-180" : "rotate-0"
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          className={[
            "absolute top-full z-50 p-2",
            "w-80 rounded-2xl shadow-xl backdrop-blur bg-white/90",
            align === "right" ? "right-0" : "left-0",
          ].join(" ")}
        >
          {/* top header row */}
          <div className="flex items-center justify-between px-2 pb-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Saved Templates
            </div>

            <button
              type="button"
              onClick={goTemplatesPage}
              className="text-[11px] font-semibold text-blue-700 hover:underline"
            >
              View all
            </button>
          </div>

          {loading ? (
            <div className="px-2 py-3 text-sm text-slate-600">Loading…</div>
          ) : err ? (
            <div className="px-2 py-3 text-sm text-red-700">{err}</div>
          ) : rows.length === 0 ? (
            <div className="px-2 py-3 text-sm text-slate-600">
              No templates yet.
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto pr-1">
              {/* Micro group */}
              {grouped.micro.length > 0 && (
                <>
                  <div className="mt-1 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Microbiology
                  </div>
                  {grouped.micro.map((t) => (
                    <TemplateRowItem
                      key={t.id}
                      t={t}
                      deleting={deletingId === t.id}
                      onCreate={() => createFromTemplate(t)}
                      onEdit={() => {
                        closeAll();
                        navigate(templateEditPath(t));
                      }}
                      onDelete={() => deleteTemplate(t)}
                    />
                  ))}
                </>
              )}

              {/* Chemistry group */}
              {grouped.chem.length > 0 && (
                <>
                  <div className="my-2 h-px bg-slate-100/60" />
                  <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Chemistry
                  </div>
                  {grouped.chem.map((t) => (
                    <TemplateRowItem
                      key={t.id}
                      t={t}
                      deleting={deletingId === t.id}
                      onCreate={() => createFromTemplate(t)}
                      onEdit={() => {
                        closeAll();
                        navigate(templateEditPath(t));
                      }}
                      onDelete={() => deleteTemplate(t)}
                    />
                  ))}
                </>
              )}
            </div>
          )}

          {/* bottom "Add Template" */}
          <div className="mt-2 h-px bg-slate-100/60" />

          <div className="relative">
            <button
              type="button"
              role="menuitem"
              onClick={() => setShowNewTemplateMenu((v) => !v)}
              className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-slate-900 hover:bg-slate-50/80"
            >
              <span className="flex items-center gap-2">
                <span className="text-lg">➕</span>
                <span className="font-semibold">New Template</span>
              </span>
              <span className="text-xs text-slate-500">Choose form ▸</span>
            </button>

            {showNewTemplateMenu && (
              <div className="mt-2 rounded-xl bg-white/95 shadow border border-slate-100 overflow-hidden">
                {[
                  { id: "MICRO_MIX", name: "Micro", emoji: "🧫" },
                  { id: "MICRO_MIX_WATER", name: "Micro Water", emoji: "💧" },
                  { id: "STERILITY", name: "Sterility", emoji: "🧪" },
                  { id: "CHEMISTRY_MIX", name: "Chemistry", emoji: "🧴" },
                  { id: "COA", name: "Coa", emoji: "📜" },
                ].map((f) => (
                  <button
                    key={f.id}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={() => {
                      closeAll();
                      navigate(
                        TEMPLATE_NEW_PATH_BY_FORM[
                          f.id as
                            | "MICRO_MIX"
                            | "MICRO_MIX_WATER"
                            | "STERILITY"
                            | "CHEMISTRY_MIX"
                            | "COA"
                        ],
                      );
                    }}
                  >
                    <span className="text-lg">{f.emoji}</span>
                    <span>{f.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
