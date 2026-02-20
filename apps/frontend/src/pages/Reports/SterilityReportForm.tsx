import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useLocation, useNavigate } from "react-router-dom";
import {
  STERILITY_STATUS_TRANSITIONS,
  type CorrectionItem,
  type Role,
  type SterilityReportStatus,
} from "../../utils/SterilityReportFormWorkflow";
import { useAuth } from "../../context/AuthContext";
import {
  createCorrections,
  FieldErrorBadge,
  getCorrections,
  resolveCorrection,
  useReportValidation,
  type ReportStatus,
  type SterilityReportFormValues,
} from "../../utils/sterilityReportValidation";
import { api } from "../../lib/api";
import { todayISO } from "../../utils/microMixReportFormWorkflow";

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

// ---- Map each transition to buttons ----

const statusButtons: Record<string, { label: string; color: string }> = {
  SUBMITTED_BY_CLIENT: { label: "Submit", color: "bg-green-600" },
  UNDER_CLIENT_REVIEW: { label: "Approve", color: "bg-green-600" },

  CLIENT_NEEDS_CORRECTION: {
    label: "Needs Correction",
    color: "bg-yellow-600",
  },

  RECEIVED_BY_FRONTDESK: { label: "Approve", color: "bg-green-600" },
  FRONTDESK_ON_HOLD: { label: "Hold", color: "bg-red-500" },
  FRONTDESK_NEEDS_CORRECTION: {
    label: "Needs Correction",
    color: "bg-red-600",
  },
  UNDER_TESTING_REVIEW: { label: "Approve", color: "bg-green-600" },
  TESTING_ON_HOLD: { label: "Hold", color: "bg-red-500" },
  TESTING_NEEDS_CORRECTION: {
    label: "Needs Correction",
    color: "bg-yellow-500",
  },
  RESUBMISSION_BY_TESTING: {
    label: "Resubmit",
    color: "bg-blue-600",
  },
  RESUBMISSION_BY_CLIENT: {
    label: "Resubmit",
    color: "bg-blue-600",
  },
  UNDER_RESUBMISSION_TESTING_REVIEW: {
    label: "Approve",
    color: "bg-blue-600",
  },

  UNDER_RESUBMISSION_QA_REVIEW: {
    label: "Approve",
    color: "bg-blue-600",
  },

  UNDER_QA_REVIEW: { label: "Approve", color: "bg-green-600" },
  QA_NEEDS_CORRECTION: { label: "Needs Correction", color: "bg-yellow-500" },
  UNDER_ADMIN_REVIEW: { label: "Approve", color: "bg-green-700" },
  ADMIN_NEEDS_CORRECTION: { label: "Needs Correction", color: "bg-yellow-600" },
  ADMIN_REJECTED: { label: "Reject", color: "bg-red-700" },
  APPROVED: { label: "Approve", color: "bg-green-700" },
};

// A small helper to lock fields per role (frontend hint; backend is the source of truth)
function canEdit(
  role: Role | undefined,
  field: string,
  status?: SterilityReportStatus,
) {
  if (!role || !status) return false;
  const transition = STERILITY_STATUS_TRANSITIONS[status]; // ✅ safe now
  if (!transition || !transition.canEdit?.includes(role)) {
    return false;
  }

  const map: Record<Role, string[]> = {
    SYSTEMADMIN: [],
    ADMIN: [
      "testSopNo",
      "dateTested",
      "testSopNo",
      "dateTested",
      "ftm_turbidity",
      "ftm_observation",
      "ftm_result",
      "scdb_turbidity",
      "scdb_observation",
      "scdb_result",
      "comments",
      "testedBy",
      "testedDate",
      "dateCompleted",
      "reviewedBy",
      "reviewedDate",
    ],
    FRONTDESK: [
      // "client",
      // "dateSent",
      // "typeOfTest",
      // "sampleType",
      // "formulaNo",
      // "description",
      // "lotNo",
      // "manufactureDate",
    ],
    MICRO: [
      "testSopNo",
      "dateTested",
      "ftm_turbidity",
      "ftm_observation",
      "ftm_result",
      "scdb_turbidity",
      "scdb_observation",
      "scdb_result",
      "comments",
    ],
    MC: [
      "testSopNo",
      "dateTested",
      "ftm_turbidity",
      "ftm_observation",
      "ftm_result",
      "scdb_turbidity",
      "scdb_observation",
      "scdb_result",
      "comments",
    ],
    QA: ["dateCompleted"],
    CLIENT: [
      "client",
      "dateSent",
      "typeOfTest",
      "sampleType",
      "formulaNo",
      "description",
      "lotNo",
      "manufactureDate",
      "comments",
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

const HIDE_SAVE_FOR = new Set<SterilityReportStatus>(["APPROVED", "LOCKED"]);

function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white ${className}`}
      aria-hidden="true"
    />
  );
}

// use for non-brand buttons (dark text)
function SpinnerDark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black/70 ${className}`}
      aria-hidden="true"
    />
  );
}

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Main component

