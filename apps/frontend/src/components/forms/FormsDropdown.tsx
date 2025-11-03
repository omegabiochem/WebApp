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
  // MICRO_GENERAL: "/reports/micro-general/new",
  // MICRO_GENERAL_WATER: "/reports/micro-general-water/new",

  // // chemistry (fill when pages exist)
  // HPLC_ASSAY:           "/reports/hplc-assay/new",
  // GC_RESIDUALS:         "/reports/gc-residuals/new",
  // PH_CONDUCTIVITY:      "/reports/ph-conductivity/new",
  // TOC:                  "/reports/toc/new",
};

type Category = "MICRO" | "CHEMISTRY";

type FormId =
  // MICRO (matches your Prisma.FormType values)
  "MICRO_MIX" | "MICRO_MIX_WATER";
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
  { id: "MICRO_MIX", name: "Micro Mix", category: "MICRO", emoji: "🧫" },
  {
    id: "MICRO_MIX_WATER",
    name: "Micro Mix (Water)",
    category: "MICRO",
    emoji: "💧",
  },
  // {
  //   id: "MICRO_GENERAL",
  //   name: "Micro General",
  //   category: "MICRO",
  //   emoji: "🦠",
  // },
  // {
  //   id: "MICRO_GENERAL_WATER",
  //   name: "Micro General (Water)",
  //   category: "MICRO",
  //   emoji: "🚰",
  // },

  // ---- Chemistry (you can wire details later) ----
  // { id: "HPLC_ASSAY", name: "HPLC Assay", category: "CHEMISTRY", emoji: "🧪" },
  // {
  //   id: "GC_RESIDUALS",
  //   name: "GC Residual Solvents",
  //   category: "CHEMISTRY",
  //   emoji: "⚗️",
  // },
  // {
  //   id: "PH_CONDUCTIVITY",
  //   name: "pH & Conductivity",
  //   category: "CHEMISTRY",
  //   emoji: "📈",
  // },
  // {
  //   id: "TOC",
  //   name: "Total Organic Carbon",
  //   category: "CHEMISTRY",
  //   emoji: "🧴",
  // },
];

// prisma-ish enum → slug
// const toSlug = (id: FormId) => id.toLowerCase().replace(/_/g, "-");

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

// import React, { useEffect, useMemo, useState } from "react";
// import { useNavigate } from "react-router-dom";

// // POLISHED, PROFESSIONAL VANILLA REACT + TAILWIND VERSION
// // No external UI libraries. Clean blue/white lab aesthetic, subtle depth, and crisp spacing.
// // Drop <CreateMenuPro /> in your header. Only Tailwind + react-router-dom are required.

// // ---------------------------------
// // Types
// // ---------------------------------

// type Role =
//   | "CLIENT"
//   | "FRONTDESK"
//   | "MICRO"
//   | "CHEMISTRY"
//   | "QA"
//   | "ADMIN"
//   | "SYSTEMADMIN";

// type Category = "MICRO" | "CHEMISTRY";

// export type FormId =
//   | "MICRO_MIX"
//   | "STERILITY"
//   | "MICRO_LIMITS"
//   | "ENV_MONITORING"
//   | "HPLC_ASSAY"
//   | "GC_RESIDUALS"
//   | "PH_CONDUCTIVITY"
//   | "TOC";

// export type FormDef = {
//   id: FormId;
//   category: Category;
//   name: string;
//   short: string;
//   description: string;
//   emoji: string; // simple icon chip
//   badge?: string;
//   sopUrl?: string;
//   rolesAllowed: Role[];
//   tone?: "blue" | "teal" | "amber" | "rose" | "indigo" | "fuchsia" | "cyan" | "emerald";
// };

// // ---------------------------------
// // Brand tokens (edit to match your brand)
// // ---------------------------------

// const brand = {
//   primaryBtn:
//     "bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
//   secondaryBtn:
//     "bg-white text-slate-900 hover:bg-slate-50 border border-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
//   input:
//     "w-full rounded-xl border border-slate-200 px-10 py-2.5 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-blue-200",
//   card:
//     "group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md",
//   dialog:
//     "w-full max-w-5xl rounded-3xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur",
//   dim:
//     "fixed inset-0 bg-slate-900/50 backdrop-blur-sm",
//   tabWrap:
//     "inline-flex rounded-2xl bg-slate-100 p-1 text-sm",
//   tab:
//     "px-3 py-1.5 rounded-xl transition",
//   tabActive:
//     "bg-white shadow text-slate-900",
//   tabIdle:
//     "text-slate-600 hover:text-slate-900",
// };

