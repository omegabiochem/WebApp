import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useBlocker, useNavigate } from "react-router-dom";
import {
  useReportValidation,
  FieldErrorBadge,
  type ReportFormValues,
  deriveMicroPhaseFromStatus,
  type MicroPhase,
  MICRO_PHASE_FIELDS,
  getCorrections,
  createCorrections,
  type CorrectionItem,
  resolveCorrection,
} from "../../utils/reportValidation";
import {
  STATUS_TRANSITIONS,
  type ReportStatus,
  type Role,
} from "../../utils/microMixReportFormWorkflow";


// Hook for confirming navigation
function useConfirmOnLeave(isDirty: boolean) {
  const blocker = useBlocker(isDirty);

  useEffect(() => {
    if (blocker.state === "blocked") {
      if (window.confirm("⚠️ You have unsaved changes. Leave anyway?")) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    }
  }, [blocker]);
}

// ----- Roles (keep in sync with backend) -----
// type Role = "SYSTEMADMIN" | "ADMIN" | "FRONTDESK" | "MICRO" | "QA" | "CLIENT";

// ----- ReportStatus (mirror backend) -----
// export type ReportStatus =
//   | "DRAFT"
//   | "SUBMITTED_BY_CLIENT"
//   | "CLIENT_NEEDS_PRELIMINARY_CORRECTION"
//   | "CLIENT_NEEDS_FINAL_CORRECTION"
//   | "UNDER_CLIENT_PRELIMINARY_CORRECTION"
//   | "UNDER_CLIENT_FINAL_CORRECTION"
//   | "PRELIMINARY_RESUBMISSION_BY_CLIENT"
//   | "FINAL_RESUBMITTION_BY_CLIENT"
//   | "UNDER_CLIENT_PRELIMINARY_REVIEW"
//   | "UNDER_CLIENT_FINAL_REVIEW"
//   | "RECEIVED_BY_FRONTDESK"
//   | "FRONTDESK_ON_HOLD"
//   | "FRONTDESK_NEEDS_CORRECTION"
//   | "UNDER_PRELIMINARY_TESTING_REVIEW"
//   | "PRELIMINARY_TESTING_ON_HOLD"
//   | "PRELIMINARY_TESTING_NEEDS_CORRECTION"
//   | "PRELIMINARY_RESUBMITTION_BY_TESTING"
//   | "UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW"
//   | "FINAL_RESUBMITTION_BY_TESTING"
//   | "PRELIMINARY_APPROVED"
//   | "UNDER_FINAL_TESTING_REVIEW"
//   | "FINAL_TESTING_ON_HOLD"
//   | "FINAL_TESTING_NEEDS_CORRECTION"
//   | "FINAL_RESUBMITTION_BY_TESTING"
//   | "UNDER_FINAL_RESUBMISSION_TESTING_REVIEW"
//   | "UNDER_QA_REVIEW"
//   | "QA_NEEDS_CORRECTION"
//   | "UNDER_ADMIN_REVIEW"
//   | "ADMIN_NEEDS_CORRECTION"
//   | "ADMIN_REJECTED"
//   | "UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW"
//   | "FINAL_APPROVED"
//   | "LOCKED";

// ---- Map each transition to buttons ----

const statusButtons: Record<string, { label: string; color: string }> = {
  SUBMITTED_BY_CLIENT: { label: "Submit", color: "bg-green-600" },
  UNDER_CLIENT_PRELIMINARY_REVIEW: { label: "Approve", color: "bg-green-600" },
  UNDER_CLIENT_FINAL_REVIEW: { label: "Approve", color: "bg-green-600" },
  PRELIMINARY_APPROVED: { label: "Approve", color: "bg-green-600" },
  CLIENT_NEEDS_PRELIMINARY_CORRECTION: {
    label: "Needs Correction",
    color: "bg-yellow-600",
  },
  CLIENT_NEEDS_FINAL_CORRECTION: {
    label: "Needs Correction",
    color: "bg-yellow-600",
  },
  RECEIVED_BY_FRONTDESK: { label: "Approve", color: "bg-green-600" },
  FRONTDESK_ON_HOLD: { label: "Hold", color: "bg-red-500" },
  FRONTDESK_NEEDS_CORRECTION: {
    label: "Needs Correction",
    color: "bg-red-600",
  },
  UNDER_PRELIMINARY_TESTING_REVIEW: { label: "Approve", color: "bg-green-600" },
  PRELIMINARY_TESTING_ON_HOLD: { label: "Hold", color: "bg-red-500" },
  PRELIMINARY_TESTING_NEEDS_CORRECTION: {
    label: "Needs Correction",
    color: "bg-yellow-500",
  },
  PRELIMINARY_RESUBMISSION_BY_CLIENT: {
    label: "Resubmit",
    color: "bg-blue-600",
  },
  UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW: {
    label: "Approve",
    color: "bg-blue-600",
  },
  UNDER_FINAL_TESTING_REVIEW: { label: "Approve", color: "bg-green-600" },
  UNDER_FINAL_RESUBMISSION_TESTING_REVIEW: {
    label: "Approve",
    color: "bg-blue-600",
  },
  FINAL_TESTING_ON_HOLD: { label: "Hold", color: "bg-red-500" },
  FINAL_TESTING_NEEDS_CORRECTION: {
    label: "Needs Correction",
    color: "bg-yellow-600",
  },
  UNDER_QA_REVIEW: { label: "Approve", color: "bg-green-600" },
  QA_NEEDS_CORRECTION: { label: "Needs Correction", color: "bg-yellow-500" },
  UNDER_ADMIN_REVIEW: { label: "Approve", color: "bg-green-700" },
  ADMIN_NEEDS_CORRECTION: { label: "Needs Correction", color: "bg-yellow-600" },
  ADMIN_REJECTED: { label: "Reject", color: "bg-red-700" },
  FINAL_APPROVED: { label: "Approve", color: "bg-green-700" },
};

// A small helper to lock fields per role (frontend hint; backend is the source of truth)
function canEdit(role: Role | undefined, field: string, status?: ReportStatus) {
  if (!role || !status) return false;
  const transition = STATUS_TRANSITIONS[status]; // ✅ safe now
  if (!transition || !transition.canEdit?.includes(role)) {
    return false;
  }

  // --- PHASE GUARD ---
  const p = deriveMicroPhaseFromStatus(status);

  // Block FINAL fields during PRELIM for MICRO & ADMIN
  if ((role === "MICRO" || role === "ADMIN") && p === "PRELIM") {
    if (MICRO_PHASE_FIELDS.FINAL.includes(field)) return false;
  }

  // (Optional) Once in FINAL, freeze PRELIM fields too:
  if ((role === "MICRO" || role === "ADMIN") && p === "FINAL") {
    if (MICRO_PHASE_FIELDS.PRELIM.includes(field)) return false;
  }
  const map: Record<Role, string[]> = {
    SYSTEMADMIN: [],
    ADMIN: [
      "testSopNo",
      "dateTested",
      "preliminaryResults",
      "preliminaryResultsDate",
      "tbc_gram",
      "tbc_result",
      "tbc_spec",
      "tmy_gram",
      "tmy_result",
      "tmy_spec",
      "pathogens",
      "comments",
      "testedBy",
      "testedDate",
      "dateCompleted",
      "reviewedBy",
      "reviewedDate",
    ],
    FRONTDESK: [
      "client",
      "dateSent",
      "typeOfTest",
      "sampleType",
      "formulaNo",
      "description",
      "lotNo",
      "manufactureDate",
    ],
    MICRO: [
      "testSopNo",
      "dateTested",
      "preliminaryResults",
      "preliminaryResultsDate",
      // "tbc_dilution",
      "tbc_gram",
      "tbc_result",
      // "tmy_dilution",
      "tmy_gram",
      "tmy_result",
      "pathogens",
      "comments",
      "testedBy",
      "testedDate",
    ],
    QA: ["dateCompleted", "reviewedBy", "reviewedDate"],
    CLIENT: [
      "client",
      "dateSent",
      "typeOfTest",
      "sampleType",
      "formulaNo",
      "description",
      "lotNo",
      "manufactureDate",
      "tbc_spec",
      "tmy_spec",
      "pathogens",
    ], // read-only
  };
  if (!role) return false;
  // special rule: client can edit anything in DRAFT
  // if (role === "CLIENT" && status === "DRAFT") {
  //   return true;
  // }

  if (map[role]?.includes("*")) return true;
  return map[role]?.includes(field) ?? false;
}

// // Simple input wrapper that locks by role
// function Field({
//   label,
//   value,
//   onChange,
//   readOnly,
//   className = "",
//   inputClass = "",
//   placeholder = " ", // placeholder space keeps boxes visible when empty
// }: {
//   label: string;
//   value: string;
//   onChange: (v: string) => void;
//   readOnly?: boolean;
//   className?: string;
//   inputClass?: string;
//   placeholder?: string;
// }) {
//   return (
//     <div className={`flex gap-2 items-center ${className}`}>
//       <div className="w-48 shrink-0 text-[12px] font-medium">{label}</div>
//       <input
//         className={`flex-1 border border-black/70 px-2 py-1 text-[12px] leading-tight ${inputClass}`}
//         value={value}
//         onChange={(e) => onChange(e.target.value)}
//         readOnly={readOnly}
//         placeholder={placeholder}
//       />
//     </div>
//   );
// }

// Print styles: A4-ish, monochrome borders, hide controls when printing
const PrintStyles = () => (
  <style>{`
  @media print {
    @page { size: A4 portrait; margin: 14mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    .sheet { box-shadow: none !important; border: none !important; }
  }
`}</style>
);
const DashStyles = () => (
  <style>{`
    /* moving dashed outline that doesn't affect layout */
    .dash { position: relative; z-index: 0; }
    .dash::after{
      content:"";
      position:absolute;
      inset:-4px;                 /* sits just outside the box */
      border-radius:6px;          /* tweak to taste */
      pointer-events:none;
      z-index:10;

      /* four dashed sides (top, bottom, left, right) */
      background:
        linear-gradient(90deg, var(--dash-color) 0 8px, transparent 8px 16px) 0    0    /16px 2px repeat-x,
        linear-gradient(90deg, var(--dash-color) 0 8px, transparent 8px 16px) 0    100% /16px 2px repeat-x,
        linear-gradient(0deg,  var(--dash-color) 0 8px, transparent 8px 16px) 0    0    /2px  16px repeat-y,
        linear-gradient(0deg,  var(--dash-color) 0 8px, transparent 8px 16px) 100% 0    /2px  16px repeat-y;

      opacity:0;                  /* off by default */
      animation: dash-move 1.05s linear infinite;
    }
    .dash-red::after   { --dash-color:#dc2626; opacity:1; } /* red = correction */
    .dash-green::after { --dash-color:#16a34a; opacity:1; } /* green = resolved */

    @keyframes dash-move {
      to {
        background-position:
          16px 0,     /* top marches right  */
          -16px 100%, /* bottom marches left */
          0 16px,     /* left marches down   */
          100% -16px; /* right marches up    */
      }
    }
    @media (prefers-reduced-motion: reduce) { .dash::after { animation:none; } }
    @media print { .dash::after { display:none; } }
  `}</style>
);

