import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useBlocker, useLocation, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import {
  createCorrections,
  FieldErrorBadge,
  getCorrections,
  resolveCorrection,
  useReportValidation,
  type CorrectionItem,
  type ApeReportFormValues,
  type ReportStatus,
  type Role,
} from "../../utils/apeReportValidation";
import {
  JJL_SAMPLE_TYPE_OPTIONS,
  JJL_TYPE_OF_TEST_OPTIONS,
  todayISO,
} from "../../utils/microMixReportFormWorkflow";
import { APE_STATUS_TRANSITIONS } from "../../utils/apeReportFormWorkflow";

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
  UNDER_DRAFT_REVIEW: { label: "Review", color: "bg-slate-700" },
  SUBMITTED_BY_CLIENT: { label: "Submit", color: "bg-green-600" },

  RECEIVED_BY_FRONTDESK: { label: "Approve", color: "bg-green-600" },
  FRONTDESK_ON_HOLD: { label: "Hold", color: "bg-red-500" },
  FRONTDESK_NEEDS_CORRECTION: {
    label: "Needs Correction",
    color: "bg-yellow-600",
  },

  UNDER_CLIENT_REVIEW: { label: "Approve", color: "bg-green-600" },
  CLIENT_NEEDS_CORRECTION: {
    label: "Needs Correction",
    color: "bg-yellow-600",
  },
  UNDER_CLIENT_CORRECTION: {
    label: "Correct",
    color: "bg-blue-600",
  },
  RESUBMISSION_BY_CLIENT: {
    label: "Resubmit",
    color: "bg-blue-600",
  },

  UNDER_TESTING_REVIEW: { label: "Approve", color: "bg-green-600" },
  TESTING_ON_HOLD: { label: "Hold", color: "bg-red-500" },
  TESTING_NEEDS_CORRECTION: {
    label: "Needs Correction",
    color: "bg-yellow-600",
  },
  RESUBMISSION_BY_TESTING: {
    label: "Resubmit",
    color: "bg-blue-600",
  },
  UNDER_RESUBMISSION_TESTING_REVIEW: {
    label: "Approve",
    color: "bg-blue-600",
  },

  UNDER_QA_REVIEW: { label: "Approve", color: "bg-green-600" },
  QA_NEEDS_CORRECTION: {
    label: "Needs Correction",
    color: "bg-yellow-600",
  },
  UNDER_RESUBMISSION_QA_REVIEW: {
    label: "Approve",
    color: "bg-blue-700",
  },

  UNDER_ADMIN_REVIEW: { label: "Approve", color: "bg-green-700" },
  ADMIN_NEEDS_CORRECTION: {
    label: "Needs Correction",
    color: "bg-yellow-600",
  },
  ADMIN_REJECTED: { label: "Reject", color: "bg-red-700" },
  UNDER_RESUBMISSION_ADMIN_REVIEW: {
    label: "Approve",
    color: "bg-blue-700",
  },

  APPROVED: { label: "Approve", color: "bg-green-700" },
  LOCKED: { label: "Lock", color: "bg-slate-700" },
  VOID: { label: "Void", color: "bg-red-700" },

  CHANGE_REQUESTED: { label: "Request Change", color: "bg-amber-500" },
  UNDER_CHANGE_UPDATE: { label: "Approve", color: "bg-green-800" },
  CORRECTION_REQUESTED: { label: "Request Correction", color: "bg-rose-600" },
  UNDER_CORRECTION_UPDATE: { label: "Approve", color: "bg-green-800" },
};