// // Emoji chip palette
// type ChipTone = NonNullable<FormDef["tone"]>;
// const chip: Record<ChipTone, string> = {
//   blue: "from-blue-50 to-blue-100 ring-blue-200 text-blue-700",
//   indigo: "from-indigo-50 to-indigo-100 ring-indigo-200 text-indigo-700",
//   teal: "from-teal-50 to-teal-100 ring-teal-200 text-teal-700",
//   amber: "from-amber-50 to-amber-100 ring-amber-200 text-amber-700",
//   fuchsia: "from-fuchsia-50 to-fuchsia-100 ring-fuchsia-200 text-fuchsia-700",
//   cyan: "from-cyan-50 to-cyan-100 ring-cyan-200 text-cyan-700",
//   rose: "from-rose-50 to-rose-100 ring-rose-200 text-rose-700",
//   emerald: "from-emerald-50 to-emerald-100 ring-emerald-200 text-emerald-700",
// };

// // ---------------------------------
// // Registry — 8 forms (4 micro + 4 chemistry)
// // ---------------------------------

// export const FORM_REGISTRY: FormDef[] = [
//   {
//     id: "MICRO_MIX",
//     category: "MICRO",
//     name: "MicroMix Report",
//     short: "Microbiology | General",
//     description:
//       "Phase-aware validation for micro results, corrections workflow, and client sign-off.",
//     emoji: "🧫",
//     badge: "Preferred",
//     sopUrl: "/sop/micro/micromix",
//     rolesAllowed: ["MICRO", "QA", "ADMIN", "SYSTEMADMIN"],
//     tone: "blue",
//   },
//   {
//     id: "STERILITY",
//     category: "MICRO",
//     name: "Sterility Test",
//     short: "USP <71>",
//     description:
//       "Incubation logs, lot traceability, and contamination flags.",
//     emoji: "🛡️",
//     sopUrl: "/sop/micro/sterility",
//     rolesAllowed: ["MICRO", "QA", "ADMIN", "SYSTEMADMIN"],
//     tone: "emerald",
//   },
//   {
//     id: "MICRO_LIMITS",
//     category: "MICRO",
//     name: "Microbial Limits",
//     short: "TAMC/TYMC | USP <61>/<62>",
//     description:
//       "Acceptance tables, organism notes, and CFU calculations.",
//     emoji: "🦠",
//     sopUrl: "/sop/micro/microbial-limits",
//     rolesAllowed: ["MICRO", "QA", "ADMIN", "SYSTEMADMIN"],
//     tone: "amber",
//   },
//   {
//     id: "ENV_MONITORING",
//     category: "MICRO",
//     name: "Environmental Monitoring",
//     short: "Settle plates & swabs",
//     description:
//       "Room/zone trending with alert/action levels and deviation capture.",
//     emoji: "📡",
//     sopUrl: "/sop/micro/environmental-monitoring",
//     rolesAllowed: ["MICRO", "QA", "ADMIN", "SYSTEMADMIN"],
//     tone: "fuchsia",
//   },
//   {
//     id: "HPLC_ASSAY",
//     category: "CHEMISTRY",
//     name: "HPLC Assay",
//     short: "Quantitation | Chromatography",
//     description:
//       "Method, system suitability, and peak review with attachments.",
//     emoji: "🧪",
//     sopUrl: "/sop/chem/hplc-assay",
//     rolesAllowed: ["CHEMISTRY", "QA", "ADMIN", "SYSTEMADMIN"],
//     tone: "indigo",
//   },
//   {
//     id: "GC_RESIDUALS",
//     category: "CHEMISTRY",
//     name: "GC Residual Solvents",
//     short: "USP <467>",
//     description:
//       "Class 1–3 groups, limits, and batch calculations.",
//     emoji: "⚗️",
//     sopUrl: "/sop/chem/gc-residuals",
//     rolesAllowed: ["CHEMISTRY", "QA", "ADMIN", "SYSTEMADMIN"],
//     tone: "rose",
//   },
//   {
//     id: "PH_CONDUCTIVITY",
//     category: "CHEMISTRY",
//     name: "pH & Conductivity",
//     short: "Bench Chemistry",
//     description:
//       "Calibrations, temperature compensation, instrument linkage.",
//     emoji: "💧",
//     sopUrl: "/sop/chem/ph-conductivity",
//     rolesAllowed: ["CHEMISTRY", "QA", "ADMIN", "SYSTEMADMIN"],
//     tone: "cyan",
//   },
//   {
//     id: "TOC",
//     category: "CHEMISTRY",
//     name: "Total Organic Carbon",
//     short: "System Suitability",
//     description:
//       "Autosampler runs, blanks/standards sequences, % recovery checks.",
//     emoji: "🧴",
//     sopUrl: "/sop/chem/toc",
//     rolesAllowed: ["CHEMISTRY", "QA", "ADMIN", "SYSTEMADMIN"],
//     tone: "teal",
//   },
// ];

