import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// Header-attached FORMS dropdown (borderless, text-only trigger: "Forms ▾")
// - No borders on trigger or menu; soft shadow + blur for uniqueness
// - Click item => navigate to /reports/:slug/new
// - Usage in header: <FormsDropdown align="right" />

// ---------------------------------
// Types & Data
// ---------------------------------

// put at the top of FormsDropdown.tsx (or import from a routes file)
const PATH_BY_ID: Record<FormId, string> = {
  // ⬇️ CHANGE these to your actual pages
  MICRO_MIX: "/reports/micro-mix/new",
  MICRO_MIX_WATER: "/reports/micro-mix-water/new",
  CHEMISTRY_MIX: "/reports/chemistry-mix/new",

};

type Category = "MICRO" | "CHEMISTRY";

type FormId =
  // MICRO (matches your Prisma.FormType values)
  "MICRO_MIX" | "MICRO_MIX_WATER" | "CHEMISTRY_MIX";
// CHEMISTRY (placeholder slugs for future chemistry forms)
// | "HPLC_ASSAY"
// | "GC_RESIDUALS"
// | "PH_CONDUCTIVITY"
// | "TOC";

type FormDef = {
  id: FormId;
  name: string;
  category: Category;
  emoji: string;
};

const FORMS: FormDef[] = [
  // ---- Micro ----
  { id: "MICRO_MIX", name: "Micro", category: "MICRO", emoji: "🧫" },
  {
    id: "MICRO_MIX_WATER",
    name: "Micro Water",
    category: "MICRO",
    emoji: "💧",
  },
  {
    id: "CHEMISTRY_MIX",
    name: "Chemistry Mix",
    category: "CHEMISTRY",
    emoji: "🧴",
  },
];


// ---------------------------------
// Component
// ---------------------------------

export default function FormsDropdown({
  align = "right",
}: {
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  // Close on outside click
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!menuRef.current || !btnRef.current) return;
      if (menuRef.current.contains(t) || btnRef.current.contains(t)) return;
      setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const micro = FORMS.filter((f) => f.category === "MICRO");
  const chem = FORMS.filter((f) => f.category === "CHEMISTRY");

  function go(f: FormDef) {
    setOpen(false);
    navigate(PATH_BY_ID[f.id]); // ⬅️ goes straight to your existing page
  }

  return (
    <div className="relative">
      {/* borderless, text-only trigger */}
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-0 py-1 text-sm font-semibold text-slate-700 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>Forms</span>
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
            // attached at header edge (no gap), *no border*, soft glass effect
            "absolute top-full z-50 p-2",
            "w-72 rounded-2xl shadow-xl backdrop-blur bg-white/90",
            align === "right" ? "right-0" : "left-0",
          ].join(" ")}
        >
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Microbiology
          </div>
          {micro.map((f) => (
            <button
              key={f.id}
              role="menuitem"
              onClick={() => go(f)}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-slate-800 hover:bg-slate-50/80"
            >
              <span className="text-lg">{f.emoji}</span>
              <span className="truncate">{f.name}</span>
            </button>
          ))}

          <div className="my-2 h-px bg-slate-100/60" />

          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Chemistry
          </div>
          {chem.map((f) => (
            <button
              key={f.id}
              role="menuitem"
              onClick={() => go(f)}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-slate-800 hover:bg-slate-50/80"
            >
              <span className="text-lg">{f.emoji}</span>
              <span className="truncate">{f.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