export default function SterilityReportForm({
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
    report?.reportNumber || "",
  );

  const [reportVersion, setReportVersion] = useState<number>(
    typeof report?.version === "number" ? report.version : 0,
  );

  useEffect(() => {
    if (typeof report?.version === "number") setReportVersion(report.version);
  }, [report?.version]);

  // //To set clientCode automatically when creating a new report
  // const initialClientValue = report?.client || (role === "CLIENT" ? user?.clientCode || "" : "");

  // ---- local state (prefill from report if editing) ----
  // const [client, setClient] = useState(initialClientValue);
  const [client, setClient] = useState(
    report?.client ??
      (!report?.id && role === "CLIENT" ? (user?.clientCode ?? "") : ""),
  );
  const [dateSent, setDateSent] = useState(report?.dateSent || "");
  const [typeOfTest, setTypeOfTest] = useState(report?.typeOfTest || "");
  const [sampleType, setSampleType] = useState(report?.sampleType || "");
  const [formulaNo, setFormulaNo] = useState(report?.formulaNo || "");
  const [description, setDescription] = useState(report?.description || "");
  const [lotNo, setLotNo] = useState(report?.lotNo || "");
  const [manufactureDate, setManufactureDate] = useState(
    report?.manufactureDate || "",
  );
  const [testSopNo, setTestSopNo] = useState(report?.testSopNo || "");
  const [dateTested, setDateTested] = useState(report?.dateTested || "");
  const [dateCompleted, setDateCompleted] = useState(
    report?.dateCompleted || "",
  );

  const [ftm_turbidity, setFtmTurbidity] = useState(
    report?.ftm_turbidity || "",
  );
  const [scdb_turbidity, setScdbTurbidity] = useState(
    report?.scdb_turbidity || "",
  );

  const [ftm_observation, setFtmObservation] = useState(
    report?.ftm_observation || "",
  );
  const [scdb_observation, setScdbObservation] = useState(
    report?.scdb_observation || "",
  );

  const [ftm_result, setFtmResult] = useState(report?.ftm_result || "");
  const [scdb_result, setScdbResult] = useState(report?.scdb_result || "");

  // function organismDisabled() {
  //   // Only CLIENT decides which organisms to test
  //   return role !== "CLIENT";
  // }

  // function resultDisabled(p: PathRow) {
  //   // Only MICRO can set results, and only if the organism is checked
  //   return !p.checked || (role !== "MICRO" && role !== "ADMIN" && phase !== "FINAL");
  // }

  // --- E-Sign modal state (Admin-only) ---
  // Admin E-sign modal state
  const [showESign, setShowESign] = useState(false);
  const [pendingStatus, setPendingStatus] =
    useState<SterilityReportStatus | null>(null);
  const [changeReason, setChangeReason] = useState("");
  const [eSignPassword, setESignPassword] = useState("");

  // ⬇️ Fetch existing corrections when a report id is present (new or existing)
  useEffect(() => {
    // const token = localStorage.getItem("token");
    if (!reportId) return;
    getCorrections(reportId)
      .then((list) => setCorrections(list)) // explicit lambda avoids any inference weirdness
      .catch(() => {});
  }, [reportId]);

  const [corrections, setCorrections] = useState<CorrectionItem[]>([]);
  const openCorrections = useMemo(
    () => corrections.filter((c) => c.status === "OPEN"),
    [corrections],
  );
  const corrByField = useMemo(() => {
    const m: Record<string, CorrectionItem[]> = {};
    for (const c of openCorrections) (m[c.fieldKey] ||= []).push(c);
    return m;
  }, [openCorrections]);

  const hasCorrection = (field: string) => !!corrByField[field];
  // const correctionText = (field: string) =>
  //   corrByField[field]?.map((c) => `• ${c.message}`).join("\n");

  const [selectingCorrections, setSelectingCorrections] = useState(false);
  const [pendingCorrections, setPendingCorrections] = useState<
    { fieldKey: string; message: string; oldValue?: string | null }[]
  >([]);

  const { search } = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);

  const mode = params.get("mode");
  const urlTemplateId = params.get("templateId");
  const isTemplateMode = mode === "template";

  const isTemplateViewMode = mode === "templateView"; // new
  const isAnyTemplateMode = isTemplateMode || isTemplateViewMode;

  const forceReadOnly = isTemplateViewMode;

  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateVersion, setTemplateVersion] = useState<number>(0);
  const [templateName, setTemplateName] = useState<string>("");

  useEffect(() => {
    if (!isAnyTemplateMode) {
      setTemplateId(null);
      setTemplateVersion(0);
      setTemplateName("");
      return;
    }
    setTemplateId(urlTemplateId); // works for view + edit
  }, [isAnyTemplateMode, urlTemplateId]);

  function getFieldDisplayValue(fieldKey: string) {
    const [base] = fieldKey.split(":");

    // ---- top-level MicroMix fields ----
    switch (base) {
      case "client":
        return client;

      case "dateSent":
        return formatDateForInput(dateSent);

      case "typeOfTest":
        return typeOfTest;

      case "sampleType":
        return sampleType;

      case "formulaNo":
        return formulaNo;

      case "description":
        return description;

      case "lotNo":
        return lotNo;

      case "manufactureDate":
        // you show NA when empty; keep the same here
        return manufactureDate ? formatDateForInput(manufactureDate) : "NA";

      case "testSopNo":
        return testSopNo;

      case "dateTested":
        return formatDateForInput(dateTested);

      case "dateCompleted":
        return formatDateForInput(dateCompleted);

      case "comments":
        return comments;

      case "testedBy":
        return testedBy;

      case "testedDate":
        return formatDateForInput(testedDate);

      case "reviewedBy":
        return reviewedBy;

      case "reviewedDate":
        return formatDateForInput(reviewedDate);

      default:
        return "";
    }
  }

  const [addForField, setAddForField] = useState<string | null>(null);
  const [addMessage, setAddMessage] = useState("");

  // UI policy: only when server will enforce
  const uiNeedsESign = (s: string) =>
    (role === "ADMIN" || role === "SYSTEMADMIN" || role === "FRONTDESK") &&
    (s === "UNDER_CLIENT_FINAL_REVIEW" || s === "LOCKED");

  function requestStatusChange(target: SterilityReportStatus) {
    if (!reportId) {
      alert("⚠️ Please SAVE the report first before changing status.");
      return;
    }

    // ✅ Optional: prevent status change when there are unsaved edits
    if (isDirty) {
      alert(
        "⚠️ You have unsaved changes. Please UPDATE (Save) before changing status.",
      );
      return;
    }
    const isNeeds =
      target === "FRONTDESK_NEEDS_CORRECTION" ||
      target === "TESTING_NEEDS_CORRECTION" ||
      target === "QA_NEEDS_CORRECTION" ||
      target === "ADMIN_NEEDS_CORRECTION" ||
      target === "CLIENT_NEEDS_CORRECTION";

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

  const canResolveField = (field: string) => {
    if (!reportId || !role) return false;
    const base = field.split(":")[0]; // "pathogens" for "pathogens:E_COLI"
    return canEdit(role, base, status as SterilityReportStatus);
  };

  // Resolve ALL corrections for a field
  async function resolveField(fieldKey: string) {
    if (!reportId) return;
    return runBusy("RESOLVE", async () => {
      const items = openCorrections.filter((c) => c.fieldKey === fieldKey);
      if (!items.length) return;

      await Promise.all(
        items.map((c) => resolveCorrection(reportId!, c.id, "Fixed")),
      );
      const fresh = await getCorrections(reportId!);
      setCorrections(fresh);
      flashResolved(fieldKey);
    });
  }

  // Resolve a single correction
  async function resolveOne(c: CorrectionItem) {
    if (!reportId) return;
    return runBusy("RESOLVE", async () => {
      await resolveCorrection(reportId!, c.id, "Fixed");
      const fresh = await getCorrections(reportId!);
      setCorrections(fresh);
      flashResolved(c.fieldKey);
    });
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

  const [comments, setComments] = useState(report?.comments || "");
  const [testedBy, setTestedBy] = useState(report?.testedBy || "");
  const [reviewedBy, setReviewedBy] = useState(report?.reviewedBy || "");
  const [testedDate, setTestedDate] = useState(report?.testedDate || "");
  const [reviewedDate, setReviewedDate] = useState(report?.reviewedDate || "");

  // const lock = (f: string) => !canEdit(role, f);
  // use:
  const lock = (f: string) =>
    forceReadOnly || !canEdit(role, f, status as SterilityReportStatus);

  const { errors, clearError, validateAndSetErrors } = useReportValidation(
    role,
    {
      status: status as ReportStatus, // status-driven PRELIM vs FINAL validation
    },
  );

  type ObsValue = "Growth" | "No Growth" | "";

  function toggleObservation(
    current: ObsValue,
    value: Exclude<ObsValue, "">,
  ): ObsValue {
    // checkbox behavior but mutually exclusive:
    return current === value ? "" : value;
  }

  // ✅ Hydrate all local state from an incoming report
  function hydrateForm(r?: any) {
    // ---- header fields ----
    setClient(
      r?.client ??
        (!r?.id && role === "CLIENT" ? (user?.clientCode ?? "") : ""),
    );
    setDateSent(r?.dateSent ?? "");
    setTypeOfTest(r?.typeOfTest ?? "");
    setSampleType(r?.sampleType ?? "");
    setFormulaNo(r?.formulaNo ?? "");
    setDescription(r?.description ?? "");
    setLotNo(r?.lotNo ?? "");
    setManufactureDate(r?.manufactureDate ?? "");
    setTestSopNo(r?.testSopNo ?? "");
    setDateTested(r?.dateTested ?? "");
    setDateCompleted(r?.dateCompleted ?? "");

    // ---- sterility table ----
    setFtmTurbidity(r?.ftm_turbidity ?? "");
    setFtmObservation(r?.ftm_observation ?? "");
    setFtmResult(r?.ftm_result ?? "");
    setScdbTurbidity(r?.scdb_turbidity ?? "");
    setScdbObservation(r?.scdb_observation ?? "");
    setScdbResult(r?.scdb_result ?? "");

    // ---- comments/signatures ----
    setComments(r?.comments ?? "");
    setTestedBy(r?.testedBy ?? "");
    setTestedDate(r?.testedDate ?? "");
    setReviewedBy(r?.reviewedBy ?? "");
    setReviewedDate(r?.reviewedDate ?? "");
  }

  useEffect(() => {
    if (!isAnyTemplateMode || !templateId) return;

    let alive = true;

    (async () => {
      try {
        const t = await api<any>(`/templates/${templateId}`, { method: "GET" });
        if (!alive) return;

        setTemplateName(t?.name ?? "");
        setTemplateVersion(typeof t?.version === "number" ? t.version : 0);

        hydrateForm(t?.data ?? {});
        setIsDirty(false);
      } catch (e) {
        console.error(e);
        alert("❌ Failed to load template.");
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnyTemplateMode, templateId, role, user?.clientCode]);

  const makeValues = (): SterilityReportFormValues =>
    ({
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

      comments,
      testedBy,
      testedDate,
      dateCompleted,
      reviewedBy,
      reviewedDate,

      // ✅ add these for sterility table
      ftm_turbidity,
      ftm_observation,
      ftm_result,
      scdb_turbidity,
      scdb_observation,
      scdb_result,
    }) as any;

  // ----------- Save handler -----------

  type SavedReport = {
    id: string;
    status: ReportStatus;
    reportNumber?: number | string;
    version?: number;
  };

  const handleSave = async (): Promise<boolean> => {
    return (
      (await runBusy("SAVE", async () => {
        const values = makeValues();

        validateAndSetErrors(values);

        // Build full payload
        const fullPayload: any = {
          client,
          dateSent,
          typeOfTest,
          sampleType,
          formulaNo,
          description,
          lotNo,
          manufactureDate: manufactureDate?.trim() ? manufactureDate : "NA",
          testSopNo,
          dateTested,

          ftm_turbidity,
          ftm_observation,
          ftm_result,
          scdb_turbidity,
          scdb_observation,
          scdb_result,

          dateCompleted,

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
            "dateTested",
            "ftm_turbidity",
            "ftm_observation",
            "ftm_result",
            "scdb_turbidity",
            "scdb_observation",
            "scdb_result",
            "comments",
          ],
          MC: [
            "testSopNo",
            "dateTested",
            "ftm_turbidity",
            "ftm_observation",
            "ftm_result",
            "scdb_turbidity",
            "scdb_observation",
            "scdb_result",
            "comments",
          ],
          QA: ["dateCompleted"],
          CLIENT: [
            "client",
            "dateSent",
            "typeOfTest",
            "sampleType",
            "formulaNo",
            "description",
            "lotNo",
            "manufactureDate",
          ],
        };

        const allowedBase = BASE_ALLOWED[role || "CLIENT"] || [];
        const allowed = allowedBase.includes("*")
          ? Object.keys(fullPayload)
          : allowedBase;

        const payload = Object.fromEntries(
          Object.entries(fullPayload).filter(([k]) => allowed.includes(k)),
        );

        // New reports always start as DRAFT
        if (!reportId) {
          payload.status = "DRAFT";
        }

        try {
          let saved: any;

          if (isTemplateMode) {
            const name = templateName.trim();

            // ✅ Block saving if template name is missing
            if (!name) {
              alert("⚠️ Please enter a Template name before saving.");
              return false;
            }
            // ✅ template payload: store data + formType + name
            const templatePayload = {
              name,
              formType: "STERILITY",
              data: { ...payload }, // store only allowed fields
            };

            if (templateId) {
              saved = await api(`/templates/${templateId}`, {
                method: "PATCH",
                body: JSON.stringify({
                  ...templatePayload,
                  expectedVersion: templateVersion, // ✅ required
                }),
              });

              // bump local version from server
              setTemplateVersion(
                typeof saved.version === "number"
                  ? saved.version
                  : templateVersion + 1,
              );
            } else {
              saved = await api(`/templates`, {
                method: "POST",
                body: JSON.stringify(templatePayload),
              });
              setTemplateId(saved.id);
              setTemplateVersion(
                typeof saved.version === "number" ? saved.version : 1,
              );
            }

            setIsDirty(false);
            alert("✅ Template saved");
            return true;
          }

          if (reportId) {
            saved = await api<SavedReport>(`/reports/${reportId}`, {
              method: "PATCH",
              body: JSON.stringify({
                ...payload,
                reason: "Saving",
                expectedVersion: reportVersion,
              }),
            });
          } else {
            saved = await api(`/reports`, {
              method: "POST",
              body: JSON.stringify({ ...payload, formType: "STERILITY" }),
            });
          }

          setReportId(saved.id); // 👈 keep the new id
          setStatus(saved.status); // in case backend changed it
          setReportNumber(String(saved.reportNumber ?? ""));
          setReportVersion(
            typeof saved.version === "number"
              ? saved.version
              : reportVersion + 1,
          );

          setIsDirty(false);
          alert("✅ Report saved as '" + saved.status + "'");
          return true;
        } catch (err: any) {
          console.error(err);
          if (err?.status === 409 || err?.response?.status === 409) {
            alert(
              "⚠️ Someone else updated this report. Please reload and try again.",
            );
            return false;
          }
          alert("❌ Error saving  report: " + (err.message || "Unknown error"));
          return false;

          return false;
        }
      })) ?? false
    );
  };

  type UpdatedReport = {
    status?: SterilityReportStatus;
    reportNumber?: string;
  };

  async function handleStatusChange(
    newStatus: SterilityReportStatus,
    opts?: { reason?: string; eSignPassword?: string },
  ) {
    return await runBusy("STATUS", async () => {
      // const token = localStorage.getItem("token");
      // const API_BASE = "http://localhost:3000";

      const values = makeValues();
      const okFields = validateAndSetErrors(values);

      if (
        newStatus === "SUBMITTED_BY_CLIENT" ||
        newStatus === "RECEIVED_BY_FRONTDESK" ||
        newStatus === "UNDER_TESTING_REVIEW" ||
        newStatus === "UNDER_RESUBMISSION_TESTING_REVIEW" ||
        newStatus === "UNDER_CLIENT_REVIEW" ||
        newStatus === "RESUBMISSION_BY_CLIENT" ||
        newStatus === "UNDER_ADMIN_REVIEW" ||
        newStatus === "UNDER_QA_REVIEW" ||
        newStatus === "QA_NEEDS_CORRECTION" ||
        newStatus === "ADMIN_NEEDS_CORRECTION" ||
        newStatus === "ADMIN_REJECTED" ||
        newStatus === "CLIENT_NEEDS_CORRECTION" ||
        newStatus === "TESTING_ON_HOLD" ||
        newStatus === "TESTING_NEEDS_CORRECTION" ||
        newStatus === "FRONTDESK_ON_HOLD" ||
        newStatus === "FRONTDESK_NEEDS_CORRECTION" ||
        newStatus === "LOCKED" ||
        newStatus === "APPROVED"
      ) {
        if (!okFields) {
          alert("⚠️ Please fix the highlighted fields before changing status.");
          return;
        }
      }

      // ensure latest edits are saved
      if (!reportId || isDirty) {
        const saved = await handleSave();
        if (!saved) return;
      }

      try {
        let updated: UpdatedReport;
        updated = await api<UpdatedReport>(`/reports/${reportId}/status`, {
          method: "PATCH",
          // Server expects: status (always), reason (required for critical fields incl. status),
          // and eSignPassword when moving to UNDER_CLIENT_FINAL_REVIEW or LOCKED.
          body: JSON.stringify({
            status: newStatus,
            reason: opts?.reason ?? "Changing Status",
            eSignPassword: opts?.eSignPassword ?? undefined,
            expectedVersion: reportVersion,
          }),
        });

        // if (!res.ok) throw new Error(`Status update failed: ${res.statusText}`);
        // const updated: { status?: ReportStatus; reportNumber?: string } =
        //   await res.json();

        setStatus(updated.status ?? newStatus);
        setReportNumber(updated.reportNumber || reportNumber);
        setIsDirty(false);
        alert(`✅ Status changed to ${newStatus}`);
        if (role === "CLIENT") {
          navigate("/clientDashboard");
        } else if (role === "FRONTDESK") {
          navigate("/frontdeskDashboard");
        } else if (role === "MICRO") {
          navigate("/microDashboard");
        } else if (role === "MC") {
          navigate("/mcDashboard");
        } else if (role === "QA") {
          navigate("/qaDashboard");
        } else if (role === "ADMIN") {
          navigate("/adminDashboard");
        } else if (role === "SYSTEMADMIN") {
          navigate("/systemAdminDashboard");
        }
      } catch (err: any) {
        console.error(err);
        alert("❌ Error changing status: " + err.message);
      }
    });
  }

  function markDirty() {
    if (!isDirty) setIsDirty(true);
  }

  function formatDateForInput(value: string | null) {
    if (!value) return "";
    if (value === "NA") return "NA";
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

  const fallbackRoute = useMemo(() => {
    if (role === "CLIENT") return "/clientDashboard";
    if (role === "FRONTDESK") return "/frontdeskDashboard";
    if (role === "QA") return "/qaDashboard";
    if (role === "ADMIN") return "/adminDashboard";
    if (role === "SYSTEMADMIN") return "/systemAdminDashboard";
    return "/";
  }, [role]);

  const handleClose = () => {
    if (onClose) return onClose();

    // If opened from Gmail, history may not have a previous in-app page
    if (window.history.length > 1) navigate(-1);
    else navigate(fallbackRoute, { replace: true });
  };

  // any open correction = red
  // const hasOpenCorrection = (field: string) => !!corrByField[field];
  const hasOpenCorrection = (keyOrPrefix: string) =>
    openCorrections.some(
      (c) =>
        c.fieldKey === keyOrPrefix || c.fieldKey.startsWith(`${keyOrPrefix}:`),
    );
  // let Admin/Micro resolve even if the key is nested under "pathogens:*"

  type BusyAction =
    | null
    | "SAVE"
    | "STATUS"
    | "ESIGN_CONFIRM"
    | "SEND_CORRECTIONS"
    | "ADD_CORRECTION"
    | "RESOLVE";

  const [busy, setBusy] = useState<BusyAction>(null);
  const busyRef = useRef(false);

  const isBusy = busy !== null;

  async function runBusy<T>(
    action: Exclude<BusyAction, null>,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    if (busyRef.current) return; // 🚫 prevent double click
    busyRef.current = true;
    setBusy(action);

    try {
      return await fn();
    } finally {
      setBusy(null);
      busyRef.current = false;
    }
  }

  const [hasAttachment, setHasAttachment] = useState(false);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);

  async function refreshHasAttachment(id: string) {
    setAttachmentsLoading(true);
    try {
      // ✅ Use the endpoint you already have for listing attachments.
      // Examples (pick the one your API actually supports):
      //   GET /reports/:id/attachments
      //   GET /reports/:id/attachments/meta
      //   GET /reports/:id/attachments/list
      const list = await api<any[]>(`/reports/${id}/attachments`, {
        method: "GET",
      });
      setHasAttachment(Array.isArray(list) && list.length > 0);
    } catch {
      // fail closed (treat as no attachment)
      setHasAttachment(false);
    } finally {
      setAttachmentsLoading(false);
    }
  }

  useEffect(() => {
    if (!reportId) return;
    refreshHasAttachment(reportId);
  }, [reportId]);

  const APPROVE_REQUIRES_ATTACHMENT = new Set<SterilityReportStatus>([
    "UNDER_CLIENT_REVIEW",
  ]);

  function isApproveAction(targetStatus: SterilityReportStatus) {
    return APPROVE_REQUIRES_ATTACHMENT.has(targetStatus);
  }

  // ✅ JJL-only dropdown behavior
  const isJJL = (client ?? "").trim().toUpperCase() === "JJL";

  const HIDE_SIGNATURES_FOR = new Set<ReportStatus>([
    "DRAFT",
    "SUBMITTED_BY_CLIENT",
  ]);
  const showSignatures = !HIDE_SIGNATURES_FOR.has(status as ReportStatus);

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  return (
    <>
      <div className="sheet mx-auto max-w-[800px] bg-white text-black border border-black shadow print:shadow-none p-4">
        <PrintStyles />
        <DashStyles />

        {isTemplateViewMode && (
          <div className="no-print mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Viewing template: <b>{templateName || "Untitled"}</b> (read-only)
          </div>
        )}

        {/* Header + print controls */}
        <div className="no-print mb-4 flex justify-end gap-2">
          {isAnyTemplateMode && !isTemplateViewMode && (
            <input
              className={`mr-auto w-72 rounded-md border px-3 py-1 text-sm ${
                !templateName.trim()
                  ? "border-red-500 ring-1 ring-red-500"
                  : "border-black/30"
              }`}
              placeholder="Template name"
              value={templateName}
              onChange={(e) => {
                setTemplateName(e.target.value);
                markDirty();
              }}
            />
          )}
          <button
            className="px-3 py-1 rounded-md border bg-gray-600 text-white"
            onClick={handleClose}
            disabled={isBusy}
          >
            {isBusy ? "Working..." : "Close"}
          </button>
          {/* <button
          </button> */}
          {!isTemplateViewMode &&
            !HIDE_SAVE_FOR.has(status as SterilityReportStatus) && (
              <button
                className="px-3 py-1 rounded-md border bg-blue-600 text-white disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                onClick={handleSave}
                disabled={
                  role === "SYSTEMADMIN" ||
                  role === "FRONTDESK" ||
                  isBusy ||
                  status === "UNDER_CLIENT_FINAL_REVIEW" ||
                  status === "LOCKED" ||
                  (isTemplateMode && !templateName.trim())
                }
              >
                {busy === "SAVE" && <Spinner />}
                {isTemplateMode
                  ? templateId
                    ? "Update Template"
                    : "Save Template"
                  : reportId
                    ? "Update Report"
                    : "Save Report"}
              </button>
            )}
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
              {status === "DRAFT" || status === "SUBMITTED_BY_CLIENT"
                ? "STERILITY SUBMISSION FORM"
                : "STERILITY REPORT"}
            </div>
            <div className="text-right text-[12px] font-bold font-medium">
              {!isTemplateMode && reportNumber ? <> {reportNumber}</> : null}
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
                  value={client.toUpperCase()}
                  onChange={(e) => {
                    setClient(e.target.value.toUpperCase());
                    markDirty();
                  }}
                  // disabled={role === "CLIENT"}
                />
              )}
            </div>

            <div
              id="f-dateSent"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("dateSent");
                setAddMessage("");
              }}
              className={`px-2 flex items-center gap-1 relative ${dashClass(
                "dateSent",
              )}`}
            >
              {/* <ResolveOverlay field="dateSent" /> */}
              <div className="whitespace-nowrap font-medium">DATE SENT:</div>
              <FieldErrorBadge name="dateSent" errors={errors} />
              <ResolveOverlay field="dateSent" />

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
                  min={todayISO()}
                  value={formatDateForInput(dateSent)}
                  onChange={(e) => {
                    setDateSent(e.target.value);
                    clearError("dateSent");
                    markDirty();
                  }}
                  aria-invalid={!!errors.dateSent}
                />
              )}
            </div>
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
                "typeOfTest",
              )}`}
            >
              <div className="font-medium whitespace-nowrap">TYPE OF TEST:</div>
              {/* tiny floating badge; does not affect layout */}
              <FieldErrorBadge name="typeOfTest" errors={errors} />
              <ResolveOverlay field="typeOfTest" />
              {lock("typeOfTest") ? (
                <div className="flex-1 min-h-[14px]">{typeOfTest}</div>
              ) : (
                <div className="flex-1 min-w-0">
                  <input
                    list="typeOfTest-options"
                    className={`w-full input-editable py-[2px] text-[12px] leading-snug border ${
                      errors.typeOfTest
                        ? "border-red-500 ring-1 ring-red-500"
                        : "border-black/70"
                    } ${
                      hasCorrection("typeOfTest")
                        ? "ring-2 ring-rose-500 animate-pulse"
                        : ""
                    }`}
                    value={typeOfTest}
                    onChange={(e) => {
                      setTypeOfTest(e.target.value);
                      clearError("typeOfTest");
                      markDirty();
                    }}
                    placeholder={isJJL ? "Select or type..." : ""}
                    aria-invalid={!!errors.typeOfTest}
                  />

                  {/* <datalist id="typeOfTest-options">
                    {(isJJL ? JJL_TYPE_OF_TEST_OPTIONS : []).map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist> */}
                </div>
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
                "sampleType",
              )}`}
            >
              <div className="font-medium whitespace-nowrap">SAMPLE TYPE:</div>
              <FieldErrorBadge name="sampleType" errors={errors} />
              <ResolveOverlay field="sampleType" />

              {lock("sampleType") ? (
                <div className="flex-1 min-h-[14px]">{sampleType}</div>
              ) : (
                <div className="flex-1 min-w-0">
                  <input
                    list="sampleType-options"
                    className={`w-full input-editable py-[2px] text-[12px] leading-snug border ${
                      errors.sampleType
                        ? "border-red-500 ring-1 ring-red-500"
                        : "border-black/70"
                    } ${
                      hasCorrection("sampleType")
                        ? "ring-2 ring-rose-500 animate-pulse"
                        : ""
                    }`}
                    value={sampleType}
                    onChange={(e) => {
                      setSampleType(e.target.value);
                      clearError("sampleType");
                      markDirty();
                    }}
                    placeholder={isJJL ? "Select or type..." : ""}
                    aria-invalid={!!errors.sampleType}
                  />

                  {/* <datalist id="sampleType-options">
                    {(isJJL ? JJL_SAMPLE_TYPE_OPTIONS : []).map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist> */}
                </div>
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
              "description",
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
                "lotNo",
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
                "manufactureDate",
              )}`}
            >
              <div className="font-medium whitespace-nowrap">
                MANUFACTURE DATE:
              </div>
              <FieldErrorBadge name="manufactureDate" errors={errors} />
              <ResolveOverlay field="manufactureDate" />
              {lock("manufactureDate") ? (
                <div className="flex-1  min-h-[14px]">
                  {manufactureDate ? formatDateForInput(manufactureDate) : "NA"}
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
                  // min={todayISO()}
                  value={
                    manufactureDate ? formatDateForInput(manufactureDate) : "NA"
                  }
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
                "testSopNo",
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
                "dateTested",
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
                  min={todayISO()}
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

          {/* DATE COMPLETED (full row, label + input) */}
          <div
            id="f-dateCompleted"
            onClick={() => {
              if (!selectingCorrections) return;
              setAddForField("dateCompleted");
              setAddMessage("");
            }}
            className={` flex items-center gap-2 px-2 text-[12px] leading-snug relative ${dashClass(
              "dateCompleted",
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
                min={todayISO()}
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

        {/* <div className="p-2 font-bold">TBC / TFC RESULTS:</div> */}

        {/* TBC/TFC table */}
        <div className="mt-12 border border-black">
          <div className="grid grid-cols-[35%_15%_30%_20%] text-[12px] text-center items-center font-semibold border-b border-black">
            <div className="p-2  border-r border-black">MEDIA</div>
            <div className="p-2 border-r border-black">TURBIDITY</div>
            <div className="p-2 border-r border-black">OBSERVATION</div>
            <div className="p-2 border-r border-black">RESULT</div>
            {/* <div className="p-2">SPECIFICATION</div> */}
          </div>

          {/* Row 1: FTM */}
          <div className="grid grid-cols-[35%_15%_30%_20%] text-[12px] border-b border-black">
            <div className="py-1 px-2 font-bold border-r border-black">
              Fluid Thioglycollate Medium (FTM)
            </div>
            {/* TURBIDITY (input) */}
            <div
              id="f-ftm_turbidity"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("ftm_turbidity");
                setAddMessage("");
              }}
              className={`py-1 px-2 border-r border-black flex relative ${dashClass("ftm_turbidity")}`}
            >
              <FieldErrorBadge name="ftm_turbidity" errors={errors} />
              <ResolveOverlay field="ftm_turbidity" />
              <input
                className={`w-full input-editable px-1 border ${
                  !lock("ftm_turbidity") && (errors as any).ftm_turbidity
                    ? "border-red-500 ring-1 ring-red-500"
                    : "border-black/70"
                } ${hasCorrection("ftm_turbidity") ? "ring-2 ring-rose-500 animate-pulse" : ""}`}
                value={ftm_turbidity}
                onChange={(e) => {
                  setFtmTurbidity(e.target.value);
                  clearError("ftm_turbidity" as any);
                  markDirty();
                }}
                readOnly={lock("ftm_turbidity")}
              />
            </div>
            {/* OBSERVATION (Growth / No Growth checkboxes) */}
            <div
              id="f-ftm_observation"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("ftm_observation");
                setAddMessage("");
              }}
              className={`py-1 px-2 border-r border-black flex items-center gap-3 relative ${dashClass("ftm_observation")}`}
            >
              <FieldErrorBadge name="ftm_observation" errors={errors} />
              <ResolveOverlay field="ftm_observation" />

              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={ftm_observation === "Growth"}
                  disabled={lock("ftm_observation")}
                  onChange={() => {
                    setFtmObservation((prev: any) =>
                      toggleObservation(prev, "Growth"),
                    );
                    clearError("ftm_observation" as any);
                    markDirty();
                  }}
                />
                <span>Growth</span>
              </label>

              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={ftm_observation === "No Growth"}
                  disabled={lock("ftm_observation")}
                  onChange={() => {
                    setFtmObservation((prev: any) =>
                      toggleObservation(prev, "No Growth"),
                    );
                    clearError("ftm_observation" as any);
                    markDirty();
                  }}
                />
                <span>No Growth</span>
              </label>
            </div>
            {/* RESULT (input) */}
            <div
              id="f-ftm_result"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("ftm_result");
                setAddMessage("");
              }}
              className={`py-1 px-2 border-r border-black flex relative ${dashClass("ftm_result")}`}
            >
              <FieldErrorBadge name="ftm_result" errors={errors} />
              <ResolveOverlay field="ftm_result" />
              <input
                className={`w-full input-editable px-1 border ${
                  !lock("ftm_result") && (errors as any).ftm_result
                    ? "border-red-500 ring-1 ring-red-500"
                    : "border-black/70"
                } ${hasCorrection("ftm_result") ? "ring-2 ring-rose-500 animate-pulse" : ""}`}
                value={ftm_result}
                onChange={(e) => {
                  setFtmResult(e.target.value);
                  clearError("ftm_result" as any);
                  markDirty();
                }}
                readOnly={lock("ftm_result")}
              />
            </div>
            <div className="py-1 px-2" />{" "}
            {/* keep last col width (28%) if you want spacing */}
          </div>

          {/* Row 2: SCDB */}
          <div className="grid grid-cols-[35%_15%_30%_20%] text-[12px]">
            <div className="py-1 px-2 font-bold border-r border-black">
              Soybean Casein Digest Broth (SCDB)
            </div>

            {/* TURBIDITY (input) */}
            <div
              id="f-scdb_turbidity"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("scdb_turbidity");
                setAddMessage("");
              }}
              className={`py-1 px-2 border-r border-black flex relative ${dashClass("scdb_turbidity")}`}
            >
              <FieldErrorBadge name="scdb_turbidity" errors={errors} />
              <ResolveOverlay field="scdb_turbidity" />
              <input
                className={`w-full input-editable px-1 border ${
                  !lock("scdb_turbidity") && (errors as any).scdb_turbidity
                    ? "border-red-500 ring-1 ring-red-500"
                    : "border-black/70"
                } ${hasCorrection("scdb_turbidity") ? "ring-2 ring-rose-500 animate-pulse" : ""}`}
                value={scdb_turbidity}
                onChange={(e) => {
                  setScdbTurbidity(e.target.value);
                  clearError("scdb_turbidity" as any);
                  markDirty();
                }}
                readOnly={lock("scdb_turbidity")}
              />
            </div>

            {/* OBSERVATION (Growth / No Growth checkboxes) */}
            <div
              id="f-scdb_observation"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("scdb_observation");
                setAddMessage("");
              }}
              className={`py-1 px-2 border-r border-black flex items-center gap-3 relative ${dashClass("scdb_observation")}`}
            >
              <FieldErrorBadge name="scdb_observation" errors={errors} />
              <ResolveOverlay field="scdb_observation" />

              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={scdb_observation === "Growth"}
                  disabled={lock("scdb_observation")}
                  onChange={() => {
                    setScdbObservation((prev: any) =>
                      toggleObservation(prev, "Growth"),
                    );
                    clearError("scdb_observation" as any);
                    markDirty();
                  }}
                />
                <span>Growth</span>
              </label>

              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={scdb_observation === "No Growth"}
                  disabled={lock("scdb_observation")}
                  onChange={() => {
                    setScdbObservation((prev: any) =>
                      toggleObservation(prev, "No Growth"),
                    );
                    clearError("scdb_observation" as any);
                    markDirty();
                  }}
                />
                <span>No Growth</span>
              </label>
            </div>

            {/* RESULT (input) */}
            <div
              id="f-scdb_result"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("scdb_result");
                setAddMessage("");
              }}
              className={`py-1 px-2 border-r border-black flex relative ${dashClass("scdb_result")}`}
            >
              <FieldErrorBadge name="scdb_result" errors={errors} />
              <ResolveOverlay field="scdb_result" />
              <input
                className={`w-full input-editable px-1 border ${
                  !lock("scdb_result") && (errors as any).scdb_result
                    ? "border-red-500 ring-1 ring-red-500"
                    : "border-black/70"
                } ${hasCorrection("scdb_result") ? "ring-2 ring-rose-500 animate-pulse" : ""}`}
                value={scdb_result}
                onChange={(e) => {
                  setScdbResult(e.target.value);
                  clearError("scdb_result" as any);
                  markDirty();
                }}
                readOnly={lock("scdb_result")}
              />
            </div>

            <div className="py-1 px-2" />
          </div>
        </div>
        {/* ----- Volume of sample table + notes (from image) ----- */}
        <div className="mt-10 text-[12px] leading-snug">
          <div className="mb-2 font-semibold text-[13px]">
            Volume of sample used during the test is defined in the table based
            on the volume of final product.
          </div>

          <div className="border border-black">
            <div className="grid grid-cols-2 border-b border-black font-semibold">
              <div className="px-2 py-1 border-r border-black font-bold items-center text-center">
                Volume of Final Product
              </div>
              <div className="px-2 py-1 font-bold items-center text-center">
                Volume used for Each Sample
              </div>
            </div>

            <div className="grid grid-cols-2 border-b border-black items-center text-center">
              <div className="px-2 py-1 border-r border-black">&lt; 1 ml</div>
              <div className="px-2 py-1">Entire Unit</div>
            </div>

            <div className="grid grid-cols-2 border-b border-black items-center text-center">
              <div className="px-2 py-1 border-r border-black">1-40 ml</div>
              <div className="px-2 py-1">50% of Volume but NLT 1 ml</div>
            </div>

            <div className="grid grid-cols-2 border-b border-black items-center text-center">
              <div className="px-2 py-1 border-r border-black">41-100 ml</div>
              <div className="px-2 py-1">20 ml</div>
            </div>

            <div className="grid grid-cols-2 items-center text-center">
              <div className="px-2 py-1 border-r border-black">&gt; 100 ml</div>
              <div className="px-2 py-1">10% of volume but at least 20 ml</div>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <div>
              The Fluid Thioglycollate Medium (FTM) tests for Anaerobic
              Bacteria, but will also grow Aerobic Bacteria is incubated for 14
              days at 32.5 ± 2.5°C.
            </div>

            <div>
              The Soybean Casein Digest Medium (SCDM) tests for Aerobic Bacteria
              and Fungi is incubated for 14 days at 22.5
            </div>

            <div>
              No Growth was observed in the Negative Control. Growth was
              observed in the Positive Control.
            </div>

            <div className="font-semibold">
              Abbreviations (+) <span className="underline">Growth</span> (-) No
              Growth (P) Pass F (Fail) NI (Not Interpreted)
            </div>
          </div>
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
            <div className=" font-medium  mb-1 flex items-center gap-5">
              Comments :{" "}
            </div>
            <FieldErrorBadge name="comments" errors={errors} />
            <ResolveOverlay field="comments" />
            <input
              className={`flex-1 border-0 border-b text-[12px] outline-none focus:border-blue-500 focus:ring-0 pl-2 ${
                errors.comments ? "border-b-red-500" : "border-b-black/70"
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

          {showSignatures && (
            <>
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
                  <FieldErrorBadge name="testedBy" errors={errors} />
                  <ResolveOverlay field="testedBy" />
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
                    "testedDate",
                  )}`}
                >
                  DATE:
                  <FieldErrorBadge name="testedDate" errors={errors} />
                  <ResolveOverlay field="testedDate" />
                  <input
                    className={`flex-1 border-0 border-b text-[12px] outline-none focus:border-blue-500 focus:ring-0 ${
                      errors.testedDate
                        ? "border-b-red-500"
                        : "border-b-black/70"
                    } ${
                      hasCorrection("testedDate")
                        ? "ring-2 ring-rose-500 animate-pulse"
                        : ""
                    }`}
                    type="date"
                    min={todayISO()}
                    value={formatDateForInput(testedDate)}
                    onChange={(e) => {
                      setTestedDate(e.target.value);
                      clearError("testedDate");
                    }}
                    readOnly={lock("testedDate")}
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
                      errors.reviewedBy
                        ? "border-b-red-500"
                        : "border-b-black/70"
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
                    "reviewedDate",
                  )}`}
                >
                  DATE:
                  <FieldErrorBadge name="reviewedDate" errors={errors} />
                  <ResolveOverlay field="reviewedDate" />
                  <input
                    className={`flex-1 border-0 border-b text-[12px] outline-none focus:border-blue-500 focus:ring-0 ${
                      errors.reviewedDate
                        ? "border-b-red-500"
                        : "border-b-black/70"
                    } ${
                      hasCorrection("reviewedDate")
                        ? "ring-2 ring-rose-500 animate-pulse"
                        : ""
                    }`}
                    type="date"
                    min={todayISO()}
                    value={formatDateForInput(reviewedDate)}
                    onChange={(e) => {
                      setReviewedDate(e.target.value);
                      clearError("reviewedDate");
                    }}
                    readOnly={lock("reviewedDate")}
                    aria-invalid={!!errors.reviewedDate}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions row: submit/reject on left, close on right */}
      {!isAnyTemplateMode && (
        <div className="no-print mt-4 flex items-center justify-between">
          {/* Left: status action buttons */}
          <div className="flex flex-wrap gap-2">
            {STERILITY_STATUS_TRANSITIONS[
              status as SterilityReportStatus
            ]?.next.map((targetStatus: SterilityReportStatus) => {
              if (
                STERILITY_STATUS_TRANSITIONS[
                  status as SterilityReportStatus
                ].canSet.includes(role!) &&
                statusButtons[targetStatus]
              ) {
                const { label, color } = statusButtons[targetStatus];

                const approveNeedsAttachment = isApproveAction(targetStatus);
                const disableApproveForNoAttachment =
                  approveNeedsAttachment && !hasAttachment;

                const disabled =
                  role === "SYSTEMADMIN" ||
                  isBusy ||
                  attachmentsLoading ||
                  disableApproveForNoAttachment;

                return (
                  <button
                    key={targetStatus}
                    className={`px-4 py-2 rounded-md border text-white ${color} disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2`}
                    onClick={() => requestStatusChange(targetStatus)}
                    disabled={disabled}
                    title={
                      disableApproveForNoAttachment
                        ? "Upload at least 1 attachment to enable Approve"
                        : undefined
                    }
                  >
                    {busy === "STATUS" && <Spinner />}
                    {attachmentsLoading && label === "Approve"
                      ? "Checking..."
                      : label}
                  </button>
                );
              }
              return null;
            })}
          </div>
        </div>
      )}
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
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                disabled={
                  isBusy ||
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
                {busy === "STATUS" && <Spinner />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {!isTemplateViewMode && selectingCorrections && (
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
                      prev.filter((_, idx) => idx !== i),
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
              onClick={() =>
                runBusy("SEND_CORRECTIONS", async () => {
                  await createCorrections(
                    reportId!,
                    pendingCorrections,
                    pendingStatus!,
                    "Corrections requested",
                    reportVersion,
                  );

                  setSelectingCorrections(false);
                  setPendingCorrections([]);

                  const fresh = await getCorrections(reportId!);
                  setCorrections(fresh);
                  setStatus(pendingStatus!);
                  setPendingStatus(null);
                  if (role === "CLIENT") {
                    navigate("/clientDashboard");
                  } else if (role === "FRONTDESK") {
                    navigate("/frontdeskDashboard");
                  } else if (role === "MICRO") {
                    navigate("/microDashboard");
                  } else if (role === "MC") {
                    navigate("/mcDashboard");
                  } else if (role === "QA") {
                    navigate("/qaDashboard");
                  } else if (role === "ADMIN") {
                    navigate("/adminDashboard");
                  } else if (role === "SYSTEMADMIN") {
                    navigate("/systemAdminDashboard");
                  }
                })
              }
            >
              {busy === "SEND_CORRECTIONS" && <Spinner />}
              Send corrections
            </button>
          </div>
        </div>
      )}

      {!isTemplateViewMode && addForField && (
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
                onClick={() =>
                  runBusy("ADD_CORRECTION", async () => {
                    setPendingCorrections((prev) => [
                      ...prev,
                      {
                        fieldKey: addForField!,
                        message: addMessage.trim(),
                        oldValue: getFieldDisplayValue(addForField!),
                      },
                    ]);

                    setAddForField(null);
                    setAddMessage("");
                  })
                }
              >
                {busy === "ADD_CORRECTION" && <Spinner />}
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Corrections button */}
      {!isTemplateViewMode && (
        <div className="no-print fixed bottom-20 right-6 z-40">
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
      )}

      {!isTemplateViewMode && showCorrTray && (
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
                  <div className="mt-1"> Reason : {c.message}</div>
                  {c.oldValue != null && String(c.oldValue).trim() !== "" && (
                    <div className="mt-1 text-xs text-slate-600">
                      <span className="font-medium">Old Value :</span>{" "}
                      <span className="break-words">
                        {typeof c.oldValue === "string"
                          ? c.oldValue
                          : JSON.stringify(c.oldValue)}
                      </span>
                    </div>
                  )}

                  <div className="mt-2 flex gap-2">
                    <button
                      className="text-xs font-medium text-emerald-700 hover:underline"
                      onClick={() => resolveOne(c)}
                    >
                      {busy === "RESOLVE" && <SpinnerDark />}✓ Mark resolved
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