// // ---------------------------------
// // Helpers
// // ---------------------------------

// function cx(...xs: (string | false | null | undefined)[]) {
//   return xs.filter(Boolean).join(" ");
// }

// function Chip(props: { emoji: string; tone?: ChipTone }) {
//   const { emoji, tone = "blue" } = props;
//   const t = chip[tone];
//   return (
//     <div
//       className={cx(
//         "grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-b ring-1 ring-inset",
//         t
//       )}
//     >
//       <span className="text-lg leading-none">{emoji}</span>
//     </div>
//   );
// }

// function Badge({ children }: { children: React.ReactNode }) {
//   return (
//     <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
//       {children}
//     </span>
//   );
// }

// // Simulated auth role hook (replace with your real useAuth context)
// function useCurrentRole(): Role | null {
//   // const { user } = useAuth(); return user?.role as Role
//   return null; // unknown => do not lock UI; server still enforces
// }

// async function createDraftOnServer(formId: FormId): Promise<{ id: string } | null> {
//   try {
//     const res = await fetch(`/api/reports`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ type: formId }),
//       credentials: "include",
//     });
//     if (!res.ok) return null;
//     return await res.json();
//   } catch {
//     return null;
//   }
// }

// // ---------------------------------
// // Main Component
// // ---------------------------------

// export default function CreateMenuPro() {
//   const navigate = useNavigate();
//   const [pickerOpen, setPickerOpen] = useState(false);
//   const [menuOpen, setMenuOpen] = useState(false);
//   const [helpOpen, setHelpOpen] = useState(false);
//   const [query, setQuery] = useState("");
//   const [busy, setBusy] = useState(false);
//   const [tab, setTab] = useState<Category>("MICRO");
//   const role = useCurrentRole();

//   // Keyboard: Ctrl/Cmd + N opens picker
//   useEffect(() => {
//     function onKey(e: KeyboardEvent) {
//       const isMac = navigator.platform.toLowerCase().includes("mac");
//       if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "n") {
//         e.preventDefault();
//         setPickerOpen(true);
//       }
//       if (e.key === "/" && pickerOpen) {
//         const el = document.getElementById("form-search-input");
//         if (el) (el as HTMLInputElement).focus();
//       }
//     }
//     window.addEventListener("keydown", onKey);
//     return () => window.removeEventListener("keydown", onKey);
//   }, [pickerOpen]);

//   // Click-outside for menus
//   useEffect(() => {
//     function onClick(e: MouseEvent) {
//       const target = e.target as HTMLElement;
//       if (!target.closest("[data-split-menu]") && !target.closest("[data-split-trigger]")) {
//         setMenuOpen(false);
//       }
//       if (!target.closest("[data-help-popover]") && !target.closest("[data-help-trigger]")) {
//         setHelpOpen(false);
//       }
//     }
//     document.addEventListener("click", onClick);
//     return () => document.removeEventListener("click", onClick);
//   }, []);

//   const filtered = useMemo(() => {
//     const q = query.trim().toLowerCase();
//     return FORM_REGISTRY.filter((f) => {
//       if (tab && f.category !== tab) return false;
//       if (!q) return true;
//       return (
//         f.name.toLowerCase().includes(q) ||
//         f.short.toLowerCase().includes(q) ||
//         f.description.toLowerCase().includes(q)
//       );
//     });
//   }, [query, tab]);