// A small helper to lock fields per role (frontend hint; backend is the source of truth)
function canEdit(role: Role | undefined, field: string, status?: ReportStatus) {
  if (!role || !status) return false;
  const transition = APE_STATUS_TRANSITIONS[status]; // ✅ safe now
  if (!transition || !transition.canEdit?.includes(role)) {
    return false;
  }

  const map: Record<Role, string[]> = {
    SYSTEMADMIN: ["*"],
    ADMIN: [
      "testSopNo",
      "dateTested",
      "organisms",
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
    MICRO: ["testSopNo", "dateTested", "dateCompleted", "comments"],
    MC: ["testSopNo", "dateTested", "dateCompleted", "comments"],
    QA: ["comments"],
    CLIENT: [
      "client",
      "dateSent",
      "typeOfTest",
      "sampleType",
      "formulaNo",
      "description",
      "lotNo",
      "manufactureDate",
      "organisms",
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

type CorrectionLaunchKind = "REQUEST_CHANGE" | "RAISE_CORRECTION";

type ApeReportFormProps = {
  report?: any;
  onClose?: () => void;

  embedded?: boolean;
  pageMode?: "VIEW" | "UPDATE";
  hideTopActions?: boolean;
  hideBottomActions?: boolean;
  forcePageReadOnly?: boolean;
  onSaved?: (updated: any) => void;
  onStatusChanged?: (updated: any) => void;

  correctionLaunch?: boolean;
  correctionKinds?: CorrectionLaunchKind[];
  isWorkspaceActive?: boolean;
};

const HIDE_SAVE_FOR = new Set<ReportStatus>(["APPROVED", "LOCKED"]);

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

export default function ApeReportForm({
  report,
  onClose,
  embedded = false,
  pageMode = "UPDATE",
  hideTopActions = false,
  hideBottomActions = false,
  forcePageReadOnly = false,
  onSaved,
  onStatusChanged,
  correctionLaunch = false,
  correctionKinds = [],
  isWorkspaceActive = true,
}: ApeReportFormProps) {
  const { user } = useAuth();
  const role = user?.role as Role | undefined;

  const currentUserDisplayName = String(
    (user as any)?.name ||
      (user as any)?.fullName ||
      (user as any)?.email ||
      (user as any)?.userId ||
      "",
  ).trim();

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

  function looksLikeUuid(value?: string | null) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value || "").trim(),
    );
  }

  const [createdByName, setCreatedByName] = useState<string>(() => {
    const explicitName = String(
      report?.createdByName ||
        report?.creatorName ||
        report?.createdByUser?.name ||
        "",
    ).trim();

    if (explicitName && !looksLikeUuid(explicitName)) {
      return explicitName;
    }

    if (!report?.id) {
      return currentUserDisplayName;
    }

    return "";
  });

  useEffect(() => {
    if (!report?.id) return;

    setReportId(report.id);

    if (report.status) {
      setStatus(report.status);
    }

    setReportNumber(report.reportNumber ? String(report.reportNumber) : "");

    if (typeof report.version === "number") {
      setReportVersion(report.version);
    }
  }, [report?.id, report?.status, report?.reportNumber, report?.version]);

  useEffect(() => {
    let cancelled = false;

    async function loadCreatedByName() {
      const suppliedName = String(
        report?.createdByName ||
          report?.creatorName ||
          report?.createdByUser?.name ||
          "",
      ).trim();

      if (suppliedName && !looksLikeUuid(suppliedName)) {
        if (!cancelled) {
          setCreatedByName(suppliedName);
        }
        return;
      }

      if (!reportId) {
        if (!cancelled) {
          setCreatedByName(currentUserDisplayName);
        }
        return;
      }

      try {
        const fullReport = await api<any>(`/reports/${reportId}`, {
          method: "GET",
        });

        const creatorName = String(
          fullReport?.createdByName ||
            fullReport?.creatorName ||
            fullReport?.createdByUser?.name ||
            "",
        ).trim();

        if (creatorName && !looksLikeUuid(creatorName)) {
          if (!cancelled) {
            setCreatedByName(creatorName);
          }
          return;
        }
      } catch (error) {
        console.error("Failed to resolve APE creator:", error);
      }

      if (!cancelled) {
        setCreatedByName("");
      }
    }

    loadCreatedByName();

    return () => {
      cancelled = true;
    };
  }, [
    reportId,
    report?.createdBy,
    report?.createdByName,
    report?.creatorName,
    currentUserDisplayName,
  ]);

  // //To set clientCode automatically when creating a new report
  // const initialClientValue = report?.client || (role === "CLIENT" ? user?.clientCode || "" : "");

  // ---- local state (prefill from report if editing) ----
  // const [client, setClient] = useState(initialClientValue);
  const [client, setClient] = useState(
    report?.client ??
      (!report?.id && role === "CLIENT" ? (user?.clientCode ?? "") : ""),
  );
  const [dateSent, setDateSent] = useState(() => {
    // Existing saved report: keep saved date
    if (report?.id) {
      return report?.dateSent || todayISO();
    }

    // New form / template selected to create form: always today
    return todayISO();
  });
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

  type ApeOrganismRow = {
    key: string;
    label: string;
    checked: boolean;
  };

  const apeOrganismDefaults: ApeOrganismRow[] = [
    { key: "E_COLI", label: "E.coli", checked: true },
    { key: "P_AERUGINOSA", label: "p.aeruginosa", checked: true },
    { key: "S_AUREUS", label: "s.aureus", checked: true },
    { key: "C_ALBICANS", label: "c.albicans", checked: true },
    { key: "A_NIGER", label: "A.niger", checked: true },
    { key: "B_CEPACIA", label: "B.cepacia", checked: false },
  ];

  const [organisms, setOrganisms] = useState<ApeOrganismRow[]>(() => {
    if (Array.isArray(report?.organisms) && report.organisms.length > 0) {
      return report.organisms;
    }

    return apeOrganismDefaults;
  });

  function setOrganismChecked(idx: number, checked: boolean) {
    setOrganisms((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], checked };
      return copy;
    });

    clearError("organisms");
    markDirty();
  }

  // --- E-Sign modal state (Admin-only) ---
  // Admin E-sign modal state
  const [showESign, setShowESign] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<ReportStatus | null>(null);
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

  const [correctionActionOpen, setCorrectionActionOpen] = useState(false);

  const location = useLocation();
  const { search, state } = location;
  const params = useMemo(() => new URLSearchParams(search), [search]);

  const routeCorrectionLaunch = !!state?.correctionLaunch;
  const routeCorrectionKinds =
    (state?.correctionKinds as CorrectionLaunchKind[]) ?? [];

  const effectiveCorrectionLaunch = correctionLaunch || routeCorrectionLaunch;
  const effectiveCorrectionKinds =
    correctionKinds.length > 0 ? correctionKinds : routeCorrectionKinds;

  const returnTo = params.get("returnTo");

  const canShowFloatingUi = !embedded || isWorkspaceActive;

  // const backToDashboard = () => {
  //   if (returnTo) navigate(decodeURIComponent(returnTo), { replace: true });
  //   else navigate("/clientDashboard", { replace: true });
  // };

  const backToDashboard = () => {
    if (returnTo)
      return navigate(decodeURIComponent(returnTo), { replace: true });

    if (role === "FRONTDESK")
      return navigate("/frontdeskDashboard", { replace: true });
    if (role === "MICRO") return navigate("/microDashboard", { replace: true });
    if (role === "MC") return navigate("/mcDashboard", { replace: true });
    if (role === "QA") return navigate("/qaDashboard", { replace: true });
    if (role === "ADMIN") return navigate("/adminDashboard", { replace: true });
    if (role === "SYSTEMADMIN")
      return navigate("/systemAdminDashboard", { replace: true });

    return navigate("/", { replace: true });
  };

  const routeMode = params.get("mode");
  const urlTemplateId = params.get("templateId");

  const isTemplateMode = routeMode === "template";
  const isTemplateViewMode = routeMode === "templateView";
  const isAnyTemplateMode = isTemplateMode || isTemplateViewMode;

  const forceReadOnly =
    forcePageReadOnly || isTemplateViewMode || pageMode === "VIEW";

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

  useEffect(() => {
    if (!effectiveCorrectionLaunch) return;
    if (pageMode !== "UPDATE") return;
    if (forceReadOnly) return;
    if (!isWorkspaceActive) return;

    const target = getCorrectionTargetStatus(
      status as ReportStatus,
      effectiveCorrectionKinds,
    );
    if (!target) return;

    setSelectingCorrections(true);
    setPendingStatus(target);
  }, [
    effectiveCorrectionLaunch,
    pageMode,
    forceReadOnly,
    isWorkspaceActive,
    status,
    effectiveCorrectionKinds,
  ]);

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

      case "organisms":
        return organisms
          .filter((o) => o.checked)
          .map((o) => o.label)
          .join(", ");

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

  function isCorrectionTargetStatus(target: string) {
    return (
      target === "CHANGE_REQUESTED" ||
      target === "CORRECTION_REQUESTED" ||
      target.endsWith("_NEEDS_CORRECTION")
    );
  }

  const uiNeedsESign = (s: string) =>
    (role === "ADMIN" || role === "SYSTEMADMIN" || role === "FRONTDESK") &&
    (s === "UNDER_CLIENT_REVIEW" || s === "LOCKED");

  function requestStatusChange(target: ReportStatus) {
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
    const isNeeds = isCorrectionTargetStatus(target);

    if (isNeeds) {
      setSelectingCorrections(true);
      setPendingCorrections([]);
      setPendingStatus(target);
      return;
    }
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
    return canEdit(role, base, status as ReportStatus);
  };

  const [resolveTarget, setResolveTarget] = useState<CorrectionItem | null>(
    null,
  );
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveReason, setResolveReason] = useState("");

  const [resolveFieldTarget, setResolveFieldTarget] = useState<string | null>(
    null,
  );

  // Resolve ALL corrections for a field
  async function resolveField(fieldKey: string) {
    if (!reportId) return;
    return runBusy("RESOLVE", async () => {
      const items = openCorrections.filter(
        (c) => c.fieldKey === fieldKey || c.fieldKey.startsWith(`${fieldKey}:`),
      );
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
  function ResolveOverlay({ field }: { field: string }) {
    if (!hasCorrection(field) || !canResolveField(field)) return null;

    const disabled = !canResolveAllForFieldKey(field);

    return (
      <button
        type="button"
        title={
          role === "SYSTEMADMIN"
            ? "Resolve with reason"
            : isDirty
              ? "Save the form before resolving"
              : disabled
                ? "Edit the field first before resolving"
                : "Mark resolved"
        }
        onClick={() => {
          if (disabled) return;

          if (role === "SYSTEMADMIN") {
            setResolveFieldTarget(field);
            setResolveTarget(null);
            setResolveReason("");
            setShowResolveModal(true);
            return;
          }

          resolveField(field);
        }}
        disabled={disabled}
        className={`
        absolute -top-2 -right-2 z-20
        h-5 w-5 rounded-full grid place-items-center
        text-white shadow focus:outline-none focus:ring-2 focus:ring-emerald-400
        ${
          disabled
            ? "bg-emerald-300 cursor-not-allowed opacity-60"
            : "bg-emerald-600 hover:bg-emerald-700"
        }
      `}
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

  const [comments, setComments] = useState(report?.comments || "");
  const [testedBy, setTestedBy] = useState(report?.testedBy || "");
  const [reviewedBy, setReviewedBy] = useState(report?.reviewedBy || "");
  const [testedDate, setTestedDate] = useState(report?.testedDate || "");
  const [reviewedDate, setReviewedDate] = useState(report?.reviewedDate || "");

  // const lock = (f: string) => !canEdit(role, f);
  // use:
  const correctionModeActive =
    isCorrectionUpdateStatus(status as ReportStatus) &&
    openCorrections.length > 0;

  const lock = (f: string) => {
    if (forceReadOnly) return true;

    // normal permission check first
    const baseLocked = !canEdit(role, f, status as ReportStatus);
    if (baseLocked) return true;

    // in correction mode, only requested fields are editable
    if (correctionModeActive) {
      return !isFieldRequestedForCorrection(f);
    }

    return false;
  };

  const { errors, clearError, validateAndSetErrors } = useReportValidation(
    role,
    {
      status: status as ReportStatus, // status-driven PRELIM vs FINAL validation
    },
  );

  function hydrateForm(data: Partial<ApeReportFormValues> | any) {
    // data is what you stored in template.data (your payload)
    setClient(data?.client ?? "");
    setDateSent(isTemplateViewMode ? (data?.dateSent ?? "") : todayISO());
    setTypeOfTest(data?.typeOfTest ?? "");
    setSampleType(data?.sampleType ?? "");
    setFormulaNo(data?.formulaNo ?? "");
    setDescription(data?.description ?? "");
    setLotNo(data?.lotNo ?? "");
    setManufactureDate(data?.manufactureDate ?? "");
    setTestSopNo(data?.testSopNo ?? "");
    setDateTested(data?.dateTested ?? "");
    setDateCompleted(data?.dateCompleted ?? "");
    setOrganisms(
      Array.isArray(data?.organisms) && data.organisms.length > 0
        ? data.organisms
        : apeOrganismDefaults,
    );
    setComments(data?.comments ?? "");
    setTestedBy(data?.testedBy ?? "");
    setTestedDate(data?.testedDate ?? "");
    setReviewedBy(data?.reviewedBy ?? "");
    setReviewedDate(data?.reviewedDate ?? "");
  }

  useEffect(() => {
    if (!isAnyTemplateMode || !templateId) return;

    (async () => {
      try {
        const t = await api<any>(`/templates/${templateId}`, { method: "GET" });

        // expected structure: { id, name, version, data, formType }
        setTemplateName(t?.name ?? "");
        setTemplateVersion(typeof t?.version === "number" ? t.version : 0);

        hydrateForm(t?.data ?? {});
        setIsDirty(false);
      } catch (e) {
        console.error(e);
        alert("❌ Failed to load template.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnyTemplateMode, templateId]);

  // Current values snapshot (use inside handlers)
  const makeValues = (): ApeReportFormValues => ({
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
    organisms,
    comments,
    testedBy,
    testedDate,
    dateCompleted,
    reviewedBy,
    reviewedDate,
  });

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
          dateCompleted,
          organisms,
          comments,
          testedBy,
          reviewedBy,
          testedDate,
          reviewedDate,
        };

        const BASE_ALLOWED: Record<Role, string[]> = {
          ADMIN: ["*"],
          SYSTEMADMIN: ["*"],
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
          MICRO: ["testSopNo", "dateTested", "dateCompleted", "comments"],
          MC: ["testSopNo", "dateTested", "dateCompleted", "comments"],
          QA: ["comments"],
          CLIENT: [
            "client",
            "dateSent",
            "typeOfTest",
            "sampleType",
            "formulaNo",
            "description",
            "lotNo",
            "manufactureDate",
            "organisms",
            "comments",
          ],
        };

        const allowedBase = BASE_ALLOWED[role || "CLIENT"] || [];
        const allowed = allowedBase.includes("*")
          ? Object.keys(fullPayload)
          : allowedBase;

        // const payload = Object.fromEntries(
        //   Object.entries(fullPayload).filter(([k]) => allowed.includes(k)),
        // );

        let payload = Object.fromEntries(
          Object.entries(fullPayload).filter(([k]) => allowed.includes(k)),
        );

        // ✅ In correction update mode, send ONLY requested correction fields
        if (correctionModeActive) {
          const requestedBaseFields = new Set(
            openCorrections.map((c) => c.fieldKey.split(":")[0]),
          );

          payload = Object.fromEntries(
            Object.entries(payload).filter(([k]) => requestedBaseFields.has(k)),
          );
        }

        // New reports always start as DRAFT
        if (!reportId) {
          payload.status = "DRAFT";
        }

        try {
          let saved: any;

          if (isTemplateMode) {
            const name = templateName.trim();

            if (!name) {
              alert("⚠️ Please enter a Template name before saving.");
              return false;
            }

            const { dateSent: _dateSent, ...templateData } = payload;

            const templatePayload = {
              name,
              formType: "APE",
              data: templateData,
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
              body: JSON.stringify({ ...payload, formType: "APE" }),
            });
          }

          setReportId(saved.id); // 👈 keep the new id
          setStatus(saved.status); // in case backend changed itgit fkd
          setReportNumber(String(saved.reportNumber ?? ""));
          setReportVersion(
            typeof saved.version === "number"
              ? saved.version
              : reportVersion + 1,
          );

          setIsDirty(false);
          onSaved?.({
            ...report,
            ...fullPayload,
            ...saved,
            id: saved.id ?? reportId,
          });
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
        }
      })) ?? false
    );
  };

  type UpdatedReport = {
    status?: ReportStatus;
    reportNumber?: string;
    version?: number;
  };

  async function handleStatusChange(
    newStatus: ReportStatus,
    opts?: { reason?: string; eSignPassword?: string },
  ) {
    return await runBusy("STATUS", async () => {
      const currentStatus = status as ReportStatus;
      const centralApproval = isCentralApprovalTransition(
        currentStatus,
        newStatus,
      );

      let okFields = true;

      if (!centralApproval) {
        const values = makeValues();
        okFields = validateAndSetErrors(values);
      }

      if (!centralApproval && !okFields) {
        alert("⚠️ Please fix the highlighted fields before changing status.");
        return false;
      }

      // Approval happens before the assigned user fixes the requested fields.
      if (
        !centralApproval &&
        shouldBlockStatusChangeForUnresolvedCorrections()
      ) {
        return false;
      }

      // A save increments the version. Track it so we can reload the version
      // before immediately performing the status transition.
      let savedBeforeStatusChange = false;

      if (!reportId || isDirty) {
        const saved = await handleSave();
        if (!saved) return false;
        savedBeforeStatusChange = true;
      }

      let expectedVersionForRequest = reportVersion;

      // Central approval may be opened from a stale dashboard/workspace copy.
      // A just-completed save also increments the version asynchronously.
      if ((centralApproval || savedBeforeStatusChange) && reportId) {
        try {
          const latestReport = await api<any>(`/reports/${reportId}`, {
            method: "GET",
          });

          const latestStatus = latestReport?.status as ReportStatus | undefined;
          const latestVersion =
            typeof latestReport?.version === "number"
              ? latestReport.version
              : reportVersion;

          if (latestStatus && latestStatus !== currentStatus) {
            setStatus(latestStatus);
            setReportVersion(latestVersion);

            if (latestReport?.reportNumber != null) {
              setReportNumber(String(latestReport.reportNumber));
            }

            onStatusChanged?.({
              ...report,
              ...latestReport,
              id: reportId,
              status: latestStatus,
              version: latestVersion,
            });

            alert(
              `⚠️ This report is now ${formatStatusText(latestStatus)}. ` +
                "The latest version has been loaded.",
            );
            return false;
          }

          expectedVersionForRequest = latestVersion;
          setReportVersion(latestVersion);
        } catch (refreshError) {
          console.error(
            "Failed to refresh report before status change:",
            refreshError,
          );
          alert(
            "❌ Could not verify the latest report version. Please close and reopen the report.",
          );
          return false;
        }
      }

      try {
        const updated = await api<UpdatedReport>(
          `/reports/${reportId}/status`,
          {
            method: "PATCH",
            body: JSON.stringify({
              status: newStatus,
              reason:
                opts?.reason ??
                (centralApproval
                  ? newStatus === "UNDER_CHANGE_UPDATE"
                    ? "Change request approved"
                    : "Correction request approved"
                  : "Changing Status"),
              eSignPassword: opts?.eSignPassword ?? undefined,
              expectedVersion: expectedVersionForRequest,
            }),
          },
        );

        const nextStatus = updated.status ?? newStatus;
        const nextVersion =
          typeof updated.version === "number"
            ? updated.version
            : expectedVersionForRequest + 1;

        setStatus(nextStatus);
        setReportVersion(nextVersion);

        if (updated.reportNumber != null) {
          setReportNumber(String(updated.reportNumber));
        }

        setIsDirty(false);

        onStatusChanged?.({
          ...report,
          ...updated,
          id: reportId,
          status: nextStatus,
          version: nextVersion,
        });

        alert(
          centralApproval
            ? newStatus === "UNDER_CHANGE_UPDATE"
              ? "✅ Change request approved. The report is now available for the requested update."
              : "✅ Correction request approved. The report is now available for correction."
            : `✅ Status changed to ${newStatus}`,
        );

        if (embedded) return true;
        backToDashboard();
        return true;
      } catch (err: any) {
        console.error(err);

        if (err?.status === 409) {
          try {
            const latestReport = await api<any>(`/reports/${reportId}`, {
              method: "GET",
            });

            const latestStatus =
              (latestReport?.status as ReportStatus) || currentStatus;
            const latestVersion =
              typeof latestReport?.version === "number"
                ? latestReport.version
                : reportVersion;

            setStatus(latestStatus);
            setReportVersion(latestVersion);

            if (latestReport?.reportNumber != null) {
              setReportNumber(String(latestReport.reportNumber));
            }

            onStatusChanged?.({
              ...report,
              ...latestReport,
              id: reportId,
              status: latestStatus,
              version: latestVersion,
            });
          } catch (reloadError) {
            console.error(
              "Failed to reload report after version conflict:",
              reloadError,
            );
          }

          const expected = err?.body?.expectedVersion;
          const current = err?.body?.currentVersion;

          alert(
            expected != null && current != null
              ? `⚠️ The report version changed from ${expected} to ${current}. The latest version has been loaded. Please click Approve again.`
              : "⚠️ The report was updated after this window opened. The latest version has been loaded. Please click Approve again.",
          );
          return false;
        }

        const msg =
          (typeof err?.body === "string" && err.body.trim()) ||
          err?.body?.message ||
          err?.message ||
          "Status update failed.";

        alert(`❌ ${msg}`);
        return false;
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
  useConfirmOnLeave(!embedded && isDirty);

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
    if (embedded) {
      onClose?.();
      return;
    }

    if (onClose) {
      onClose();
      return;
    }

    if (returnTo) {
      navigate(decodeURIComponent(returnTo), { replace: true });
      return;
    }

    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate(fallbackRoute, { replace: true });
  };

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

  const APPROVE_REQUIRES_ATTACHMENT = new Set<ReportStatus>([
    "UNDER_CLIENT_REVIEW",
  ]);

  function isApproveAction(targetStatus: ReportStatus) {
    return APPROVE_REQUIRES_ATTACHMENT.has(targetStatus);
  }

  // ✅ JJL-only dropdown behavior
  const isJJL = (client ?? "").trim().toUpperCase() === "JJL";

  const JJL_CREATED_BY_STATUSES = new Set<ReportStatus>([
    "DRAFT",
    "UNDER_DRAFT_REVIEW",
    "SUBMITTED_BY_CLIENT",
  ]);

  const createdByClientCode = String(
    report?.clientCode ||
      (role === "CLIENT" ? user?.clientCode : "") ||
      String(report?.formNumber || "").split("-")[0] ||
      client ||
      "",
  )
    .trim()
    .toUpperCase();

  const showJJLCreatedBy =
    !isAnyTemplateMode &&
    createdByClientCode === "JJL" &&
    JJL_CREATED_BY_STATUSES.has(status as ReportStatus) &&
    createdByName.trim().length > 0;

  const HIDE_SIGNATURES_FOR = new Set<ReportStatus>([
    "DRAFT",
    "UNDER_DRAFT_REVIEW",
    "SUBMITTED_BY_CLIENT",
  ]);
  const showSignatures = !HIDE_SIGNATURES_FOR.has(status as ReportStatus);

  const showAssignReportNumberButton =
    embedded &&
    (role === "MICRO" || role === "MC") &&
    status === "SUBMITTED_BY_CLIENT";

  async function assignReportNumberAndOpenTesting() {
    if (!reportId) {
      alert("⚠️ Please save the report first.");
      return;
    }

    return runBusy("STATUS", async () => {
      try {
        const updated = await api<any>(`/reports/${reportId}/status`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "UNDER_TESTING_REVIEW",
            reason: "Assign report number / start prelim testing",
            expectedVersion: reportVersion,
          }),
        });

        const nextStatus =
          (updated?.status as ReportStatus) || "UNDER_TESTING_REVIEW";

        const nextVersion =
          typeof updated?.version === "number"
            ? updated.version
            : reportVersion + 1;

        setStatus(nextStatus);
        setReportVersion(nextVersion);

        if (updated?.reportNumber != null) {
          setReportNumber(String(updated.reportNumber));
        }

        onStatusChanged?.(updated);
        alert("✅ Report number assigned and moved to testing.");
      } catch (err: any) {
        console.error(err);
        alert(
          "❌ Failed to assign report number: " +
            (err?.message || "Unknown error"),
        );
      }
    });
  }

  const disableSaveUntilAssigned =
    embedded &&
    (role === "MICRO" || role === "MC") &&
    status === "SUBMITTED_BY_CLIENT";

  const hideNeedCorrectionButtons = embedded && effectiveCorrectionLaunch;

  function getCentralizedCorrectionStatus(
    kinds: CorrectionLaunchKind[] = [],
  ): ReportStatus {
    // If both are selected, prefer correction flow
    if (kinds.includes("RAISE_CORRECTION")) return "CORRECTION_REQUESTED";
    if (kinds.includes("REQUEST_CHANGE")) return "CHANGE_REQUESTED";

    // safe default
    return "CORRECTION_REQUESTED";
  }

  function getCorrectionTargetStatus(
    _current: ReportStatus,
    kinds: CorrectionLaunchKind[] = [],
  ): ReportStatus {
    return getCentralizedCorrectionStatus(kinds);
  }

  function getWorkflowReturnStatus(current: ReportStatus): ReportStatus {
    if (current === "UNDER_CLIENT_REVIEW") {
      return "UNDER_QA_REVIEW";
    }

    // For any other status, return to same original status
    return current;
  }
  function normalizeForCompare(v: any): string {
    if (v === null || v === undefined) return "";

    if (typeof v === "string") return v.trim();

    if (Array.isArray(v) || typeof v === "object") {
      try {
        return JSON.stringify(v);
      } catch {
        return String(v).trim();
      }
    }

    return String(v).trim();
  }

  function hasCorrectionBeenFixed(c: CorrectionItem): boolean {
    const currentValue = getFieldDisplayValue(c.fieldKey);
    const oldValue = c.oldValue;

    return normalizeForCompare(currentValue) !== normalizeForCompare(oldValue);
  }

  function canResolveCorrectionItem(c: CorrectionItem): boolean {
    if (role === "SYSTEMADMIN") {
      return c.status === "OPEN" && !isDirty;
    }

    return canResolveField(c.fieldKey) && hasCorrectionBeenFixed(c) && !isDirty;
  }

  function canResolveAllForFieldKey(fieldKey: string): boolean {
    const items = openCorrections.filter(
      (c) => c.fieldKey === fieldKey || c.fieldKey.startsWith(`${fieldKey}:`),
    );
    if (!items.length) return false;

    return items.every((c) => canResolveCorrectionItem(c));
  }

  function isFieldRequestedForCorrection(fieldKey: string) {
    return openCorrections.some(
      (c) => c.fieldKey === fieldKey || c.fieldKey.startsWith(`${fieldKey}:`),
    );
  }

  function isCorrectionUpdateStatus(s?: ReportStatus) {
    return s === "UNDER_CORRECTION_UPDATE" || s === "UNDER_CHANGE_UPDATE";
  }

  function isCentralApprovalTransition(
    currentStatus: ReportStatus,
    targetStatus: ReportStatus,
  ) {
    return (
      (currentStatus === "CHANGE_REQUESTED" &&
        targetStatus === "UNDER_CHANGE_UPDATE") ||
      (currentStatus === "CORRECTION_REQUESTED" &&
        targetStatus === "UNDER_CORRECTION_UPDATE")
    );
  }

  function shouldBlockStatusChangeForUnresolvedCorrections() {
    if (role === "SYSTEMADMIN" || role === "ADMIN" || role === "QA") {
      return false;
    }

    const pending = openCorrections.filter(
      (c) => hasCorrectionBeenFixed(c) && c.status === "OPEN",
    );

    if (pending.length > 0) {
      alert(
        `⚠️ You updated ${pending.length} corrected field(s), but they are still not resolved.\n\n` +
          `Please click the green tick / Resolve before changing status.`,
      );
      return true;
    }

    return false;
  }

  function formatStatusText(status: string) {
    return status.replaceAll("_", " ");
  }

  // For correction permission checks, treat "pathogens:X:checked" and "pathogens:X:spec" as the same base field "pathogens:X"
  function getCorrectionFieldKeys(fieldKey: string) {
    const [base, key, col] = fieldKey.split(":");

    if (base === "pathogens" && key && col === "checked") {
      return [`pathogens:${key}:checked`, `pathogens:${key}:spec`];
    }

    return [fieldKey];
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
        {!hideTopActions && (
          <div className="no-print mb-4 flex justify-end gap-2">
            {isTemplateMode && !isTemplateViewMode && (
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
            {!embedded && (
              <button
                type="button"
                className="px-3 py-1 rounded-md border bg-gray-600 text-white"
                onClick={handleClose}
                disabled={isBusy}
              >
                {isBusy ? "Working..." : "Close"}
              </button>
            )}
            {/* <button
          </button> */}
            {!isTemplateViewMode &&
              !HIDE_SAVE_FOR.has(status as ReportStatus) && (
                <button
                  className="px-3 py-1 rounded-md border bg-blue-600 text-white disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                  onClick={handleSave}
                  disabled={
                    role === "FRONTDESK" ||
                    isBusy ||
                    status === "UNDER_CLIENT_REVIEW" ||
                    status === "LOCKED" ||
                    disableSaveUntilAssigned ||
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
        )}

        {canShowFloatingUi &&
          effectiveCorrectionLaunch &&
          pageMode === "UPDATE" &&
          !isTemplateViewMode && (
            <div className="no-print mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Correction selection is active. Click fields in the form to add
              correction notes.
            </div>
          )}

        {correctionModeActive && (
          <div className="no-print mb-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            Only fields with requested corrections can be edited.
          </div>
        )}

        {/* Letterhead */}
        <div className="mb-2 text-center">
          <div
            className="font-bold tracking-wide text-[22px]"
            style={{ color: "blue" }}
          >
            OMEGA / BIOCHEM LABORATORIES, INC.
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
              {status === "DRAFT" ||
              status === "UNDER_DRAFT_REVIEW" ||
              status === "SUBMITTED_BY_CLIENT"
                ? "APE SUBMISSION FORM"
                : "APE REPORT"}
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
            <div
              id="f-client"
              onClick={() => {
                if (!selectingCorrections) return;
                setAddForField("client");
                setAddMessage("");
              }}
              className={`px-2 border-r border-black flex items-center gap-1 relative ${dashClass(
                "client",
              )}`}
            >
              <div className="whitespace-nowrap font-medium">CLIENT:</div>
              <FieldErrorBadge name="client" errors={errors} />
              <ResolveOverlay field="client" />

              {lock("client") ? (
                <div className="flex-1 min-h-[14px]">{client}</div>
              ) : (
                <input
                  className={`flex-1 input-editable py-[2px] text-[12px] leading-snug border ${
                    errors.client
                      ? "border-red-500 ring-1 ring-red-500"
                      : "border-black/70"
                  } ${
                    hasCorrection("client")
                      ? "ring-2 ring-rose-500 animate-pulse"
                      : ""
                  }`}
                  value={client.toUpperCase()}
                  onChange={(e) => {
                    setClient(e.target.value.toUpperCase());
                    clearError("client");
                    markDirty();
                  }}
                  aria-invalid={!!errors.client}
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
                  min={role !== "SYSTEMADMIN" ? todayISO() : undefined}
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

                  <datalist id="typeOfTest-options">
                    {(isJJL ? JJL_TYPE_OF_TEST_OPTIONS : []).map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                </div>
              )}

              {/* {lock("typeOfTest") ? (
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
              )} */}
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

                  <datalist id="sampleType-options">
                    {(isJJL ? JJL_SAMPLE_TYPE_OPTIONS : []).map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                </div>
              )}

              {/* {lock("sampleType") ? (
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
              )} */}
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
                  clearError("description");
                  markDirty();
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

        <div className="p-2 font-bold">
          ORGANISMS (Please check the organism to be tested)
        </div>

        <div
          id="f-organisms"
          onClick={() => {
            if (!selectingCorrections) return;
            setAddForField("organisms");
            setAddMessage("");
          }}
          className={`mt-2 relative border ${
            errors.organisms
              ? "border-red-500 ring-2 ring-red-500 bg-red-50"
              : "border-black"
          } ${dashClass("organisms")}`}
        >
          <FieldErrorBadge name="organisms" errors={errors} />
          <ResolveOverlay field="organisms" />

          {errors.organisms && (
            <div className="px-3 py-1 text-[11px] font-semibold text-red-600 border-b border-red-500 bg-red-50">
              Please select at least one organism.
            </div>
          )}

          <div className="grid grid-cols-2 text-[12px]">
            {organisms.map((org, idx) => (
              <label
                key={org.key}
                className={`flex items-center gap-2 border-b px-3 py-2 ${
                  errors.organisms ? "border-red-300 bg-red-50" : "border-black"
                } ${idx % 2 === 0 ? "border-r" : ""} ${
                  errors.organisms
                    ? "border-r-red-300"
                    : idx % 2 === 0
                      ? "border-r-black"
                      : ""
                }`}
              >
                <input
                  type="checkbox"
                  className="thick-box"
                  checked={!!org.checked}
                  onChange={(e) => setOrganismChecked(idx, e.target.checked)}
                  disabled={lock("organisms") || role !== "CLIENT"}
                />
                <span className="font-bold">{org.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Legends / Comments */}
        {/* <div className="mt-2 text-[11px]">
          <div
            className=" font-bold border-black p-2"
            style={{ textDecoration: "underline" }}
          >
            DENOTES: NA (Not Applicable) / N.G. (No Growth) / GM.(+)B Gram (+)
            Bacilli / GM.(+)C Gram (+) Cocci / GM.NEG Gram Negative / NT (Not
            Tested) / TNTC (Too Numerous To Count)
          </div>
        </div> */}

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
            className={`col-span-2 relative ${dashClass("comments")}`}
          >
            <div className="flex items-start gap-2">
              {/* Label */}
              <div className="font-medium pt-1 whitespace-nowrap">
                Comments :
              </div>

              {/* Textarea with 2 lines */}
              <div className="flex-1">
                <textarea
                  rows={2}
                  className={`w-full resize-none text-[12px] leading-6 min-h-[48px] border-0 outline-none focus:ring-0 pl-2 pt-1 pb-1 bg-transparent ${
                    hasCorrection("comments")
                      ? "ring-2 ring-rose-500 animate-pulse"
                      : ""
                  }`}
                  style={{
                    backgroundImage: errors.comments
                      ? "linear-gradient(to bottom, transparent calc(100% - 1px), #ef4444 1px), linear-gradient(to bottom, transparent calc(100% - 1px), #ef4444 1px)"
                      : "linear-gradient(to bottom, transparent calc(100% - 1px), rgba(0,0,0,0.7) 1px), linear-gradient(to bottom, transparent calc(100% - 1px), rgba(0,0,0,0.7) 1px)",
                    backgroundSize: "100% 24px, 100% 24px",
                    backgroundPosition: "0 0, 0 24px",
                    backgroundRepeat: "no-repeat",
                  }}
                  value={comments}
                  onChange={(e) => {
                    setComments(e.target.value);
                    clearError("comments");
                    markDirty();
                  }}
                  aria-invalid={!!errors.comments}
                  readOnly={lock("comments")}
                />
              </div>
            </div>

            <FieldErrorBadge name="comments" errors={errors} />
            <ResolveOverlay field="comments" />
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
                      markDirty();
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
                      markDirty();
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
                      markDirty();
                    }}
                    readOnly={lock("reviewedDate")}
                    aria-invalid={!!errors.reviewedDate}
                  />
                </div>
              </div>
            </>
          )}
        </div>
        {showJJLCreatedBy && (
          <div className="mt-1 text-right text-[12px] leading-tight">
            <span className="font-semibold">Created by:</span>{" "}
            <span>{createdByName}</span>
          </div>
        )}
      </div>

      {/* Actions row: submit/reject on left, close on right */}
      {!hideBottomActions &&
        !isAnyTemplateMode &&
        !effectiveCorrectionLaunch && (
          <div className="no-print mt-4 flex items-center justify-between">
            {/* Left: status action buttons */}
            <div className="flex flex-wrap gap-2">
              {showAssignReportNumberButton && (
                <button
                  type="button"
                  onClick={assignReportNumberAndOpenTesting}
                  disabled={isBusy}
                  className="px-4 py-2 rounded-md border bg-purple-600 text-white disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {busy === "STATUS" && <Spinner />}
                  Assign Report Number
                </button>
              )}
              {!showAssignReportNumberButton &&
                (() => {
                  const nextStatuses =
                    APE_STATUS_TRANSITIONS[status as ReportStatus]?.next ?? [];

                  const hasCorrectionAction =
                    !hideNeedCorrectionButtons &&
                    nextStatuses.some((targetStatus) =>
                      isCorrectionTargetStatus(String(targetStatus)),
                    );

                  const normalStatuses = nextStatuses.filter(
                    (targetStatus) =>
                      !isCorrectionTargetStatus(String(targetStatus)),
                  );

                  const canSetCurrentStatus = APE_STATUS_TRANSITIONS[
                    status as ReportStatus
                  ]?.canSet.includes(role!);

                  return (
                    <>
                      {hasCorrectionAction && canSetCurrentStatus && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setCorrectionActionOpen((open) => !open)
                            }
                            className="px-4 py-2 rounded-md border text-white bg-amber-700 hover:bg-amber-800 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                            disabled={isBusy}
                          >
                            {busy === "STATUS" && <Spinner />}
                            Needs Correction ▾
                          </button>

                          {correctionActionOpen && (
                            <div className="absolute left-0 top-full z-30 mt-2 w-40 overflow-hidden rounded-lg border bg-white shadow-lg">
                              <button
                                type="button"
                                className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-cyan-50"
                                onClick={() => {
                                  setCorrectionActionOpen(false);
                                  requestStatusChange("CHANGE_REQUESTED");
                                }}
                              >
                                Request Change
                              </button>

                              <button
                                type="button"
                                className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-yellow-50"
                                onClick={() => {
                                  setCorrectionActionOpen(false);
                                  requestStatusChange("CORRECTION_REQUESTED");
                                }}
                              >
                                Raise Correction
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {normalStatuses.map((targetStatus: ReportStatus) => {
                        const buttonConfig = statusButtons[targetStatus];
                        if (!canSetCurrentStatus || !buttonConfig) return null;

                        const { label, color } = buttonConfig;
                        const approveNeedsAttachment =
                          isApproveAction(targetStatus);
                        const disableApproveForNoAttachment =
                          approveNeedsAttachment && !hasAttachment;
                        const disabled =
                          isBusy ||
                          attachmentsLoading ||
                          disableApproveForNoAttachment;

                        return (
                          <div key={targetStatus} className="relative group">
                            <button
                              className={`px-4 py-2 rounded-md border text-white ${color} disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2`}
                              onClick={() => requestStatusChange(targetStatus)}
                              disabled={disabled}
                              title={formatStatusText(targetStatus)}
                            >
                              {busy === "STATUS" && <Spinner />}
                              {attachmentsLoading && label === "Approve"
                                ? "Checking..."
                                : label}
                            </button>

                            <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
                              {label} → {formatStatusText(targetStatus)}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
            </div>
          </div>
        )}
      {canShowFloatingUi && showESign && (
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

      {canShowFloatingUi && !isTemplateViewMode && selectingCorrections && (
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
                  const targetStatus = pendingStatus!;

                  await createCorrections(
                    reportId!,
                    pendingCorrections,
                    targetStatus,
                    "Corrections requested",
                    reportVersion,
                    {
                      kinds: effectiveCorrectionKinds,
                      previousStatus: getWorkflowReturnStatus(
                        status as ReportStatus,
                      ),
                      workflowReturnStatus: getWorkflowReturnStatus(
                        status as ReportStatus,
                      ),
                    },
                  );

                  // Creating the request changes the report status and increments
                  // the optimistic-lock version. Reload both before continuing.
                  const [freshCorrections, latestReport] = await Promise.all([
                    getCorrections(reportId!),
                    api<any>(`/reports/${reportId!}`, { method: "GET" }),
                  ]);

                  const latestStatus =
                    (latestReport?.status as ReportStatus) || targetStatus;
                  const latestVersion =
                    typeof latestReport?.version === "number"
                      ? latestReport.version
                      : reportVersion + 1;

                  setCorrections(freshCorrections);
                  setStatus(latestStatus);
                  setReportVersion(latestVersion);

                  if (latestReport?.reportNumber != null) {
                    setReportNumber(String(latestReport.reportNumber));
                  }

                  setSelectingCorrections(false);
                  setPendingCorrections([]);
                  setPendingStatus(null);
                  setIsDirty(false);

                  onStatusChanged?.({
                    ...report,
                    ...latestReport,
                    id: reportId,
                    status: latestStatus,
                    version: latestVersion,
                  });

                  if (embedded) return;
                  backToDashboard();
                })
              }
            >
              {busy === "SEND_CORRECTIONS" && <Spinner />}
              Send corrections
            </button>
          </div>
        </div>
      )}

      {canShowFloatingUi && !isTemplateViewMode && addForField && (
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
                    setPendingCorrections((prev) => {
                      const fields = getCorrectionFieldKeys(addForField!);

                      const newCorrections = fields
                        .filter(
                          (fieldKey) =>
                            !prev.some((p) => p.fieldKey === fieldKey),
                        )
                        .map((fieldKey) => ({
                          fieldKey,
                          message: addMessage.trim(),
                          oldValue: getFieldDisplayValue(fieldKey),
                        }));

                      return [...prev, ...newCorrections];
                    });

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
      {canShowFloatingUi && !isTemplateViewMode && (
        <div className="no-print fixed bottom-20 right-6 z-40">
          <button
            type="button"
            onClick={() => setShowCorrTray((s) => !s)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xl hover:bg-slate-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-700">
              📝
            </span>
            <span>Corrections</span>

            {openCorrections.length > 0 && (
              <span className="ml-1 inline-flex min-w-6 items-center justify-center rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">
                {openCorrections.length}
              </span>
            )}
          </button>
        </div>
      )}

      {canShowFloatingUi && !isTemplateViewMode && showCorrTray && (
        <div className="no-print fixed bottom-20 right-6 z-40 w-[430px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5">
          <div className="border-b bg-slate-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    Correction Review
                  </h3>

                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                    {openCorrections.length} Open
                  </span>
                </div>

                <p className="mt-1 text-xs text-slate-500">
                  Review requested corrections and resolve after verification.
                </p>
              </div>

              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
                onClick={() => setShowCorrTray(false)}
                aria-label="Close corrections tray"
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="max-h-[430px] overflow-auto bg-slate-50/60 p-3">
            {openCorrections.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                  ✓
                </div>
                <div className="text-sm font-semibold text-slate-800">
                  No open corrections
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  All correction items are currently resolved.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {openCorrections.map((c, index) => {
                    const canResolve = canResolveCorrectionItem(c);

                    return (
                      <div
                        key={c.id}
                        className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700">
                                {index + 1}
                              </span>

                              <div className="truncate text-sm font-semibold text-slate-900">
                                {c.fieldKey}
                              </div>
                            </div>

                            <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
                              <span className="font-semibold">Reason:</span>{" "}
                              {c.message}
                            </div>
                          </div>

                          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                            OPEN
                          </span>
                        </div>

                        {c.oldValue != null &&
                          String(c.oldValue).trim() !== "" && (
                            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                Old Value
                              </div>
                              <div className="break-words text-xs text-slate-700">
                                {typeof c.oldValue === "string"
                                  ? c.oldValue
                                  : JSON.stringify(c.oldValue)}
                              </div>
                            </div>
                          )}

                        <div className="mt-3 border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                              canResolve
                                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                : "bg-slate-100 text-slate-400 cursor-not-allowed"
                            }`}
                            onClick={() => {
                              if (!canResolve) return;

                              if (role === "SYSTEMADMIN") {
                                setResolveTarget(c);
                                setResolveFieldTarget(null);
                                setResolveReason("");
                                setShowResolveModal(true);
                                return;
                              }

                              resolveOne(c);
                            }}
                            disabled={!canResolve}
                            title={
                              role === "SYSTEMADMIN"
                                ? "Resolve with reason"
                                : isDirty
                                  ? "Save the form before resolving"
                                  : !hasCorrectionBeenFixed(c)
                                    ? "Edit the field first before resolving"
                                    : "Mark resolved"
                            }
                          >
                            {busy === "RESOLVE" ? <SpinnerDark /> : "✓"}
                            Mark Resolved
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {role === "SYSTEMADMIN" && (
                  <div className="sticky bottom-0 mt-3 border-t border-slate-200 bg-white p-3">
                    <button
                      type="button"
                      className="w-full rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isDirty || busy === "RESOLVE"}
                      onClick={() => {
                        setResolveTarget(null);
                        setResolveFieldTarget("__ALL_OPEN_CORRECTIONS__");
                        setResolveReason("");
                        setShowResolveModal(true);
                      }}
                    >
                      {busy === "RESOLVE"
                        ? "Resolving..."
                        : "Resolve All Open Corrections"}
                    </button>

                    {isDirty && (
                      <p className="mt-2 text-center text-[11px] text-rose-600">
                        Save the report before resolving corrections.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {showResolveModal && (resolveTarget || resolveFieldTarget) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold mb-2">Resolve Correction</h3>

            <p className="mb-2 text-xs text-slate-600">
              Field:{" "}
              <b>
                {resolveFieldTarget === "__ALL_OPEN_CORRECTIONS__"
                  ? "All Open Corrections"
                  : (resolveTarget?.fieldKey ?? resolveFieldTarget)}
              </b>
            </p>

            <textarea
              autoFocus
              rows={3}
              value={resolveReason}
              onChange={(e) => setResolveReason(e.target.value)}
              placeholder="Enter reason for resolving this correction"
              className="w-full rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-emerald-500"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border px-3 py-1.5 text-sm"
                onClick={() => {
                  setShowResolveModal(false);
                  setResolveTarget(null);
                  setResolveFieldTarget(null);
                  setResolveReason("");
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!resolveReason.trim() || busy === "RESOLVE"}
                onClick={() =>
                  runBusy("RESOLVE", async () => {
                    if (!reportId) return;

                    if (resolveFieldTarget === "__ALL_OPEN_CORRECTIONS__") {
                      const correctionsToResolve = [...openCorrections];

                      for (const c of correctionsToResolve) {
                        await resolveCorrection(
                          reportId,
                          c.id,
                          `SystemAdmin override: ${resolveReason.trim()}`,
                        );
                      }

                      const fresh = await getCorrections(reportId);
                      setCorrections(fresh);

                      setShowResolveModal(false);
                      setResolveTarget(null);
                      setResolveFieldTarget(null);
                      setResolveReason("");
                      return;
                    }

                    if (resolveFieldTarget) {
                      const items = openCorrections.filter(
                        (c) =>
                          c.fieldKey === resolveFieldTarget ||
                          c.fieldKey.startsWith(`${resolveFieldTarget}:`),
                      );

                      for (const c of items) {
                        await resolveCorrection(
                          reportId,
                          c.id,
                          `SystemAdmin override: ${resolveReason.trim()}`,
                        );
                      }

                      const fresh = await getCorrections(reportId);
                      setCorrections(fresh);
                      flashResolved(resolveFieldTarget);
                    }

                    if (resolveTarget) {
                      await resolveCorrection(
                        reportId,
                        resolveTarget.id,
                        `SystemAdmin override: ${resolveReason.trim()}`,
                      );

                      const fresh = await getCorrections(reportId);
                      setCorrections(fresh);
                      flashResolved(resolveTarget.fieldKey);
                    }

                    setShowResolveModal(false);
                    setResolveTarget(null);
                    setResolveFieldTarget(null);
                    setResolveReason("");
                  })
                }
              >
                {busy === "RESOLVE" && <Spinner />}
                Confirm Resolve
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
