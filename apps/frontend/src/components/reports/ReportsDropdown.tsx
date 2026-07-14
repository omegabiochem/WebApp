import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

type ReportId =
  | "APE_VALIDATION_REPORT"
  | "APE_REPORT"
  | "SYSTEM_SUITABILITY_REPORT"
  | "ID_REPORT"
  | "ENVIRONMENTAL_REPORT";

const REPORT_PATH_BY_ID: Record<ReportId, string> = {
  APE_VALIDATION_REPORT: "/reports/ape-validation/new",
  APE_REPORT: "/reports/ape-report/new",
  SYSTEM_SUITABILITY_REPORT: "/reports/system-suitability/new",
  ID_REPORT: "/reports/id-report/new",
  ENVIRONMENTAL_REPORT: "/reports/environmental/new",
};

type ReportDef = {
  id: ReportId;
  name: string;
  emoji: string;
};

const REPORTS: ReportDef[] = [
  {
    id: "APE_VALIDATION_REPORT",
    name: "APE Validation Report",
    emoji: "✅",
  },
  {
    id: "APE_REPORT",
    name: "APE Report",
    emoji: "🦠",
  },
  {
    id: "SYSTEM_SUITABILITY_REPORT",
    name: "System Suitability Report",
    emoji: "⚙️",
  },
  {
    id: "ID_REPORT",
    name: "ID Report",
    emoji: "🆔",
  },
  {
    id: "ENVIRONMENTAL_REPORT",
    name: "Environmental Report",
    emoji: "🌿",
  },
];

export default function ReportDropdown({
  align = "right",
}: {
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function go(report: ReportDef) {
    setOpen(false);
    navigate(REPORT_PATH_BY_ID[report.id]);
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-0 py-1 text-sm font-semibold text-slate-700 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>Reports</span>
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
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Reports
          </div>

          {REPORTS.map((report) => (
            <button
              key={report.id}
              role="menuitem"
              onClick={() => go(report)}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-slate-800 hover:bg-slate-50/80"
            >
              <span className="text-lg">{report.emoji}</span>
              <span className="truncate">{report.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}