//   async function start(form: FormDef) {
//     if (busy) return;
//     setBusy(true);
//     const allowed = role ? form.rolesAllowed.includes(role) : true; // server still enforces
//     if (!allowed) {
//       alert("You do not have permission to start this report. Please contact QA/Admin.");
//       setBusy(false);
//       return;
//     }
//     const draft = await createDraftOnServer(form.id);
//     setBusy(false);
//     if (draft?.id) {
//       setPickerOpen(false);
//       navigate(`/reports/${draft.id}/edit`);
//     } else {
//       navigate(`/reports/new/${form.id.toLowerCase()}`);
//     }
//   }

//   function quickStartDefault() {
//     const defaultForm = FORM_REGISTRY.find((f) => f.id === "MICRO_MIX") || FORM_REGISTRY[0];
//     start(defaultForm);
//   }

//   return (
//     <div className="relative flex items-center gap-2">
//       {/* Split Button */}
//       <div className="flex overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
//         <button
//           onClick={quickStartDefault}
//           className={cx("px-4 py-2 font-medium", brand.primaryBtn)}
//         >
//           <span className="inline-flex items-center gap-2">
//             <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
//             New Report
//           </span>
//         </button>
//         <button
//           data-split-trigger
//           onClick={() => setMenuOpen((v) => !v)}
//           className={cx("px-3 py-2", brand.secondaryBtn, "border-0 border-l")}
//           aria-label="Choose a form"
//         >
//           <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
//         </button>
//       </div>

//       {/* Help popover (shortcuts) */}
//       <div className="relative" data-help-popover>
//         <button
//           data-help-trigger
//           onClick={() => setHelpOpen((v) => !v)}
//           className="p-2 rounded-full border border-slate-200 bg-white hover:bg-slate-50"
//           aria-label="Keyboard help"
//         >
//           <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M6 8h12M6 12h6"/></svg>
//         </button>
//         {helpOpen && (
//           <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-lg">
//             <p className="font-medium mb-2">Shortcuts</p>
//             <ul className="space-y-1 text-slate-700">
//               <li><kbd className="px-1 py-0.5 rounded bg-slate-100">Ctrl</kbd> + <kbd className="px-1 py-0.5 rounded bg-slate-100">N</kbd> Open form picker</li>
//               <li><kbd className="px-1 py-0.5 rounded bg-slate-100">Tab</kbd> Switch Micro/Chem</li>
//               <li><kbd className="px-1 py-0.5 rounded bg-slate-100">/</kbd> Focus search</li>
//             </ul>
//           </div>
//         )}
//       </div>

//       {/* Split menu */}
//       {menuOpen && (
//         <div
//           data-split-menu
//           className="absolute z-20 mt-12 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
//           style={{ right: 0 }}
//         >
//           <div className="px-2 pb-1 text-xs font-semibold text-slate-500">Start a new…</div>
//           <button onClick={() => { setPickerOpen(true); setTab("MICRO"); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 hover:bg-slate-50">
//             <span className="text-lg">🧫</span> <span>Microbiology report</span>
//           </button>
//           <button onClick={() => { setPickerOpen(true); setTab("CHEMISTRY"); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 hover:bg-slate-50">
//             <span className="text-lg">🧪</span> <span>Chemistry report</span>
//           </button>
//           <div className="my-2 h-px bg-slate-100" />
//           <button onClick={() => navigate("/reports/templates")} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 hover:bg-slate-50">
//             <span className="text-lg">📁</span> <span>Browse templates…</span>
//           </button>
//         </div>
//       )}

//       {/* Picker Dialog */}
//       {pickerOpen && (
//         <div className="fixed inset-0 z-30">
//           <div className={brand.dim} onClick={() => setPickerOpen(false)} />
//           <div className="absolute inset-0 grid place-items-center p-4">
//             <div className={brand.dialog}>
//               {/* Header */}
//               <div className="border-b border-slate-200 p-5">
//                 <div className="text-lg font-semibold tracking-tight">Start a new report</div>
//                 <div className="text-sm text-slate-600">Choose a form to begin. Permissions are enforced by the server.</div>
//               </div>