const HIDE_SAVE_FOR = new Set<ReportStatus>(["FINAL_APPROVED", "LOCKED"]);

export default function MicroMixReportForm({
  report,
  onClose,
}: {
  report?: any;
  onClose?: () => void;
}) {
  const { user } = useAuth();
  const role = user?.role as Role | undefined;

  const navigate = useNavigate();

  // const initialData = JSON.stringify(report || {});
  const [isDirty, setIsDirty] = useState(false);

  const [status, setStatus] = useState(report?.status || "DRAFT");
  // inside MicroMixReportForm
  const [reportId, setReportId] = useState(report?.id || null);

  const [reportNumber, setReportNumber] = useState<string>(
    report?.reportNumber || ""
  );

  // //To set clientCode automatically when creating a new report
  // const initialClientValue = report?.client || (role === "CLIENT" ? user?.clientCode || "" : "");

  // ---- local state (prefill from report if editing) ----
  // const [client, setClient] = useState(initialClientValue);
  const [client, setClient] = useState(
    report?.client ??
      (!report?.id && role === "CLIENT" ? user?.clientCode ?? "" : "")
  );
  const [dateSent, setDateSent] = useState(report?.dateSent || "");
  const [typeOfTest, setTypeOfTest] = useState(report?.typeOfTest || "");
  const [sampleType, setSampleType] = useState(report?.sampleType || "");
  const [formulaNo, setFormulaNo] = useState(report?.formulaNo || "");
  const [description, setDescription] = useState(report?.description || "");
  const [lotNo, setLotNo] = useState(report?.lotNo || "");
  const [manufactureDate, setManufactureDate] = useState(
    report?.manufactureDate || ""
  );
  const [testSopNo, setTestSopNo] = useState(report?.testSopNo || "");
  const [dateTested, setDateTested] = useState(report?.dateTested || "");
  const [preliminaryResults, setPreliminaryResults] = useState(
    report?.preliminaryResults || ""
  );
  const [preliminaryResultsDate, setPreliminaryResultsDate] = useState(
    report?.preliminaryResultsDate || ""
  );
  const [dateCompleted, setDateCompleted] = useState(
    report?.dateCompleted || ""
  );

  // TBC/TFC blocks
  //   const [tbc_dilution, set_tbc_dilution] = useState("x 10^1");
  const [tbc_gram, set_tbc_gram] = useState(report?.tbc_gram || "");
  const [tbc_result, set_tbc_result] = useState(report?.tbc_result || "");
  const [tbc_spec, set_tbc_spec] = useState(report?.tbc_spec || "");

  //   const [tmy_dilution, set_tmy_dilution] = useState("x 10^1"); // Total Mold & Yeast
  const [tmy_gram, set_tmy_gram] = useState(report?.tmy_gram || "");
  const [tmy_result, set_tmy_result] = useState(report?.tmy_result || "");
  const [tmy_spec, set_tmy_spec] = useState(report?.tmy_spec || "");

  type PathogenSpec = "Absent" | "Present" | "";

  // Pathogens (Absent/Present + sample grams)
  type PathRow = {
    checked: boolean;
    key: string;
    label: string;
    // grams: string;
    result: "Absent" | "Present" | "";
    spec: PathogenSpec;
  };
  const pathogenDefaults: PathRow[] = useMemo(
    () => [
      {
        checked: false,
        key: "E_COLI",
        label: "E.coli",
        //grams: "11g",
        result: "",
        spec: "",
      },
      {
        checked: false,
        key: "P_AER",
        label: "P.aeruginosa",
        //grams: "11g",
        result: "",
        spec: "",
      },
      {
        checked: false,
        key: "S_AUR",
        label: "S.aureus",
        //grams: "11g",
        result: "",
        spec: "",
      },
      {
        checked: false,
        key: "SALM",
        label: "Salmonella",
        //grams: "11g",
        result: "",
        spec: "",
      },
      {
        checked: false,
        key: "CLOSTRIDIA",
        label: "Clostridia species",
        grams: "3g",
        result: "",
        spec: "",
      },
      {
        checked: false,
        key: "C_ALB",
        label: "C.albicans",
        ////grams: "11g",
        result: "",
        spec: "",
      },
      {
        checked: false,
        key: "B_CEP",
        label: "B.cepacia",
        //grams: "11g",
        result: "",
        spec: "",
      },
      {
        checked: false,
        key: "OTHER",
        label: "Other",
        grams: "",
        result: "",
        spec: "",
      },
    ],
    []
  );

  // const [pathogens, setPathogens] = useState<PathRow[]>(pathogenDefaults);
  const [pathogens, setPathogens] = useState<PathRow[]>(
    report?.pathogens || pathogenDefaults
  );

  // --- Row-level errors for pathogens ---
  type PathogenRowError = { result?: string; spec?: string };
  const [pathogenRowErrors, setPathogenRowErrors] = useState<
    PathogenRowError[]
  >([]);

  const [pathogensTableError, setPathogensTableError] = useState<string | null>(
    null
  );

  // function organismDisabled() {
  //   // Only CLIENT decides which organisms to test
  //   return role !== "CLIENT";
  // }

  // function resultDisabled(p: PathRow) {
  //   // Only MICRO can set results, and only if the organism is checked
  //   return !p.checked || (role !== "MICRO" && role !== "ADMIN" && phase !== "FINAL");
  // }
  const phase = deriveMicroPhaseFromStatus(status);

  // --- E-Sign modal state (Admin-only) ---
  // Admin E-sign modal state
  const [showESign, setShowESign] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<ReportStatus | null>(null);
  const [changeReason, setChangeReason] = useState("");
  const [eSignPassword, setESignPassword] = useState("");

  // ⬇️ Fetch existing corrections when a report id is present (new or existing)
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!reportId || !token) return;
    getCorrections(reportId, token)
      .then((list) => setCorrections(list)) // explicit lambda avoids any inference weirdness
      .catch(() => {});
  }, [reportId]);

  const [corrections, setCorrections] = useState<CorrectionItem[]>([]);
  const openCorrections = useMemo(
    () => corrections.filter((c) => c.status === "OPEN"),
    [corrections]
  );
  const corrByField = useMemo(() => {
    const m: Record<string, CorrectionItem[]> = {};
    for (const c of openCorrections) (m[c.fieldKey] ||= []).push(c);
    return m;
  }, [openCorrections]);

  const hasCorrection = (field: string) => !!corrByField[field];
  const correctionText = (field: string) =>
    corrByField[field]?.map((c) => `• ${c.message}`).join("\n");

  const [selectingCorrections, setSelectingCorrections] = useState(false);
  const [pendingCorrections, setPendingCorrections] = useState<
    { fieldKey: string; message: string }[]
  >([]);
  const [addForField, setAddForField] = useState<string | null>(null);
  const [addMessage, setAddMessage] = useState("");

  // function requestStatusChange(target: ReportStatus) {
  //   const isNeeds =
  //     target === "FRONTDESK_NEEDS_CORRECTION" ||
  //     target === "PRELIMINARY_TESTING_NEEDS_CORRECTION" ||
  //     target === "FINAL_TESTING_NEEDS_CORRECTION" ||
  //     target === "QA_NEEDS_CORRECTION" ||
  //     target === "ADMIN_NEEDS_CORRECTION" ||
  //     target === "CLIENT_NEEDS_PRELIMINARY_CORRECTION" ||
  //     target === "CLIENT_NEEDS_FINAL_CORRECTION";

  //   if (isNeeds) {
  //     setSelectingCorrections(true);
  //     setPendingCorrections([]);
  //     setPendingStatus(target);
  //     return;
  //   }
  //   // existing path (incl. e-sign if required)
  //   if (uiNeedsESign(target)) {
  //     setPendingStatus(target);
  //     setShowESign(true);
  //   } else {
  //     handleStatusChange(target);
  //   }
  // }

  // UI policy: only when server will enforce
  const uiNeedsESign = (s: string) =>
    (role === "ADMIN" || role === "SYSTEMADMIN" || role === "FRONTDESK") &&
    (s === "UNDER_CLIENT_FINAL_REVIEW" || s === "LOCKED");

  // trigger from buttons; Admin must provide e-sign first
  // function requestStatusChange(target: ReportStatus) {
  //   if (uiNeedsESign(target)) {
  //     setPendingStatus(target);
  //     setChangeReason("");
  //     setESignPassword("");
  //     setShowESign(true);
  //   } else {
  //     handleStatusChange(target); // fall through to your existing flow
  //   }
  // }

  function requestStatusChange(target: ReportStatus) {
    const isNeeds =
      target === "FRONTDESK_NEEDS_CORRECTION" ||
      target === "PRELIMINARY_TESTING_NEEDS_CORRECTION" ||
      target === "FINAL_TESTING_NEEDS_CORRECTION" ||
      target === "QA_NEEDS_CORRECTION" ||
      target === "ADMIN_NEEDS_CORRECTION" ||
      target === "CLIENT_NEEDS_PRELIMINARY_CORRECTION" ||
      target === "CLIENT_NEEDS_FINAL_CORRECTION";

    if (isNeeds) {
      setSelectingCorrections(true);
      setPendingCorrections([]);
      setPendingStatus(target);
      return;
    }
    // existing path (incl. e-sign if required)
    if (uiNeedsESign(target)) {
      setPendingStatus(target);
      setShowESign(true);
    } else {
      handleStatusChange(target);
    }
  }

  function resultDisabled(p: PathRow) {
    if (!p.checked) return true;

    if (role === "MICRO") {
      // MICRO can edit only in FINAL phase
      return phase !== "FINAL";
    }

    if (role === "ADMIN") {
      // ADMIN can always edit
      return false;
    }

    // everyone else disabled
    return true;
  }

  // ---- Who can resolve (mirror backend) ----
  // const CAN_RESOLVE: Role[] = ["ADMIN"];
  // show resolve only if role can resolve AND can edit THIS field in THIS status
  // const canResolveField = (field: string) =>
  //   !!reportId && !!role && canEdit(role, field, status as ReportStatus);

  const canResolveField = (field: string) => {
    if (!reportId || !role) return false;
    const base = field.split(":")[0]; // "pathogens" for "pathogens:E_COLI"
    return canEdit(role, base, status as ReportStatus);
  };

  // Resolve ALL corrections for a field
  async function resolveField(fieldKey: string) {
    if (!reportId) return;
    const token = localStorage.getItem("token")!;
    const items = openCorrections.filter((c) => c.fieldKey === fieldKey);
    if (!items.length) return;

    await Promise.all(
      items.map((c) => resolveCorrection(reportId!, c.id, token, "Fixed"))
    );
    const fresh = await getCorrections(reportId!, token);
    setCorrections(fresh);
    flashResolved(fieldKey); // ✅ show green halo briefly
  }

  // Resolve a single correction
  async function resolveOne(c: CorrectionItem) {
    if (!reportId) return;
    const token = localStorage.getItem("token")!;
    await resolveCorrection(reportId!, c.id, token, "Fixed");
    const fresh = await getCorrections(reportId!, token);
    setCorrections(fresh);
    flashResolved(c.fieldKey); // ✅ show green halo briefly
  }

  // Tiny inline pill next to a field label/badge
  // function ResolvePill({ field }: { field: string }) {
  //   if (!canResolveField || !hasCorrection(field)) return null;
  //   return (
  //     <button
  //       className="ml-1 inline-flex items-center rounded-full bg-emerald-600 px-2 py-[2px] text-[10px] font-medium text-white hover:bg-emerald-700"
  //       title="Resolve all notes for this field"
  //       onClick={() => resolveField(field)}
  //     >
  //       ✓
  //     </button>
  //   );
  // }

  // Tiny inline pill next to a field label/badge
  function ResolveOverlay({ field }: { field: string }) {
    if (!hasCorrection(field) || !canResolveField(field)) return null;
    return (
      <button
        type="button"
        title="Resolve all notes for this field"
        onClick={() => resolveField(field)}
        className="
        absolute -top-2 -right-2 z-20
        h-5 w-5 rounded-full grid place-items-center
        bg-emerald-600 text-white shadow
        hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400
      "
      >
        ✓
      </button>
    );
  }

  const [showCorrTray, setShowCorrTray] = useState(false);

  // fields to briefly show as "resolved" (green halo)
  // near other state
  const [flash, setFlash] = useState<Record<string, boolean>>({});
  function flashResolved(field: string) {
    setFlash((m) => ({ ...m, [field]: true }));
    setTimeout(() => setFlash((m) => ({ ...m, [field]: false })), 1600);
  }

  // and update your dashClass to include the flash:
  const dashClass = (keyOrPrefix: string) =>
    hasOpenCorrection(keyOrPrefix)
      ? "dash dash-red"
      : flash[keyOrPrefix]
      ? "dash dash-green"
      : "";
  // const dashClass = (field: string) =>
  //   hasOpenCorrection(field)
  //     ? "dash dash-red"
  //     : flash[field]
  //     ? "dash dash-green"
  //     : "";

  // replace your validatePathogenRows with this:
  function validatePathogenRows(
    rows: PathRow[],
    who: Role | undefined = role,
    phase: MicroPhase | undefined = deriveMicroPhaseFromStatus(status)
  ) {
    const rowErrs: PathogenRowError[] = rows.map(() => ({}));
    let tableErr: string | null = null;

    if (who === "CLIENT") {
      if (!rows.some((r) => r.checked)) {
        tableErr = "Select at least one organism.";
      }
      rows.forEach((r, i) => {
        if (r.checked && r.spec !== "Absent" && r.spec !== "Present") {
          rowErrs[i].spec = "Choose Absent or Present";
        }
      });
    }

    if (who === "MICRO" || who === "ADMIN") {
      if (phase === "FINAL") {
        rows.forEach((r, i) => {
          if (r.checked && !r.result)
            rowErrs[i].result = "Select Absent or Present";
        });
      }
    }

    setPathogenRowErrors(rowErrs);
    setPathogensTableError(tableErr);
    return !tableErr && rowErrs.every((e) => !e.result && !e.spec);
  }

  function setPathogenChecked(idx: number, checked: boolean) {
    setPathogens((prev) => {
      const copy = [...prev];
      copy[idx] = { ...prev[idx], checked, ...(checked ? {} : { result: "" }) };
      validatePathogenRows(copy, role);
      return copy;
    });
    // Clear the row error if we unchecked (no result required anymore)
    setPathogenRowErrors((prev) => {
      const c = [...prev];
      c[idx] = {};
      return c;
    });
    markDirty();
  }

  function setPathogenResult(idx: number, value: "Absent" | "Present") {
    setPathogens((prev) => {
      const row = prev[idx];
      if (!row.checked) return prev; // ignore if organism not selected
      const copy = [...prev];
      copy[idx] = { ...row, result: value };
      validatePathogenRows(copy, role);
      return copy;
    });
    // Clear the row error once result is set
    setPathogenRowErrors((prev) => {
      const copy = [...prev];
      copy[idx] = {};
      return copy;
    });
    clearError("pathogens"); // optional if you still keep a table-level error elsewhere
    markDirty();
  }

  function clearPathogenResult(idx: number) {
    setPathogens((prev) => {
      const copy = [...prev];
      copy[idx] = { ...prev[idx], result: "" };
      validatePathogenRows(copy, role);
      return copy;
    });
    // Keep/restore the row error because a checked row without result is invalid
    setPathogenRowErrors((prev) => {
      const copy = [...prev];
      // if the row is still checked, show the error again
      copy[idx] = pathogens[idx]?.checked
        ? { result: "Select Absent or Present" }
        : {};
      return copy;
    });
    markDirty();
  }

  function setPathogenSpec(idx: number, value: PathogenSpec) {
    setPathogens((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], spec: value };
      return copy;
    });
    markDirty();
  }

  const [comments, setComments] = useState(report?.comments || "");
  const [testedBy, setTestedBy] = useState(report?.testedBy || "");
  const [reviewedBy, setReviewedBy] = useState(report?.reviewedBy || "");
  const [testedDate, setTestedDate] = useState(report?.testedDate || "");
  const [reviewedDate, setReviewedDate] = useState(report?.reviewedDate || "");

  // const lock = (f: string) => !canEdit(role, f);
  // use:
  const lock = (f: string) => !canEdit(role, f, status as ReportStatus);

  const { errors, clearError, validateAndSetErrors } = useReportValidation(
    role,
    {
      status: status as ReportStatus, // status-driven PRELIM vs FINAL validation
    }
  );

  // Current values snapshot (use inside handlers)
  const makeValues = (): ReportFormValues => ({
    client,
    dateSent,
    typeOfTest,
    sampleType,
    formulaNo,
    description,
    lotNo,
    manufactureDate,
    testSopNo,
    dateTested,
    preliminaryResults,
    preliminaryResultsDate,
    tbc_gram,
    tbc_result,
    tbc_spec,
    tmy_gram,
    tmy_result,
    tmy_spec,
    comments,
    testedBy,
    testedDate,
    dateCompleted,
    reviewedBy,
    reviewedDate,
    pathogens,
  });

  // ----------- Save handler -----------

  const handleSave = async (): Promise<boolean> => {
    const values = makeValues();

    validateAndSetErrors(values);
    validatePathogenRows(values.pathogens, role);

    const token = localStorage.getItem("token");
    const API_BASE = "http://localhost:3000";

    const ALLOWED_FIELDS: Record<Role, string[]> = {
      ADMIN: ["*"],
      SYSTEMADMIN: [],
      FRONTDESK: [
        "client",
        "dateSent",
        "typeOfTest",
        "sampleType",
        "formulaNo",
        "description",
        "lotNo",
        "manufactureDate",
      ],
      MICRO: [
        "testSopNo",
        "tbc_dilution",
        "tbc_gram",
        "tbc_result",
        "tmy_dilution",
        "tmy_gram",
        "tmy_result",
        "pathogens",
        "dateTested",
        "preliminaryResults",
        "preliminaryResultsDate",
        "testedBy",
        "testedDate",
        "comments",
      ],
      QA: ["dateCompleted", "reviewedBy", "reviewedDate"],
      CLIENT: [
        "client",
        "dateSent",
        "typeOfTest",
        "sampleType",
        "formulaNo",
        "description",
        "lotNo",
        "manufactureDate",
        "tbc_spec",
        "tmy_spec",
        "pathogens",
      ],
    };

    // Build full payload
    const fullPayload: any = {
      client,
      dateSent,
      typeOfTest,
      sampleType,
      formulaNo,
      description,
      lotNo,
      manufactureDate,
      testSopNo,
      dateTested,
      preliminaryResults,
      preliminaryResultsDate,
      dateCompleted,
      tbc_gram,
      tbc_result,
      tbc_spec,
      tmy_gram,
      tmy_result,
      tmy_spec,
      pathogens,
      comments,
      testedBy,
      reviewedBy,
      testedDate,
      reviewedDate,
    };

    // added to control overwrite of fields based on phase
    // MicroPhase-based field guard
    // During PRELIM, MICRO & ADMIN cannot write FINAL-only fields
    // (Optional) Once in FINAL, MICRO & ADMIN cannot write PRELIM-only fields either

    const PHASE_WRITE_GUARD = (fields: string[]) => {
      if (role === "MICRO" || role === "ADMIN") {
        if (phase === "PRELIM") {
          // drop FINAL-only fields during PRELIM
          return fields.filter((f) => !MICRO_PHASE_FIELDS.FINAL.includes(f));
        }
        // (Optional) once in FINAL, drop PRELIM-only fields:
        if (phase === "FINAL") {
          return fields.filter((f) => !MICRO_PHASE_FIELDS.PRELIM.includes(f));
        }
      }
      return fields;
    };

    const BASE_ALLOWED: Record<Role, string[]> = {
      ADMIN: ["*"],
      SYSTEMADMIN: [],
      FRONTDESK: [
        "client",
        "dateSent",
        "typeOfTest",
        "sampleType",
        "formulaNo",
        "description",
        "lotNo",
        "manufactureDate",
      ],
      MICRO: [
        "testSopNo",
        "tbc_dilution",
        "tbc_gram",
        "tbc_result",
        "tmy_dilution",
        "tmy_gram",
        "tmy_result",
        "pathogens",
        "dateTested",
        "preliminaryResults",
        "preliminaryResultsDate",
        "testedBy",
        "testedDate",
        "comments",
      ],
      QA: ["dateCompleted", "reviewedBy", "reviewedDate"],
      CLIENT: [
        "client",
        "dateSent",
        "typeOfTest",
        "sampleType",
        "formulaNo",
        "description",
        "lotNo",
        "manufactureDate",
        "tbc_spec",
        "tmy_spec",
        "pathogens",
      ],
    };

    const allowedBase = BASE_ALLOWED[role || "CLIENT"] || [];
    const allowed = allowedBase.includes("*")
      ? Object.keys(fullPayload)
      : PHASE_WRITE_GUARD(allowedBase);

    const payload = Object.fromEntries(
      Object.entries(fullPayload).filter(([k]) => allowed.includes(k))
    );
    // // Filter fields based on role
    // const allowed = ALLOWED_FIELDS[role || "CLIENT"] || [];
    // const payload = allowed.includes("*")
    //   ? fullPayload
    //   : Object.fromEntries(
    //       Object.entries(fullPayload).filter(([k]) => allowed.includes(k))
    //     );

    // New reports always start as DRAFT
    if (!reportId) {
      payload.status = "DRAFT";
    }

    try {
      let res;

      if (reportId) {
        console.log("Updating report", reportId);
        // update
        res = await fetch(`${API_BASE}/reports/micro-mix/${reportId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ...payload, reason: "Saving" }),
        });
        console.log(res);
      } else {
        // create
        res = await fetch(`${API_BASE}/reports/micro-mix`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) throw new Error("Failed to save draft");
      const saved = await res.json();
      setIsDirty(false);

      setReportId(saved.id); // 👈 keep the new id
      setStatus(saved.status); // in case backend changed it
      setReportNumber(saved.reportNumber || "");
      alert("✅ Report saved as '" + saved.status + "'");
      return true;
    } catch (err: any) {
      console.error(err);
      alert("❌ Error saving draft: " + err.message);
      return false;
    }
  };

  async function handleStatusChange(
    newStatus: ReportStatus,
    opts?: { reason?: string; eSignPassword?: string }
  ) {
    const token = localStorage.getItem("token");
    const API_BASE = "http://localhost:3000";

    const values = makeValues();
    const okFields = validateAndSetErrors(values);
    const okRows = validatePathogenRows(values.pathogens, role);

    if (
      newStatus === "SUBMITTED_BY_CLIENT" ||
      newStatus === "RECEIVED_BY_FRONTDESK" ||
      newStatus === "UNDER_PRELIMINARY_TESTING_REVIEW" ||
      newStatus === "UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW" ||
      newStatus === "UNDER_CLIENT_PRELIMINARY_REVIEW" ||
      newStatus === "PRELIMINARY_RESUBMISSION_BY_CLIENT" ||
      newStatus === "UNDER_FINAL_TESTING_REVIEW" ||
      newStatus === "UNDER_QA_REVIEW" ||
      newStatus === "UNDER_ADMIN_REVIEW" ||
      newStatus === "UNDER_CLIENT_FINAL_REVIEW" ||
      newStatus === "UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW" ||
      newStatus === "FINAL_RESUBMISSION_BY_CLIENT" ||
      newStatus === "PRELIMINARY_APPROVED" ||
      newStatus === "FINAL_TESTING_ON_HOLD" ||
      newStatus === "FINAL_TESTING_NEEDS_CORRECTION" ||
      newStatus === "UNDER_FINAL_RESUBMISSION_TESTING_REVIEW" ||
      newStatus === "QA_NEEDS_CORRECTION" ||
      newStatus === "ADMIN_NEEDS_CORRECTION" ||
      newStatus === "ADMIN_REJECTED" ||
      newStatus === "CLIENT_NEEDS_PRELIMINARY_CORRECTION" ||
      newStatus === "CLIENT_NEEDS_FINAL_CORRECTION" ||
      newStatus === "FINAL_RESUBMISSION_BY_TESTING" ||
      newStatus === "PRELIMINARY_TESTING_ON_HOLD" ||
      newStatus === "PRELIMINARY_TESTING_NEEDS_CORRECTION" ||
      newStatus === "FRONTDESK_ON_HOLD" ||
      newStatus === "FRONTDESK_NEEDS_CORRECTION" ||
      newStatus === "UNDER_CLIENT_FINAL_CORRECTION" ||
      newStatus === "LOCKED" ||
      newStatus === "FINAL_APPROVED"
    ) {
      if (!okFields) {
        alert("⚠️ Please fix the highlighted fields before changing status.");
        return;
      }
      if (!okRows) {
        alert("⚠️ Please fix the highlighted rows before changing status.");
        return;
      }
    }

    // ensure latest edits are saved
    if (!reportId || isDirty) {
      const saved = await handleSave();
      if (!saved) return;
    }

    try {
      const res = await fetch(
        `${API_BASE}/reports/micro-mix/${reportId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          // Server expects: status (always), reason (required for critical fields incl. status),
          // and eSignPassword when moving to UNDER_CLIENT_FINAL_REVIEW or LOCKED.
          body: JSON.stringify({
            status: newStatus,
            reason: opts?.reason ?? "Changing Status",
            eSignPassword: opts?.eSignPassword ?? undefined,
          }),
        }
      );

      if (!res.ok) throw new Error(`Status update failed: ${res.statusText}`);
      const updated: { status?: ReportStatus; reportNumber?: string } =
        await res.json();

      setStatus(updated.status ?? newStatus);
      setReportNumber(updated.reportNumber || reportNumber);
      alert(`✅ Status changed to ${newStatus}`);
    } catch (err: any) {
      console.error(err);
      alert("❌ Error changing status: " + err.message);
    }
  }

  function markDirty() {
    if (!isDirty) setIsDirty(true);
  }

  function formatDateForInput(value: string | null) {
    if (!value) return "";
    // Convert ISO to yyyy-MM-dd
    return new Date(value).toISOString().split("T")[0];
  }

  // Block tab close / refresh
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Block in-app navigation
  useConfirmOnLeave(isDirty);

  // // For in-app navigation (react-router)
  // useBeforeUnload(isDirty, (event) => {
  //   event.preventDefault();
  // });

  const handleClose = () => {
    // Your useBlocker(isDirty) hook will intercept this navigation if there are unsaved changes.
    if (onClose) onClose();
    else navigate(-1);
  };

  // any open correction = red
  // const hasOpenCorrection = (field: string) => !!corrByField[field];
  const hasOpenCorrection = (keyOrPrefix: string) =>
    openCorrections.some(
      (c) =>
        c.fieldKey === keyOrPrefix || c.fieldKey.startsWith(`${keyOrPrefix}:`)
    );
  // let Admin/Micro resolve even if the key is nested under "pathogens:*"
  return (
    <>
      <div className="sheet mx-auto max-w-[800px] bg-white text-black border border-black shadow print:shadow-none p-4">
        <PrintStyles />
        <DashStyles />

        {/* Header + print controls */}
        <div className="no-print mb-4 flex justify-end gap-2">
          <button
            className="px-3 py-1 rounded-md border bg-gray-600 text-white"
            onClick={handleClose}
          >
            Close
          </button>
          {/* <button
            className="px-3 py-1 rounded-md border"
            onClick={() => window.print()}
            disabled={role === "SYSTEMADMIN"}
          >
            Print
          </button> */}
          {!HIDE_SAVE_FOR.has(status as ReportStatus) && (
            <button
              className="px-3 py-1 rounded-md border bg-blue-600 text-white"
              onClick={handleSave}
              disabled={role === "SYSTEMADMIN"}
            >
              {reportId ? "Update Report" : "Save Report"}
            </button>
          )}

          {/* <button
            className="px-3 py-1 rounded-md border bg-blue-600 text-white"
            onClick={handleSave}
            disabled={role === "SYSTEMADMIN"}
          >
            {reportId ? "Update Report" : "Save Report"}
          </button> */}
        </div>

        {/* Letterhead */}
        <div className="mb-2 text-center">
          <div
            className="font-bold tracking-wide text-[22px]"
            style={{ color: "blue" }}
          >
            OMEGA BIOLOGICAL LABORATORY, INC.
          </div>
          <div className="text-[16px]" style={{ color: "blue" }}>
            (FDA REG.)
          </div>
          <div className="text-[12px]">
            56 PARK AVENUE, LYNDHURST, NJ 07071 <br></br>
            Tel: (201) 883 1222 • Fax: (201) 883 0449
          </div>
          <div>
            <div className="text-[12px]">
              Email: <span style={{ color: "blue" }}>lab@omegabiochem.com</span>
            </div>
            {/* <div className="font-medium">Report No: {report.fullNumber}</div> */}
          </div>
          {/* <div
            className="text-[18px] font-bold mt-1"
            style={{ textDecoration: "underline" }}
          >
            Report
          </div> */}
          {/* Report title + number */}
          <div className="mt-1 grid grid-cols-3 items-center">
            <div /> {/* left spacer */}
            <div className="text-[18px] font-bold text-center underline">
              Report
            </div>
            <div className="text-right text-[12px] font-bold font-medium">
              {reportNumber ? <> {reportNumber}</> : null}
            </div>
          </div>
        </div>

        {/* Top meta block */}
        <div className="w-full border border-black text-[15px]">
          {/* CLIENT / DATE SENT */}
          <div className="grid grid-cols-[67%_33%] border-b border-black text-[12px] leading-snug">
            <div className="px-2 border-r border-black flex items-center gap-1">
              <div className="whitespace-nowrap font-medium">CLIENT:</div>
              {lock("client") ? (
                <div className="flex-1  min-h-[14px]">{client}</div>
              ) : (
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  value={client}
                  onChange={(e) => {
                    setClient(e.target.value);
                    markDirty();
                  }}
                  disabled={role === "CLIENT"}
                />
              )}
            </div>
            {/* <div id="f-dateSent" className="px-2 flex items-center gap-1">
              <div className="whitespace-nowrap font-medium">DATE SENT:</div>
               <FieldError name="dateSent"  errors={errors}/>
              {lock("dateSent") || role === "CLIENT" ? (
                <div className="flex-1 min-h-[14px]">{formatDateForInput(dateSent)}</div>
              ) : (
                <input
                  className="flex-1 input-editable py-[2px] text-[12px] leading-snug"
                  type="date"
                  value={formatDateForInput(dateSent)}
                  onChange={(e) => {
                    setDateSent(e.target.value);
                    markDirty();
                  }}
                />
              )}
            </div> */}

            <div
              id="f-dateSent"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("dateSent");
                setAddMessage("");
              }}
              className={`px-2 flex items-center gap-1 relative ${dashClass(
                "dateSent"
              )}`}
            >
              {/* <ResolveOverlay field="dateSent" /> */}
              <div className="whitespace-nowrap font-medium">DATE SENT:</div>
              <FieldErrorBadge name="dateSent" errors={errors} />
              <ResolveOverlay field="dateSent" />

              {/* tiny floating badge; does not affect layout */}
              {/* <FieldErrorBadge name="dateSent" errors={errors} />
              <CorrectionBadge title={correctionText("dateSent") || ""} />
              <ResolvePill field="dateSent" /> */}

              {lock("dateSent") ? (
                <div className="flex-1 min-h-[14px]">
                  {formatDateForInput(dateSent)}
                </div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${
                    errors.dateSent
                      ? "border-red-500 ring-1 ring-red-500"
                      : "border-black/70"
                  }        ${
                    hasCorrection("dateSent")
                      ? "ring-2 ring-rose-500 animate-pulse"
                      : ""
                  }`}
                  type="date"
                  value={formatDateForInput(dateSent)}
                  onChange={(e) => {
                    setDateSent(e.target.value);
                    clearError("dateSent");
                    markDirty();
                  }}
                  aria-invalid={!!errors.dateSent}
                />
              )}
              {/* <FieldErrorBadge name="dateSent" errors={errors} />
              <CorrectionBadge title={correctionText("dateSent") || ""} />
              // <ResolvePill field="dateSent" /> */}
              {/* <ResolvePill field="dateSent" /> */}
            </div>

            {/* absolutely positioned; doesn't affect layout */}
            {/* <div className="overlay-actions">
              <FieldErrorBadge name="dateSent" errors={errors} />
              <CorrectionBadge title={correctionText("dateSent") || ""} />
              <ResolvePill field="dateSent" />
            </div> */}
          </div>

          {/* TYPE OF TEST / SAMPLE TYPE / FORMULA # */}
          <div className="grid grid-cols-[33%_33%_34%] border-b border-black text-[12px] leading-snug">
            <div
              id="f-typeOfTest"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("typeOfTest");
                setAddMessage("");
              }}
              className={`px-2 border-r border-black flex items-center gap-1 relative ${dashClass(
                "typeOfTest"
              )}`}
            >
              <div className="font-medium whitespace-nowrap">TYPE OF TEST:</div>
              {/* tiny floating badge; does not affect layout */}
              <FieldErrorBadge name="typeOfTest" errors={errors} />
              <ResolveOverlay field="typeOfTest" />
              {lock("typeOfTest") ? (
                <div className="flex-1  min-h-[14px]">{typeOfTest}</div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${
                    errors.typeOfTest
                      ? "border-red-500 ring-1 ring-red-500"
                      : "border-black/70"
                  }${
                    hasCorrection("typeOfTest")
                      ? "ring-2 ring-rose-500 animate-pulse"
                      : ""
                  } `}
                  value={typeOfTest}
                  onChange={(e) => {
                    setTypeOfTest(e.target.value);
                    clearError("typeOfTest");
                    markDirty();
                  }}
                  aria-invalid={!!errors.typeOfTest}
                />
              )}
            </div>
            <div
              id="f-sampleType"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("sampleType");
                setAddMessage("");
              }}
              className={`px-2 border-r border-black flex items-center gap-1 relative ${dashClass(
                "sampleType"
              )}`}
            >
              <div className="font-medium whitespace-nowrap">SAMPLE TYPE:</div>
              <FieldErrorBadge name="sampleType" errors={errors} />
              <ResolveOverlay field="sampleType" />
              {lock("sampleType") ? (
                <div className="flex-1  min-h-[14px]">{sampleType}</div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${
                    errors.sampleType
                      ? "border-red-500 ring-1 ring-red-500"
                      : "border-black/70"
                  } ${
                    hasCorrection("sampleType")
                      ? "ring-2 ring-rose-500 animate-pulse"
                      : ""
                  } `}
                  value={sampleType}
                  onChange={(e) => {
                    setSampleType(e.target.value);
                    markDirty();
                    clearError("sampleType");
                  }}
                  aria-invalid={!!errors.sampleType}
                />
              )}
            </div>
            <div
              id="f-formulaNo"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("formulaNo");
                setAddMessage("");
              }}
              className={`px-2 flex items-center gap-1 relative
                ${dashClass("formulaNo")}`}
            >
              <div className="font-medium whitespace-nowrap">FORMULA #:</div>
              <FieldErrorBadge name="formulaNo" errors={errors} />
              <ResolveOverlay field="formulaNo" />
              {lock("formulaNo") ? (
                <div className="flex-1 min-h-[14px]">{formulaNo}</div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${
                    errors.formulaNo
                      ? "border-red-500 ring-1 ring-red-500"
                      : "border-black/70"
                  }  ${
                    hasCorrection("formulaNo")
                      ? "ring-2 ring-rose-500 animate-pulse"
                      : ""
                  } `}
                  value={formulaNo}
                  onChange={(e) => {
                    setFormulaNo(e.target.value);
                    clearError("formulaNo");
                    markDirty();
                  }}
                  aria-invalid={!!errors.formulaNo}
                />
              )}
            </div>
          </div>

          {/* DESCRIPTION (full row) */}
          <div
            id="f-description"
            onClick={() => {
              if (!selectingCorrections) return;
              setAddForField("description");
              setAddMessage("");
            }}
            className={`border-b border-black flex items-center gap-2 px-2 text-[12px] leading-snug relative ${dashClass(
              "description"
            )}`}
          >
            <div className="w-28 font-medium">DESCRIPTION:</div>
            <FieldErrorBadge name="description" errors={errors} />
            <ResolveOverlay field="description" />
            {lock("description") ? (
              <div className="flex-1  min-h-[14px]">{description}</div>
            ) : (
              <input
                className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${
                  errors.description
                    ? "border-red-500 ring-1 ring-red-500"
                    : "border-black/70"
                }  ${
                  hasCorrection("description")
                    ? "ring-2 ring-rose-500 animate-pulse"
                    : ""
                } `}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  markDirty();
                  clearError("description");
                }}
                aria-invalid={!!errors.description}
              />
            )}
          </div>

          {/* LOT # / MANUFACTURE DATE */}
          <div className="grid grid-cols-[55%_45%] border-b border-black text-[12px] leading-snug">
            <div
              id="f-lotNo"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("lotNo");
                setAddMessage("");
              }}
              className={`px-2 border-r border-black flex items-center gap-1 relative ${dashClass(
                "lotNo"
              )}`}
            >
              <div className="font-medium whitespace-nowrap">LOT #:</div>
              <FieldErrorBadge name="lotNo" errors={errors} />
              <ResolveOverlay field="lotNo" />
              {lock("lotNo") ? (
                <div className="flex-1  min-h-[14px]">{lotNo}</div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${
                    errors.lotNo
                      ? "border-red-500 ring-1 ring-red-500"
                      : "border-black/70"
                  } ${
                    hasCorrection("lotNo")
                      ? "ring-2 ring-rose-500 animate-pulse"
                      : ""
                  } `}
                  value={lotNo}
                  onChange={(e) => {
                    setLotNo(e.target.value);
                    markDirty();
                    clearError("lotNo");
                  }}
                  aria-invalid={!!errors.lotNo}
                />
              )}
            </div>
            <div
              id="f-manufactureDate"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("manufactureDate");
                setAddMessage("");
              }}
              className={`px-2 flex items-center gap-1 relative ${dashClass(
                "manufactureDate"
              )}`}
            >
              <div className="font-medium whitespace-nowrap">
                MANUFACTURE DATE:
              </div>
              <FieldErrorBadge name="manufactureDate" errors={errors} />
              <ResolveOverlay field="manufactureDate" />
              {lock("manufactureDate") ? (
                <div className="flex-1  min-h-[14px]">
                  {formatDateForInput(manufactureDate)}
                </div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${
                    errors.manufactureDate
                      ? "border-red-500 ring-1 ring-red-500"
                      : "border-black/70"
                  } ${
                    hasCorrection("manufactureDate")
                      ? "ring-2 ring-rose-500 animate-pulse"
                      : ""
                  } `}
                  type="date"
                  value={formatDateForInput(manufactureDate)}
                  onChange={(e) => {
                    setManufactureDate(e.target.value);
                    markDirty();
                    clearError("manufactureDate");
                  }}
                  aria-invalid={!!errors.manufactureDate}
                />
              )}
            </div>
          </div>

          {/* TEST SOP # / DATE TESTED */}
          <div className="grid grid-cols-[55%_45%] border-b border-black text-[12px] leading-snug">
            <div
              id="f-testSopNo"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("testSopNo");
                setAddMessage("");
              }}
              className={`px-2 border-r border-black flex items-center gap-1 relative ${dashClass(
                "testSopNo"
              )}`}
            >
              <div className="font-medium whitespace-nowrap">TEST SOP #:</div>
              <FieldErrorBadge name="testSopNo" errors={errors} />
              <ResolveOverlay field="testSopNo" />
              {lock("testSopNo") ? (
                <div className="flex-1  min-h-[14px]">{testSopNo}</div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug  border ${
                    errors.testSopNo
                      ? "border-red-500 ring-1 ring-red-500"
                      : "border-black/70"
                  } ${
                    hasCorrection("testSopNo")
                      ? "ring-2 ring-rose-500 animate-pulse"
                      : ""
                  } `}
                  value={testSopNo}
                  onChange={(e) => {
                    setTestSopNo(e.target.value);
                    clearError("testSopNo");
                    markDirty();
                  }}
                  aria-invalid={!!errors.testSopNo}
                />
              )}
            </div>
            <div
              id="f-dateTested"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("dateTested");
                setAddMessage("");
              }}
              className={`px-2 flex items-center gap-1 relative ${dashClass(
                "dateTested"
              )}`}
            >
              <div className="font-medium whitespace-nowrap">DATE TESTED:</div>
              <FieldErrorBadge name="dateTested" errors={errors} />
              <ResolveOverlay field="dateTested" />
              {lock("dateTested") ? (
                <div className="flex-1  min-h-[14px]">
                  {formatDateForInput(dateTested)}
                </div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${
                    errors.dateTested
                      ? "border-red-500 ring-1 ring-red-500"
                      : "border-black/70"
                  } ${
                    hasCorrection("dateTested")
                      ? "ring-2 ring-rose-500 animate-pulse"
                      : ""
                  } `}
                  type="date"
                  value={formatDateForInput(dateTested)}
                  onChange={(e) => {
                    setDateTested(e.target.value);
                    clearError("dateTested");
                    markDirty();
                  }}
                  aria-invalid={!!errors.dateTested}
                />
              )}
            </div>
          </div>

          {/* PRELIMINARY RESULTS / PRELIMINARY RESULTS DATE */}
          <div className="grid grid-cols-[45%_55%] border-b border-black text-[12px] leading-snug">
            <div
              id="f-preliminaryResults"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("preliminaryResults");
                setAddMessage("");
              }}
              className={`px-2 border-r border-black flex items-center gap-1 relative ${dashClass(
                "preliminaryResults"
              )}`}
            >
              <div className="font-medium">PRELIMINARY RESULTS:</div>
              <FieldErrorBadge name="preliminaryResults" errors={errors} />
              <ResolveOverlay field="preliminaryResults" />
              {lock("preliminaryResults") ? (
                <div className="flex-1  min-h-[14px]">{preliminaryResults}</div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${
                    errors.preliminaryResults
                      ? "border-red-500 ring-1 ring-red-500"
                      : "border-black/70"
                  } ${
                    hasCorrection("preliminaryResults")
                      ? "ring-2 ring-rose-500 animate-pulse"
                      : ""
                  } `}
                  value={preliminaryResults}
                  onChange={(e) => {
                    setPreliminaryResults(e.target.value);
                    clearError("preliminaryResults");
                    markDirty();
                  }}
                  aria-invalid={!!errors.preliminaryResults}
                />
              )}
            </div>
            <div
              id="f-preliminaryResultsDate"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("preliminaryResultsDate");
                setAddMessage("");
              }}
              className={`px-2 flex items-center gap-1 relative ${dashClass(
                "preliminaryResultsDate"
              )}`}
            >
              <div className="font-medium">PRELIMINARY RESULTS DATE:</div>
              <FieldErrorBadge name="preliminaryResultsDate" errors={errors} />
              <ResolveOverlay field="preliminaryResultsDate" />
              {lock("preliminaryResultsDate") ? (
                <div className="flex-1  min-h-[14px]">
                  {formatDateForInput(preliminaryResultsDate)}
                </div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${
                    errors.preliminaryResultsDate
                      ? "border-red-500 ring-1 ring-red-500"
                      : "border-black/70"
                  }  ${
                    hasCorrection("preliminaryResultsDate")
                      ? "ring-2 ring-rose-500 animate-pulse"
                      : ""
                  } `}
                  type="date"
                  value={formatDateForInput(preliminaryResultsDate)}
                  onChange={(e) => {
                    setPreliminaryResultsDate(e.target.value);
                    clearError("preliminaryResultsDate");
                    markDirty();
                  }}
                  aria-invalid={!!errors.preliminaryResultsDate}
                />
              )}
            </div>
          </div>

          {/* DATE COMPLETED (full row, label + input) */}
          <div
            id="f-dateCompleted"
            onClick={() => {
              if (!selectingCorrections) return;
              setAddForField("dateCompleted");
              setAddMessage("");
            }}
            className={` flex items-center gap-2 px-2 text-[12px] leading-snug relative ${dashClass(
              "dateCompleted"
            )}`}
          >
            <div className="font-medium whitespace-nowrap">DATE COMPLETED:</div>
            <FieldErrorBadge name="dateCompleted" errors={errors} />
            <ResolveOverlay field="dateCompleted" />
            {lock("dateCompleted") ? (
              <div className=" min-h-[14px] flex-1">
                {formatDateForInput(dateCompleted)}
              </div>
            ) : (
              <input
                className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${
                  errors.dateCompleted
                    ? "border-red-500 ring-1 ring-red-500"
                    : "border-black/70"
                }  ${
                  hasCorrection("dateCompleted")
                    ? "ring-2 ring-rose-500 animate-pulse"
                    : ""
                } `}
                type="date"
                value={formatDateForInput(dateCompleted)}
                onChange={(e) => {
                  setDateCompleted(e.target.value);
                  clearError("dateCompleted");
                  markDirty();
                }}
                aria-invalid={!!errors.dateCompleted}
              />
            )}
          </div>
        </div>

        <div className="p-2 font-bold">TBC / TFC RESULTS:</div>

        {/* TBC/TFC table */}
        <div className="mt-2 border border-black">
          <div className="grid grid-cols-[27%_10%_17%_18%_28%] text-[12px] text-center items-center font-semibold border-b border-black">
            <div className="p-2  border-r border-black">TYPE OF TEST</div>
            <div className="p-2 border-r border-black">DILUTION</div>
            <div className="p-2 border-r border-black">GRAM STAIN</div>
            <div className="p-2 border-r border-black">RESULT</div>
            <div className="p-2">SPECIFICATION</div>
          </div>

          {/* Row 1: Total Bacterial Count */}
          <div className="grid grid-cols-[27%_10%_17%_18%_28%] text-[12px] border-b border-black">
            <div className="py-1 px-2 font-bold border-r border-black">
              Total Bacterial Count:
            </div>

            {/* DILUTION (static) */}
            <div className="py-1 px-2 border-r border-black">
              <div className="py-1 px-2 text-center"> x 10^0</div>
            </div>

            {/* GRAM STAIN */}
            <div
              id="f-tbc_gram"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("tbc_gram");
                setAddMessage("");
              }}
              className={`py-1 px-2 border-r border-black flex relative ${dashClass(
                "tbc_gram"
              )}`}
            >
              <FieldErrorBadge name="tbc_gram" errors={errors} />
              <ResolveOverlay field="tbc_gram" />
              <input
                className={`w-full input-editable px-1 border ${
                  !lock("tbc_gram") && errors.tbc_gram
                    ? "border-red-500 ring-1 ring-red-500"
                    : "border-black/70"
                } ${
                  hasCorrection("tbc_gram")
                    ? "ring-2 ring-rose-500 animate-pulse"
                    : ""
                }`}
                value={tbc_gram}
                onChange={(e) => {
                  set_tbc_gram(e.target.value);
                  clearError("tbc_gram");
                }}
                readOnly={lock("tbc_gram")}
                aria-invalid={!!errors.tbc_gram}
              />
            </div>

            {/* RESULT */}
            <div
              id="f-tbc_result"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("tbc_result");
                setAddMessage("");
              }}
              className={`py-1 px-2 border-r border-black flex relative ${dashClass(
                "tbc_result"
              )}`}
            >
              <FieldErrorBadge name="tbc_result" errors={errors} />
              <ResolveOverlay field="tbc_result" />
              <input
                className={`w-1/2 input-editable px-1 border ${
                  !lock("tbc_result") && errors.tbc_result
                    ? "border-red-500 ring-1 ring-red-500"
                    : "border-black/70"
                } ${
                  hasCorrection("tbc_result")
                    ? "ring-2 ring-rose-500 animate-pulse"
                    : ""
                }`}
                value={tbc_result}
                onChange={(e) => {
                  set_tbc_result(e.target.value);
                  clearError("tbc_result");
                }}
                readOnly={lock("tbc_result")}
                placeholder="CFU/ml"
                aria-invalid={!!errors.tbc_result}
              />
              <div className="py-1 px-2 text-center">CFU/ml</div>
            </div>

            {/* SPECIFICATION */}
            <div
              id="f-tbc_spec"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("tbc_spec");
                setAddMessage("");
              }}
              className="py-1 px-2 flex relative"
            >
              <FieldErrorBadge name="tbc_spec" errors={errors} />
              <ResolveOverlay field="tbc_spec" />
              <input
                className={`w-full input-editable px-1 border ${
                  !lock("tbc_spec") && errors.tbc_spec
                    ? "border-red-500 ring-1 ring-red-500"
                    : "border-black/70"
                } ${
                  hasCorrection("tbc_spec")
                    ? "ring-2 ring-rose-500 animate-pulse"
                    : ""
                }`}
                value={tbc_spec}
                onChange={(e) => {
                  set_tbc_spec(e.target.value);
                  clearError("tbc_spec");
                }}
                readOnly={lock("tbc_spec")}
                aria-invalid={!!errors.tbc_spec}
              />
            </div>
          </div>

          {/* Row 2: Total Mold & Yeast Count */}
          <div className="grid grid-cols-[27%_10%_17%_18%_28%] text-[12px]">
            <div className="py-1 px-2 font-bold border-r border-black">
              Total Mold & Yeast Count:
            </div>

            {/* DILUTION (static) */}
            <div className="py-1 px-2 border-r border-black">
              <div className="py-1 px-2 text-center"> x 10^0</div>
            </div>

            {/* GRAM STAIN */}
            <div
              id="f-tmy_gram"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("tmy_gram");
                setAddMessage("");
              }}
              className={`py-1 px-2 border-r border-black flex relative ${dashClass(
                "tmy_gram"
              )}`}
            >
              <FieldErrorBadge name="tmy_gram" errors={errors} />
              <ResolveOverlay field="tmy_gram" />
              <input
                className={`w-full input-editable px-1 border ${
                  !lock("tmy_gram") && errors.tmy_gram
                    ? "border-red-500 ring-1 ring-red-500"
                    : "border-black/70"
                } ${
                  hasCorrection("tmy_gram")
                    ? "ring-2 ring-rose-500 animate-pulse"
                    : ""
                }`}
                value={tmy_gram}
                onChange={(e) => {
                  set_tmy_gram(e.target.value);
                  clearError("tmy_gram");
                }}
                readOnly={lock("tmy_gram")}
                aria-invalid={!!errors.tmy_gram}
              />
            </div>

            {/* RESULT */}
            <div
              id="f-tmy_result"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("tmy_result");
                setAddMessage("");
              }}
              className={`py-1 px-2 border-r border-black flex relative ${dashClass(
                "tmy_result"
              )}`}
            >
              <FieldErrorBadge name="tmy_result" errors={errors} />
              <ResolveOverlay field="tmy_result" />
              <input
                className={`w-1/2 input-editable px-1 border ${
                  !lock("tmy_result") && errors.tmy_result
                    ? "border-red-500 ring-1 ring-red-500"
                    : "border-black/70"
                } ${
                  hasCorrection("tmy_result")
                    ? "ring-2 ring-rose-500 animate-pulse"
                    : ""
                }`}
                value={tmy_result}
                onChange={(e) => {
                  set_tmy_result(e.target.value);
                  clearError("tmy_result");
                }}
                readOnly={lock("tmy_result")}
                placeholder="CFU/ml"
                aria-invalid={!!errors.tmy_result}
              />
              <div className="py-1 px-2 text-center">CFU/ml</div>
            </div>

            {/* SPECIFICATION */}
            <div
              id="f-tmy_spec"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("tmy_spec");
                setAddMessage("");
              }}
              className={`py-1 px-2 flex relative ${dashClass("tmy_spec")}`}
            >
              <FieldErrorBadge name="tmy_spec" errors={errors} />
              <ResolveOverlay field="tmy_spec" />
              <input
                className={`w-full input-editable px-1 border ${
                  !lock("tmy_spec") && errors.tmy_spec
                    ? "border-red-500 ring-1 ring-red-500"
                    : "border-black/70"
                } ${
                  hasCorrection("tmy_spec")
                    ? "ring-2 ring-rose-500 animate-pulse"
                    : ""
                }`}
                value={tmy_spec}
                onChange={(e) => {
                  set_tmy_spec(e.target.value);
                  clearError("tmy_spec");
                }}
                readOnly={lock("tmy_spec")}
                aria-invalid={!!errors.tmy_spec}
              />
            </div>
          </div>
        </div>

        <div className="p-2 font-bold">
          PATHOGEN SCREENING (Please check the organism to be tested)
        </div>

        {/* Pathogen screening */}
        {/* Pathogen screening */}
        <div
          id="f-pathogens"
          // onClick ={() => {
          //   if (!selectingCorrections) return;
          //   setAddForField("pathogens");
          //   setAddMessage("");
          // }}
          className={`mt-3 relative border ${
            pathogensTableError
              ? "border-red-500 ring-1 ring-red-500"
              : "border-black"
          } `}
          aria-invalid={!!errors.pathogens}
        >
          {/* floating badge; doesn't affect layout */}
          {/* <FieldErrorBadge name="pathogens" errors={errors} /> */}
          <ResolveOverlay field="pathogens" />

          {/* Header */}
          <div className="grid grid-cols-[25%_55%_20%] text-[12px] text-center font-semibold border-b border-black">
            <div className="p-2 border-r border-black"></div>
            <div className="p-2 border-r border-black">RESULT</div>
            <div className="p-2">SPECIFICATION</div>
          </div>

          {pathogensTableError && (
            <div className="px-2 py-1 text-[11px] text-red-600">
              {pathogensTableError}
            </div>
          )}

          {/* Rows */}

          {pathogens.map((p, idx) => {
            const rowErr = pathogenRowErrors[idx]?.result;
            return (
              <div
                key={p.key}
                className={`grid grid-cols-[25%_55%_20%] text-[11px] leading-tight border-b last:border-b-0 border-black ${
                  rowErr ? "ring-1 ring-red-500" : ""
                } `}
              >
                {/* <ResolveOverlay field={`pathogens.${p.key}`} /> */}
                {/* First column: checkbox + label (unchanged except using setPathogenChecked) */}
                <ResolveOverlay field={`pathogens.${p.key}:checked`} />
                <div
                  id="f-pathogens-checked"
                  onClick={() => {
                    if (!selectingCorrections) return;
                    setAddForField(`pathogens:${p.key}:checked`);
                    setAddMessage("");
                  }}
                  className={`py-[2px] px-2 border-r border-black flex items-center gap-2 ${
                    hasCorrection(`pathogens.${p.key}`)
                      ? "ring-2 ring-rose-500 animate-pulse"
                      : ""
                  }${dashClass(`pathogens:${p.key}:checked`)}`}
                >
                  <ResolveOverlay field={`pathogens.${p.key}:checked`} />
                  <input
                    type="checkbox"
                    className="thick-box"
                    checked={!!p.checked}
                    onChange={(e) => setPathogenChecked(idx, e.target.checked)}
                    // disabled={organismDisabled()}
                    disabled={lock("pathogens") || role !== "CLIENT"}
                  />
                  <span className="font-bold">{p.label}</span>
                  {p.key === "OTHER" && (
                    <input
                      className="input-editable leading-tight"
                      placeholder="(specify)"
                      readOnly
                    />
                  )}
                </div>

                {/* Second column: Result + per-row error */}
                <div
                  id="f-pathogens-result"
                  onClick={() => {
                    if (!selectingCorrections) return;
                    setAddForField(`pathogens:${p.key}:result`);
                    setAddMessage("");
                  }}
                  className={`py-[2px] px-2 border-r border-black flex items-center gap-2 whitespace-nowrap ${dashClass(
                    `pathogens:${p.key}:result`
                  )}`}
                >
                  <ResolveOverlay field={`pathogens.${p.key}.result`} />
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      className="thick-box"
                      checked={p.result === "Absent"}
                      onChange={() => setPathogenResult(idx, "Absent")}
                      onDoubleClick={() => clearPathogenResult(idx)}
                      title="Click to set Absent. Double-click to clear."
                      disabled={resultDisabled(p)}
                      // disabled={
                      //   role === "ADMIN" || role === "FRONTDESK" || role === "CLIENT" ||
                      //   role === "QA" || role === "SYSTEMADMIN"
                      // }
                    />
                    Absent
                  </label>

                  <span className="mx-1">/</span>

                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      className="thick-box"
                      checked={p.result === "Present"}
                      onChange={() => setPathogenResult(idx, "Present")}
                      onDoubleClick={() => clearPathogenResult(idx)}
                      disabled={resultDisabled(p)}
                      title={
                        resultDisabled(p)
                          ? "Check the organism first"
                          : "Click to set Present. Double-click to clear."
                      }
                      // disabled={
                      //   role === "ADMIN" || role === "FRONTDESK" || role === "CLIENT" ||
                      //   role === "QA" || role === "SYSTEMADMIN"
                      // }
                    />
                    Present
                  </label>

                  {/* inline note, no huge gap */}
                  <span className="ml-2">in 11g of sample</span>

                  {/* optional row error */}
                  {pathogenRowErrors[idx]?.result && (
                    <span className="ml-2 text-[11px] text-red-600">
                      {pathogenRowErrors[idx].result}
                    </span>
                  )}
                </div>

                {/* Third column (spec) */}
                {/* Third column (spec) */}
                {/* Third column (spec) */}
                <div
                  id="f-pathogens-spec"
                  onClick={() => {
                    if (!selectingCorrections) return;
                    setAddForField(`pathogens:${p.key}:spec`);
                    setAddMessage("");
                  }}
                  className={`py-[2px] px-2 text-center ${dashClass(
                    `pathogens:${p.key}:spec`
                  )} ${
                    pathogenRowErrors[idx]?.spec ? "ring-1 ring-red-500" : ""
                  }`}
                >
                  <ResolveOverlay field={`pathogens.${p.key}.spec`} />
                  <select
                    className={`input-editable border text-[11px] px-1 py-[1px] ${
                      pathogenRowErrors[idx]?.spec
                        ? "border-red-500"
                        : "border-black/70"
                    }`}
                    value={p.spec}
                    onChange={(e) =>
                      setPathogenSpec(idx, e.target.value as PathogenSpec)
                    }
                    disabled={
                      !p.checked || lock("pathogens") || role !== "CLIENT"
                    }
                    aria-invalid={!!pathogenRowErrors[idx]?.spec}
                  >
                    <option value="">{/* placeholder */}-- Select --</option>
                    <option value="Absent">Absent</option>
                    <option value="Present">Present</option>
                  </select>
                  {pathogenRowErrors[idx]?.spec && (
                    <div className="mt-1 text-[11px] text-red-600">
                      {pathogenRowErrors[idx]?.spec}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legends / Comments */}
        <div className="mt-2 text-[11px]">
          <div
            className=" font-bold border-black p-2"
            style={{ textDecoration: "underline" }}
          >
            DENOTES: NA (Not Applicable) / N.G. (No Growth) / GM.(+)B Gram (+)
            Bacilli / GM.(+)C Gram (+) Cocci / GM.NEG Gram Negative / NT (Not
            Tested) / TNTC (Too Numerous To Count)
          </div>
        </div>

        {/* Comments + Signatures */}
        {/* Comments + Signatures */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
          <div
            id="f-comments"
            onClick={() => {
              if (!selectingCorrections) return;
              setAddForField("comments");
              setAddMessage("");
            }}
            className={`p2 col-span-2 flex relative ${dashClass("comments")}`}
          >
            <div className="mb-1 font-medium">Comments:</div>
            <FieldErrorBadge name="comments" errors={errors} />
            <ResolveOverlay field="comments" />
            <input
              className={`flex-1 border-0 border-b text-[12px] outline-none focus:border-blue-500 focus:ring-0 ${
                errors.testedBy ? "border-b-red-500" : "border-b-black/70"
              } ${
                hasCorrection("comments")
                  ? "ring-2 ring-rose-500 animate-pulse"
                  : ""
              }`}
              value={comments}
              onChange={(e) => {
                setComments(e.target.value);
                clearError("comments");
                markDirty();
              }}
              aria-invalid={!!errors.comments}
              readOnly={lock("comments")}
              placeholder="Comments"
            />
          </div>

          {/* TESTED BY */}
          <div
            id="f-testedBy"
            onClick={() => {
              if (!selectingCorrections) return;
              setAddForField("testedBy");
              setAddMessage("");
            }}
            className={`p-2 relative ${dashClass("testedBy")}`}
          >
            <div className="font-medium mb-2 flex items-center gap-2">
              TESTED BY:
              {/* floating badge; doesn't affect layout */}
              <FieldErrorBadge name="testedBy" errors={errors} />
              <ResolveOverlay field="testedBy" />
              ``
              <input
                className={`flex-1 border-0 border-b text-[12px] outline-none focus:border-blue-500 focus:ring-0 ${
                  errors.testedBy ? "border-b-red-500" : "border-b-black/70"
                } ${
                  hasCorrection("testedBy")
                    ? "ring-2 ring-rose-500 animate-pulse"
                    : ""
                }`}
                value={testedBy.toUpperCase()}
                onChange={(e) => {
                  setTestedBy(e.target.value);
                  clearError("testedBy");
                  markDirty();
                }}
                readOnly={lock("testedBy")}
                placeholder="Name"
                aria-invalid={!!errors.testedBy}
              />
            </div>

            <div
              id="f-testedDate"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("testedDate");
                setAddMessage("");
              }}
              className={`font-medium mt-2 flex items-center gap-2 relative ${dashClass(
                "testedDate"
              )}`}
            >
              DATE:
              <FieldErrorBadge name="testedDate" errors={errors} />
              <ResolveOverlay field="testedDate" />
              <input
                className={`flex-1 border-0 border-b text-[12px] outline-none focus:border-blue-500 focus:ring-0 ${
                  errors.testedDate ? "border-b-red-500" : "border-b-black/70"
                } ${
                  hasCorrection("testedDate")
                    ? "ring-2 ring-rose-500 animate-pulse"
                    : ""
                }`}
                type="date"
                value={formatDateForInput(testedDate)}
                onChange={(e) => {
                  setTestedDate(e.target.value);
                  clearError("testedDate");
                }}
                readOnly={lock("testedDate")}
                placeholder="MM/DD/YYYY"
                aria-invalid={!!errors.testedDate}
              />
            </div>
          </div>

          {/* REVIEWED BY */}
          <div
            id="f-reviewedBy"
            onClick={() => {
              if (!selectingCorrections) return;
              setAddForField("reviewedBy");
              setAddMessage("");
            }}
            className={`p-2 relative ${dashClass("reviewedBy")}`}
          >
            <div className="font-medium mb-2 flex items-center gap-2">
              REVIEWED BY:
              <FieldErrorBadge name="reviewedBy" errors={errors} />
              <ResolveOverlay field="reviewedBy" />
              <input
                className={`flex-1 border-0 border-b text-[12px] outline-none focus:border-blue-500 focus:ring-0 ${
                  errors.reviewedBy ? "border-b-red-500" : "border-b-black/70"
                } ${
                  hasCorrection("reviewedBy")
                    ? "ring-2 ring-rose-500 animate-pulse"
                    : ""
                }`}
                value={reviewedBy.toUpperCase()}
                onChange={(e) => {
                  setReviewedBy(e.target.value);
                  clearError("reviewedBy");
                }}
                readOnly={lock("reviewedBy")}
                placeholder="Name"
                aria-invalid={!!errors.reviewedBy}
              />
            </div>

            <div
              id="f-reviewedDate"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("reviewedDate");
                setAddMessage("");
              }}
              className={`font-medium mt-2 flex items-center gap-2 relative ${dashClass(
                "reviewedDate"
              )}`}
            >
              DATE:
              <FieldErrorBadge name="reviewedDate" errors={errors} />
              <ResolveOverlay field="reviewedDate" />
              <input
                className={`flex-1 border-0 border-b text-[12px] outline-none focus:border-blue-500 focus:ring-0 ${
                  errors.reviewedDate ? "border-b-red-500" : "border-b-black/70"
                } ${
                  hasCorrection("reviewedDate")
                    ? "ring-2 ring-rose-500 animate-pulse"
                    : ""
                }`}
                type="date"
                value={formatDateForInput(reviewedDate)}
                onChange={(e) => {
                  setReviewedDate(e.target.value);
                  clearError("reviewedDate");
                }}
                readOnly={lock("reviewedDate")}
                placeholder="MM/DD/YYYY"
                aria-invalid={!!errors.reviewedDate}
              />
            </div>
          </div>
        </div>
      </div>
      {/* Role-based actions */}
      {/* Role-based actions OUTSIDE the report */}
      {/* Role-based actions OUTSIDE the report */}
      {/* {STATUS_TRANSITIONS[status as ReportStatus]?.next.map(
        (targetStatus: ReportStatus) => {
          if (
            STATUS_TRANSITIONS[status as ReportStatus].canSet.includes(role!) &&
            statusButtons[targetStatus]
          ) {
            const { label, color } = statusButtons[targetStatus];
            return (
              <button
                key={targetStatus}
                className={`px-4 py-2 rounded-md border text-white ${color}`}
                onClick={() => handleStatusChange(targetStatus)}
                // 👇 disable submit until report is saved
                disabled={isDirty || !reportId}
              >
                {label}
              </button>

            );
          }
          return null;
        }
      )} */}
      {/* Actions row: submit/reject on left, close on right */}
      <div className="no-print mt-4 flex items-center justify-between">
        {/* Left: status action buttons */}
        <div className="flex flex-wrap gap-2">
          {STATUS_TRANSITIONS[status as ReportStatus]?.next.map(
            (targetStatus: ReportStatus) => {
              if (
                STATUS_TRANSITIONS[status as ReportStatus].canSet.includes(
                  role!
                ) &&
                statusButtons[targetStatus]
              ) {
                const { label, color } = statusButtons[targetStatus];
                return (
                  <button
                    key={targetStatus}
                    className={`px-4 py-2 rounded-md border text-white ${color}`}
                    onClick={() => requestStatusChange(targetStatus)}
                    // disabled={isDirty || !reportId}
                    disabled={role === "SYSTEMADMIN"}
                  >
                    {label}
                  </button>
                );
              }
              return null;
            }
          )}
        </div>
      </div>
      {showESign && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="E-signature"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-2">
              Confirm Status Change
            </h2>
            <p className="text-sm text-slate-600 mb-3">
              Change status to{" "}
              <span className="font-medium">{pendingStatus}</span>. Provide a
              reason and your e-signature password.
            </p>

            <input
              type="text"
              placeholder="Reason for change"
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              className="mb-3 w-full rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />

            <input
              type="password"
              placeholder="E-signature password"
              value={eSignPassword}
              onChange={(e) => setESignPassword(e.target.value)}
              className="mb-4 w-full rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />

            <div className="flex justify-end gap-2">
              <button
                className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50"
                onClick={() => {
                  setShowESign(false);
                  setPendingStatus(null);
                }}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={
                  !pendingStatus ||
                  !changeReason.trim() ||
                  !eSignPassword.trim()
                }
                onClick={() => {
                  if (!pendingStatus) return;
                  const statusToApply = pendingStatus;
                  setShowESign(false);
                  setPendingStatus(null);
                  handleStatusChange(statusToApply, {
                    reason: changeReason.trim(),
                    eSignPassword,
                  });
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {selectingCorrections && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border bg-white/95 p-3 shadow-xl">
          <div className="text-sm font-medium">Corrections picker</div>
          <div className="text-xs text-slate-600">
            Click a field in the form to add a note.
          </div>

          <ul className="mt-2 max-h-32 overflow-auto text-xs">
            {pendingCorrections.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  <b>{c.fieldKey}</b>: {c.message}
                </span>
                <button
                  className="text-rose-600 hover:underline"
                  onClick={() =>
                    setPendingCorrections((prev) =>
                      prev.filter((_, idx) => idx !== i)
                    )
                  }
                >
                  remove
                </button>
              </li>
            ))}
            {pendingCorrections.length === 0 && (
              <li className="text-slate-400">No items yet</li>
            )}
          </ul>

          <div className="mt-3 flex justify-end gap-2">
            <button
              className="rounded-lg border px-3 py-1.5 text-sm"
              onClick={() => {
                setSelectingCorrections(false);
                setPendingCorrections([]);
                setPendingStatus(null);
              }}
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              disabled={
                !pendingCorrections.length || !pendingStatus || !reportId
              }
              onClick={async () => {
                const token = localStorage.getItem("token")!;
                await createCorrections(
                  reportId!,
                  token,
                  pendingCorrections,
                  pendingStatus!, // MOVE status in same call
                  "Corrections requested" // audit reason
                );
                setSelectingCorrections(false);
                setPendingCorrections([]);
                // refresh corrections list and status
                const fresh = await getCorrections(reportId!, token);
                setCorrections(fresh);
                setStatus(pendingStatus!);
                setPendingStatus(null);
              }}
            >
              Send corrections
            </button>
          </div>
        </div>
      )}

      {addForField && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold mb-2">Add correction</h3>
            <p className="text-xs mb-2 text-slate-600">
              Field: <b>{addForField}</b>
            </p>
            <textarea
              autoFocus
              rows={3}
              value={addMessage}
              onChange={(e) => setAddMessage(e.target.value)}
              placeholder="Describe what needs to be corrected"
              className="w-full rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                className="rounded-lg border px-3 py-1.5 text-sm"
                onClick={() => {
                  setAddForField(null);
                  setAddMessage("");
                }}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!addMessage.trim()}
                onClick={() => {
                  setPendingCorrections((prev) => [
                    ...prev,
                    { fieldKey: addForField!, message: addMessage.trim() },
                  ]);
                  setAddForField(null);
                  setAddMessage("");
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* {openCorrections.map((c) => (
        <div key={c.id} className="flex items-center gap-2 text-sm">
          <div>
            <b>{c.fieldKey}</b>: {c.message}
          </div>
          <button
            className="text-blue-600 underline"
            onClick={async () => {
              const token = localStorage.getItem("token")!;
              await resolveCorrection(reportId!, c.id, token, "Fixed");
              const fresh = await getCorrections(reportId!, token);
              setCorrections(fresh); // refresh UI
            }}
          >
            Mark resolved
          </button>
        </div>
      ))} */}
      {/* Floating Corrections button */}
      <div className="no-print fixed bottom-6 right-6 z-40">
        <button
          onClick={() => setShowCorrTray((s) => !s)}
          className="rounded-full border bg-white/95 px-4 py-2 text-sm shadow-lg hover:bg-white"
        >
          📝 Corrections
          {openCorrections.length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center rounded-full bg-rose-600 px-2 py-[1px] text-[11px] font-semibold text-white">
              {openCorrections.length}
            </span>
          )}
        </button>
      </div>

      {showCorrTray && (
        <div className="no-print fixed bottom-20 right-6 z-40 w-[380px] overflow-hidden rounded-xl border bg-white/95 shadow-2xl">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="text-sm font-semibold">Open corrections</div>
            <button
              className="rounded px-2 py-1 text-xs hover:bg-slate-100"
              onClick={() => setShowCorrTray(false)}
            >
              ✕
            </button>
          </div>

          <div className="max-h-72 overflow-auto divide-y">
            {openCorrections.length === 0 ? (
              <div className="p-3 text-xs text-slate-500">
                No open corrections.
              </div>
            ) : (
              openCorrections.map((c) => (
                <div key={c.id} className="p-3 text-sm">
                  <div className="text-[11px] font-medium text-slate-500">
                    {c.fieldKey}
                  </div>
                  <div className="mt-1">{c.message}</div>
                  <div className="mt-2 flex gap-2">
                    <button
                      className="text-xs font-medium text-emerald-700 hover:underline"
                      onClick={() => resolveOne(c)}
                    >
                      ✓ Mark resolved
                    </button>
                    <button
                      className="text-xs text-slate-500 hover:underline"
                      onClick={() => resolveField(c.fieldKey)}
                      title="Resolve all notes for this field"
                    >
                      Resolve all for field
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