//               {/* Search */}
//               <div className="p-5">
//                 <div className="relative">
//                   <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
//                   <input
//                     id="form-search-input"
//                     value={query}
//                     onChange={(e) => setQuery(e.target.value)}
//                     className={brand.input}
//                     placeholder="Search forms (e.g., Sterility, HPLC)…"
//                     aria-label="Search forms"
//                   />
//                 </div>
//               </div>

//               {/* Tabs */}
//               <div className="px-5">
//                 <div className={brand.tabWrap} role="tablist" aria-label="Form category">
//                   <button
//                     role="tab"
//                     aria-selected={tab === "MICRO"}
//                     onClick={() => setTab("MICRO")}
//                     className={cx(brand.tab, tab === "MICRO" ? brand.tabActive : brand.tabIdle)}
//                   >
//                     Microbiology
//                   </button>
//                   <button
//                     role="tab"
//                     aria-selected={tab === "CHEMISTRY"}
//                     onClick={() => setTab("CHEMISTRY")}
//                     className={cx(brand.tab, tab === "CHEMISTRY" ? brand.tabActive : brand.tabIdle)}
//                   >
//                     Chemistry
//                   </button>
//                 </div>
//               </div>

//               {/* Grid */}
//               <div className="p-5">
//                 <FormGrid
//                   items={filtered.filter((f) => f.category === tab)}
//                   onStart={start}
//                   role={role}
//                   busy={busy}
//                 />
//               </div>

//               {/* Footer */}
//               <div className="flex items-center justify-between gap-3 border-t border-slate-200 p-4">
//                 <div className="text-xs text-slate-500">Tip: Press <kbd className="rounded bg-slate-100 px-1">/</kbd> to search • <kbd className="rounded bg-slate-100 px-1">Tab</kbd> to switch tabs</div>
//                 <button onClick={() => setPickerOpen(false)} className="rounded-xl px-4 py-2 text-slate-700 hover:bg-slate-50">Close</button>
//               </div>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// function FormGrid({ items, onStart, role, busy }: { items: FormDef[]; onStart: (f: FormDef) => void; role: Role | null; busy: boolean }) {
//   if (!items.length) {
//     return <div className="py-10 text-center text-sm text-slate-500">No forms match your search.</div>;
//   }

//   return (
//     <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
//       {items.map((f) => {
//         const gated = role ? !f.rolesAllowed.includes(role) : false;
//         return (
//           <div key={f.id} className={brand.card}>
//             <div className="flex items-start gap-3 p-4">
//               <Chip emoji={f.emoji} tone={f.tone} />
//               <div className="min-w-0">
//                 <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
//                   <span className="truncate">{f.name}</span>
//                   {f.badge && <Badge>{f.badge}</Badge>}
//                   {gated && (
//                     <span title="Not in your role: request access" className="text-amber-600">
//                       <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 11V8a6 6 0 0112 0v3"/><rect x="4" y="11" width="16" height="9" rx="2"/></svg>
//                     </span>
//                   )}
//                 </div>
//                 <div className="truncate text-xs text-slate-600">{f.short}</div>
//               </div>
//             </div>
//             <div className="px-4 pb-3 text-sm leading-relaxed text-slate-700">{f.description}</div>
//             <div className="flex items-center justify-between border-t border-slate-200 p-3">
//               <div className="flex items-center gap-3 text-xs text-slate-500">
//                 {f.sopUrl ? (
//                   <a className="underline underline-offset-2" href={f.sopUrl}>SOP</a>
//                 ) : (
//                   <span className="text-slate-400">No SOP</span>
//                 )}
//                 <span className="select-none">•</span>
//                 <span>{f.category}</span>
//               </div>
//               <button
//                 disabled={busy || gated}
//                 onClick={() => onStart(f)}
//                 className={cx(
//                   "rounded-xl px-3 py-1.5 text-sm font-medium transition",
//                   gated
//                     ? "bg-slate-100 text-slate-400 cursor-not-allowed"
//                     : busy
//                     ? "bg-slate-200 text-slate-500"
//                     : "bg-blue-600 text-white hover:bg-blue-700"
//                 )}
//                 aria-disabled={busy || gated}
//               >
//                 Start
//               </button>
//             </div>
//           </div>
//         );
//       })}
//     </div>
//   );
// }
