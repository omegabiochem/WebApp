import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useBlocker } from "react-router-dom";
import { api } from "../../lib/api";
import {
  createCorrections,
  DEFAULT_COA_ROWS,
  FieldErrorBadge,
  getCorrections,
  resolveCorrection,
  useCOAReportValidation,
  type CoaReportFormValues,
  type CoaVerificationRow,
} from "../../utils/COAReportValidation";
import {
  CellTextarea,
  FIELD_EDIT_MAP,
  STATUS_TRANSITIONS,
  type COAReportStatus,
  type CorrectionItem,
  type Role,
} from "../../utils/COAReportFormWorkflow";
import { todayISO } from "../../utils/microMixReportFormWorkflow";

// ---------- tiny hook to warn on unsaved ----------
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
}

// --------- helper for date <-> input value ----------
function formatDateForInput(value: string | null) {
  if (!value || value === "NA") return "";
  return new Date(value).toISOString().split("T")[0];
}

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
  .dash { position: relative; z-index: 5; isolation: isolate; }

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

type COAReportFormProps = {
  report?: any; // same pattern as Micro
  onClose?: () => void;
};

const statusButtons: Record<string, { label: string; color: string }> = {
  UNDER_DRAFT_REVIEW: { label: "Review", color: "bg-slate-700" },
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
  status?: COAReportStatus,
) {
  if (!role || !status) return false;
  const transition = STATUS_TRANSITIONS[status];
  if (!transition || !transition.canEdit?.includes(role)) {
    return false;
  }

  if (!role) return false;

  if (FIELD_EDIT_MAP[role]?.includes("*")) return true;
  return FIELD_EDIT_MAP[role]?.includes(field) ?? false;
}

const HIDE_SAVE_FOR = new Set<COAReportStatus>(["APPROVED", "LOCKED"]);

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

export default function COAReportForm({ report, onClose }: COAReportFormProps) {
  const { user } = useAuth();

  const role = user?.role as Role | undefined;
  const navigate = useNavigate();

  const [isDirty, setIsDirty] = useState(false);

  const [status, setStatus] = useState(report?.status || "DRAFT");

  // const isSubmissionForm =
  //   status === "DRAFT" ||
  //   status === "UNDER_DRAFT_REVIEW" || // ✅
  //   status === "SUBMITTED_BY_CLIENT";

  // const isReportView = !isSubmissionForm;

  type TestType = "COA_VERIFICATION";
  const [_testTypes, setTestTypes] = useState<TestType[]>(
    report?.testTypes?.length ? report.testTypes : ["COA_VERIFICATION"],
  );

  const [coaRows, setCoaRows] = useState<CoaVerificationRow[]>(
    report?.coaRows ?? DEFAULT_COA_ROWS,
  );

  const markDirty = () => !isDirty && setIsDirty(true);
  useConfirmOnLeave(isDirty);

  // ---- core report identity ----
  const [reportId, setReportId] = useState<string | null>(report?.id ?? null);
  const [reportNumber, setReportNumber] = useState<string>(
    report?.reportNumber ?? "",
  );

  const [reportVersion, setReportVersion] = useState<number>(
    typeof report?.version === "number" ? report.version : 0,
  );

  useEffect(() => {
    if (typeof report?.version === "number") setReportVersion(report.version);
  }, [report?.version]);

  // ---- header fields (same as micro) ----
  const [client, setClient] = useState(
    report?.client ?? (user?.role === "CLIENT" ? (user?.clientCode ?? "") : ""),
  );
  const [dateSent, setDateSent] = useState(report?.dateSent || todayISO());

  // ---- SAMPLE DESCRIPTION BLOCK ----
  const [sampleDescription, setSampleDescription] = useState(
    report?.sampleDescription || "",
  );

  // type of test: ID / Percent Assay / Content Uniformity
  const [coaVerification, setCoaVerification] = useState<boolean>(
    !!report?.coaVerification,
  );

  const [lotBatchNo, setLotBatchNo] = useState(report?.lotBatchNo || "");
  const [manufactureDate, setManufactureDate] = useState(
    report?.manufactureDate || "",
  );

  const [formulaId, setFormulaId] = useState(report?.formulaId || "");
  const [sampleSize, setSampleSize] = useState(report?.sampleSize || "");

  const [dateReceived, setDateReceived] = useState(report?.dateReceived || "");

  // const toggleTestType = (key: TestType) => {
  //   setTestTypes((prev) =>
  //     prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
  //   );
  //   markDirty();
  // };

  // ---- comments / signatures ----
  const [comments, setComments] = useState(report?.comments || "");
  const [testedBy, setTestedBy] = useState(report?.testedBy || "");
  const [testedDate, setTestedDate] = useState(report?.testedDate || "");
  const [reviewedBy, setReviewedBy] = useState(report?.reviewedBy || "");
  const [reviewedDate, setReviewedDate] = useState(report?.reviewedDate || "");

  const { errors, clearError, validateAndSetErrors } = useCOAReportValidation(
    role,
    {
      status: status as COAReportStatus,
    },
  );
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

  function hydrateForm(r?: any) {
    // header fields
    setClient(r?.client ?? (role === "CLIENT" ? (user?.clientCode ?? "") : ""));
    setDateSent(r?.dateSent ?? "");
    setSampleDescription(r?.sampleDescription ?? "");
    setCoaVerification(!!r?.coaVerification);

    setLotBatchNo(r?.lotBatchNo ?? "");
    setManufactureDate(r?.manufactureDate ?? "");
    setFormulaId(r?.formulaId ?? "");
    setSampleSize(r?.sampleSize ?? "");

    setDateReceived(r?.dateReceived ?? "");
    setTestTypes(r?.testTypes?.length ? r.testTypes : ["COA_VERIFICATION"]);
    setCoaRows(r?.coaRows ?? DEFAULT_COA_ROWS);

    // comments / signatures
    setComments(r?.comments ?? "");
    setTestedBy(r?.testedBy ?? "");
    setTestedDate(r?.testedDate ?? "");
    setReviewedBy(r?.reviewedBy ?? "");
    setReviewedDate(r?.reviewedDate ?? "");

    // template load should NOT open corrections picker etc.
    setSelectingCorrections(false);
    setPendingCorrections([]);
    setAddForField(null);
    setAddMessage("");
  }

  function FieldErrorText({
    name,
    errors,
    className = "",
  }: {
    name: string;
    errors: Record<string, string>;
    className?: string;
  }) {
    const msg = errors[name];
    if (!msg) return null;

    return (
      <div className={`mt-1 text-[11px] text-red-600 ${className}`}>{msg}</div>
    );
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
    // include deps because hydrateForm uses role/user.clientCode
  }, [isAnyTemplateMode, templateId, role, user?.clientCode]);

  const makeValues = (): CoaReportFormValues => ({
    client,
    dateSent,
    sampleDescription,
    lotBatchNo,
    manufactureDate,
    formulaId,
    sampleSize,
    dateReceived,
    comments,
    testedBy,
    testedDate,
    reviewedBy,
    reviewedDate,
    // coaVerification,
    coaRows, // ✅ add
  });

  type SavedReport = {
    id: string;
    status: COAReportStatus;
    reportNumber?: number | string;
    version?: number;
  };

  const lock = (f: string) =>
    forceReadOnly || !canEdit(role, f, status as COAReportStatus);

  // --- E-Sign modal state (Admin-only) ---
  // Admin E-sign modal state
  const [showESign, setShowESign] = useState(false);
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

  // const corrByField = useMemo(() => {
  //   const m: Record<string, CorrectionItem[]> = {};
  //   for (const c of openCorrections) (m[c.fieldKey] ||= []).push(c);
  //   return m;
  // }, [openCorrections]);

  const hasCorrection = (keyOrPrefix: string) =>
    hasOpenCorrectionKey(keyOrPrefix);

  // const correctionText = (field: string) =>
  //   corrByField[field]?.map((c) => `• ${c.message}`).join("\n");

  const [selectingCorrections, setSelectingCorrections] = useState(false);
  const [pendingCorrections, setPendingCorrections] = useState<
    { fieldKey: string; message: string; oldValue?: string | null }[]
  >([]);

  // if opening an existing template later, you will prefill these

  function stringify(v: any) {
    if (v === null || v === undefined) return "";
    if (Array.isArray(v)) return v.join(", ");
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }

  const coaRowKey = (rowKey: string) => `coaRows:${rowKey}`;
  const coaCellKey = (rowKey: string, col: "Specification" | "result") =>
    `coaRows:${rowKey}:${col}`;

  function getFieldDisplayValue(fieldKey: string) {
    const base = fieldKey.split(":")[0];

    switch (base) {
      case "client":
        return client;
      case "dateSent":
        return formatDateForInput(dateSent);
      case "sampleDescription":
        return sampleDescription;
      case "testTypes":
        return stringify(coaVerification);

      case "lotBatchNo":
        return lotBatchNo;
      case "manufactureDate":
        return formatDateForInput(manufactureDate);
      case "formulaId":
        return formulaId;
      case "sampleSize":
        return sampleSize;
      case "coaRows": {
        // coaRows:ROWKEY:col
        const [, rowKey, col] = fieldKey.split(":");
        const row = (coaRows ?? []).find((r) => r.key === rowKey);
        if (!row) return "";
        if (!col) return stringify(row);
        return stringify((row as any)[col]);
      }
      case "dateReceived":
        return formatDateForInput(dateReceived);
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

  const uiNeedsESign = (s: string) =>
    (role === "ADMIN" ||
      role === "SYSTEMADMIN" ||
      role === "FRONTDESK" ||
      role === "QA") &&
    (s === "UNDER_CLIENT_REVIEW" || s === "LOCKED");

  function requestStatusChange(target: COAReportStatus) {
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

  const [pendingStatus, setPendingStatus] = useState<COAReportStatus | null>(
    null,
  );
  const otherLabel = (key: string) => key.replace("_", " "); // "OTHER_1" -> "OTHER 1"

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
        : pickedField === keyOrPrefix
          ? "ring-2 ring-blue-500 bg-blue-50" // ✅ selected cell highlight
          : "";

  const canResolveField = (field: string) => {
    if (!reportId || !role) return false;
    const base = field.split(":")[0]; // "pathogens" for "pathogens:E_COLI"
    return canEdit(role, base, status as COAReportStatus);
  };

  // Resolve ALL corrections for a field
  async function resolveField(fieldKey: string) {
    if (!reportId) return;
    return runBusy("RESOLVE", async () => {
      // const token = localStorage.getItem("token")!;
      const items = openCorrections.filter((c) => c.fieldKey === fieldKey);
      if (!items.length) return;

      await Promise.all(
        items.map((c) => resolveCorrection(reportId!, c.id, "Fixed")),
      );
      const fresh = await getCorrections(reportId!);
      setCorrections(fresh);
      flashResolved(fieldKey); // ✅ show green halo briefly
    });
  }

  // Resolve a single correction
  async function resolveOne(c: CorrectionItem) {
    if (!reportId) return;
    return runBusy("RESOLVE", async () => {
      // const token = localStorage.getItem("token")!;
      await resolveCorrection(reportId!, c.id, "Fixed");
      const fresh = await getCorrections(reportId!);
      setCorrections(fresh);
      flashResolved(c.fieldKey); // ✅ show green halo briefly
    });
  }

  // Update ResolveOverlay to support prefixes too (so row overlay works)
  function ResolveOverlay({ field }: { field: string }) {
    if (!hasOpenCorrection(field) || !canResolveField(field)) return null;

    return (
      <button
        type="button"
        title="Resolve all notes for this field"
        onClick={(e) => {
          e.stopPropagation();
          resolveField(field);
        }}
        className="absolute -top-2 -right-2 z-20 h-5 w-5 rounded-full grid place-items-center
                 bg-emerald-600 text-white shadow hover:bg-emerald-700 focus:outline-none
                 focus:ring-2 focus:ring-emerald-400"
      >
        ✓
      </button>
    );
  }

  // ------------- SAVE -------------
  const handleSave = async (): Promise<boolean> => {
    return (
      (await runBusy("SAVE", async () => {
        const values = makeValues();
        validateAndSetErrors(values);

        const fullPayload = {
          client,
          dateSent,
          formType: "COA" as const,
          sampleDescription,
          coaVerification,

          lotBatchNo,
          manufactureDate: manufactureDate?.trim() ? manufactureDate : null,
          formulaId,
          sampleSize,

          dateReceived,

          // ✅ REQUIRED so table data persists
          coaRows,

          comments,
          testedBy,
          testedDate,
          reviewedBy,
          reviewedDate,
        };
        const BASE_ALLOWED: Record<Role, string[]> = {
          ADMIN: ["*"],
          SYSTEMADMIN: [],
          FRONTDESK: [],
          CHEMISTRY: [
            "dateReceived",
            "comments",
            "testedBy",
            "testedDate",
            "coaRows",
          ],
          MC: ["dateReceived", "comments", "testedBy", "testedDate", "coaRows"],
          QA: ["dateCompleted"],
          CLIENT: [
            "client",
            "dateSent",
            "sampleDescription",
            // "testTypes",
            "lotBatchNo",
            "manufactureDate",
            "formulaId",
            "sampleSize",
            "sampleTypes",
            "comments",
            "coaRows",
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
              formType: "COA",
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
            saved = await api<SavedReport>(`/chemistry-reports/${reportId}`, {
              method: "PATCH",
              body: JSON.stringify({
                ...payload,
                reason: "Saving",
                expectedVersion: reportVersion,
              }),
            });
          } else {
            saved = await api<SavedReport>("/chemistry-reports/coa", {
              method: "POST",
              body: JSON.stringify({ ...payload, formType: "COA" }),
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
          alert(
            "❌ Error saving coa report: " + (err.message || "Unknown error"),
          );
          return false;

          return false;
        }
      })) ?? false
    );
  };

  type UpdatedReport = {
    status?: COAReportStatus;
    reportNumber?: number | string;
  };

  async function handleStatusChange(
    newStatus: COAReportStatus,
    opts?: { reason?: string; eSignPassword?: string },
  ) {
    return await runBusy("STATUS", async () => {
      const values = makeValues();

      const okFields = validateAndSetErrors(values);
      // const okRows = validateActiveRows(values.actives || [], role);

      if (
        newStatus === "UNDER_DRAFT_REVIEW" ||
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
        // if (!okRows) {
        //   alert("⚠️ Please fix the highlighted rows before changing status.");
        //   return;
        // }
      }
      if (newStatus === "SUBMITTED_BY_CLIENT") {
        setDateSent(todayISO());
      }

      // 3) Ensure latest edits are saved
      if (!reportId || isDirty) {
        const saved = await handleSave(); // <-- your COA save (POST/PATCH /reports)
        if (!saved) return;
      }
      // 4) PATCH status (THIS is where your 400 reason/header issue matters)
      try {
        const updated = await api<UpdatedReport>(
          `/chemistry-reports/${reportId}/status`,
          {
            method: "PATCH",
            body: JSON.stringify({
              status: newStatus,
              reason: opts?.reason ?? "Changing Status", // ✅ required by 21 CFR Part 11 rule
              eSignPassword: opts?.eSignPassword ?? undefined,
              expectedVersion: reportVersion,
            }),
            // If your API supports header alternative:
            // headers: { "X-Change-Reason": opts?.reason ?? "Changing Status" }
          },
        );

        setStatus(updated.status ?? newStatus);
        setIsDirty(false);
        alert(`✅ Status changed to ${newStatus}`);

        // navigate per role (same as micro)
        if (role === "CLIENT") navigate("/clientDashboard");
        else if (role === "FRONTDESK") navigate("/frontdeskDashboard");
        else if (role === "CHEMISTRY") navigate("/chemistryDashboard");
        else if (role === "MC") navigate("/mcDashboard");
        else if (role === "QA") navigate("/qaDashboard");
        else if (role === "ADMIN") navigate("/adminDashboard");
        else if (role === "SYSTEMADMIN") navigate("/systemAdminDashboard");
      } catch (err: any) {
        console.error(err);
        alert("❌ Error changing status: " + err.message);
      }
    });
  }

  const fallbackRoute = useMemo(() => {
    if (role === "CLIENT") return "/clientDashboard";
    if (role === "FRONTDESK") return "/frontdeskDashboard";
    if (role === "CHEMISTRY") return "/chemistryDashboard";
    if (role === "MC") return "/mcDashboard";
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

  // const handleClose = () => {
  //   if (onClose) onClose();
  //   else navigate(-1);
  // };

  const inputClass = (name: keyof typeof errors, extra = "") =>
    `input-editable px-1 py-[2px] text-[12px] leading-snug border ${
      errors[name] ? "border-red-500 ring-1 ring-red-500" : "border-black/70"
    } ${extra} ${
      hasCorrection(String(name)) ? "ring-2 ring-rose-500 animate-pulse" : ""
    }`;

  // Prefix-aware: matches exact field OR nested children
  function hasOpenCorrectionKey(keyOrPrefix: string) {
    return openCorrections.some(
      (c) =>
        c.fieldKey === keyOrPrefix || c.fieldKey.startsWith(`${keyOrPrefix}:`),
    );
  }

  // For UI highlighting, you usually want ONLY open corrections
  const hasOpenCorrection = (keyOrPrefix: string) =>
    hasOpenCorrectionKey(keyOrPrefix);

  // --- correction helpers (tooltip text) ---
  function correctionTextFor(keyOrPrefix: string) {
    const msgs = openCorrections
      .filter(
        (c) =>
          c.fieldKey === keyOrPrefix ||
          c.fieldKey.startsWith(`${keyOrPrefix}:`),
      )
      .map((c) => `• ${c.message}`);
    return msgs.length ? msgs.join("\n") : "";
  }

  // --- when selecting corrections, highlight the clicked cell/field too ---
  const [pickedField, setPickedField] = useState<string | null>(null);

  function pickCorrection(fieldKey: string) {
    if (!selectingCorrections) return;
    setPickedField(fieldKey); // ✅ highlight selected cell
    setAddForField(fieldKey);
    setAddMessage("");
  }

  const corrCursor = selectingCorrections ? "cursor-pointer" : "";

  function corrClick(fieldKey: string) {
    return (e: React.MouseEvent) => {
      if (!selectingCorrections) return;
      e.stopPropagation();
      pickCorrection(fieldKey);
    };
  }

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
      const list = await api<any[]>(`/chemistry-reports/${id}/attachments`, {
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

  const APPROVE_REQUIRES_ATTACHMENT = new Set<COAReportStatus>([
    "UNDER_CLIENT_REVIEW",
  ]);

  function isApproveAction(targetStatus: COAReportStatus) {
    return APPROVE_REQUIRES_ATTACHMENT.has(targetStatus);
  }

  const HIDE_SIGNATURES_FOR = new Set<COAReportStatus>([
    "DRAFT",
    "UNDER_DRAFT_REVIEW",
    "SUBMITTED_BY_CLIENT",
  ]);
  const showSignatures = !HIDE_SIGNATURES_FOR.has(status as COAReportStatus);

  {
    /* ITEM (fixed) */
  }
  // const isOtherRow = (k: string) => k.startsWith("OTHER_");

  // ---------------- RENDER ----------------
  return (
    <>
      <PrintStyles />
      <DashStyles />

      <div className="sheet mx-auto max-w-[800px] bg-white text-black border border-black shadow p-4">
        {/* Top buttons */}
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
          <button
            type="button"
            className="px-3 py-1 rounded-md border bg-gray-600 text-white disabled:opacity-60"
            onClick={handleClose}
            disabled={isBusy}
          >
            {isBusy ? "Working..." : "Close"}
          </button>

          {!isTemplateViewMode &&
            !HIDE_SAVE_FOR.has(status as COAReportStatus) && (
              <button
                className="px-3 py-1 rounded-md border bg-blue-600 text-white disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                onClick={handleSave}
                disabled={
                  role === "SYSTEMADMIN" ||
                  role === "FRONTDESK" ||
                  isBusy ||
                  status === "UNDER_CLIENT_REVIEW" ||
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

        {/* Letterhead – same look as Micro */}
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
            56 PARK AVENUE, LYNDHURST, NJ 07071 <br />
            Tel: (201) 883 1222 • Fax: (201) 883 0449
          </div>
          <div className="text-[12px]">
            Email: <span style={{ color: "blue" }}>lab@omegabiochem.com</span>
          </div>
          <div className="mt-1 grid grid-cols-3 items-center">
            <div />
            <div className="text-[18px] font-bold text-center underline">
              {status === "DRAFT" ||
              status === "UNDER_DRAFT_REVIEW" ||
              status === "SUBMITTED_BY_CLIENT"
                ? "COA SUBMISSION FORM"
                : "COA REPORT"}
            </div>
            <div className="text-right text-[12px] font-bold font-medium">
              {!isTemplateMode && reportNumber ? <> {reportNumber}</> : null}
            </div>
          </div>
        </div>

        {/* CLIENT / DATE SENT */}
        <div className="w-full border border-black text-[12px]">
          <div className="grid grid-cols-[67%_33%] border-b border-black">
            <div className="px-2 border-r border-black flex items-center gap-1">
              <div className="whitespace-nowrap font-medium">CLIENT :</div>
              {lock("client") ? (
                <div className="flex-1  min-h-[14px]">{client}</div>
              ) : (
                <input
                  className="flex-1 border-none  text-[12px]"
                  value={client}
                  onChange={(e) => {
                    setClient(e.target.value.toUpperCase());
                    markDirty();
                  }}
                />
              )}
            </div>
            <div
              id="f-dateSent"
              className={`px-2 flex items-center gap-1 relative ${dashClass(
                "dateSent",
              )}`}
            >
              <div
                className={`whitespace-nowrap font-medium ${corrCursor}`}
                onClick={corrClick("dateSent")}
                title={
                  selectingCorrections ? "Click to add correction" : undefined
                }
              >
                DATE SENT :
              </div>

              <FieldErrorBadge name="dateSent" errors={errors} />
              <ResolveOverlay field="dateSent" />

              {lock("dateSent") ? (
                <div className="flex-1 min-h-[14px]">
                  {formatDateForInput(dateSent)}
                </div>
              ) : (
                <input
                  className={inputClass("dateSent", "flex-1")}
                  type="date"
                  min={todayISO()}
                  value={formatDateForInput(dateSent)}
                  onChange={(e) => {
                    if (selectingCorrections) return;
                    setDateSent(e.target.value);
                    clearError("dateSent");
                    markDirty();
                  }}
                  aria-invalid={!!errors.dateSent}
                />
              )}
            </div>
          </div>

          {/* SAMPLE DESCRIPTION line */}
          <div
            id="f-sampleDescription"
            className={`border-b border-black flex items-center gap-2 px-2 relative ${dashClass(
              "sampleDescription",
            )}`}
          >
            <div
              className={`w-40 font-medium ${corrCursor}`}
              onClick={corrClick("sampleDescription")}
              title={
                selectingCorrections ? "Click to add correction" : undefined
              }
            >
              SAMPLE DESCRIPTION :
            </div>

            <FieldErrorBadge name="sampleDescription" errors={errors} />
            <ResolveOverlay field="sampleDescription" />

            {lock("sampleDescription") ? (
              <div className="flex-1 min-h-[14px]">{sampleDescription}</div>
            ) : (
              <input
                className={inputClass("sampleDescription", "flex-1")}
                value={sampleDescription}
                onChange={(e) => {
                  if (selectingCorrections) return;
                  setSampleDescription(e.target.value);
                  clearError("sampleDescription");
                  markDirty();
                }}
                aria-invalid={!!errors.sampleDescription}
              />
            )}
          </div>

          {/* TYPE OF TEST / SAMPLE COLLECTED */}
          {/* TYPE OF TEST (COA VERIFICATION only) */}
          <div className="grid grid-cols-[100%] border-b border-black text-[12px]">
            <div className="grid grid-cols-1 border-b border-black text-[12px]">
              <div className="px-2 flex items-center gap-2 text-[12px]">
                <span
                  className={`font-medium whitespace-nowrap ${selectingCorrections ? "cursor-pointer" : ""} relative ${dashClass("testTypes")}`}
                  onClick={(e) => {
                    if (!selectingCorrections) return;
                    e.stopPropagation();
                    pickCorrection("testTypes");
                  }}
                >
                  TYPE OF TEST :
                  <ResolveOverlay field="testTypes" />
                </span>

                <div
                  id="f-testTypes"
                  className={`inline-flex items-center gap-2 whitespace-nowrap px-1 ${
                    errors.testTypes
                      ? "border border-red-500 ring-1 ring-red-500"
                      : "border border-transparent"
                  }`}
                >
                  <label className="flex items-center gap-1 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={true}
                      disabled
                      className="accent-black"
                    />
                    COA Verification
                  </label>
                </div>

                <FieldErrorBadge name="testTypes" errors={errors} />
              </div>
            </div>
          </div>

          {/* LOT / MFG DATE */}
          <div className="grid grid-cols-[50%_50%] border-b border-black text-[12px]">
            <div className="px-2 border-r border-black flex items-center gap-2">
              <span
                className={`font-medium whitespace-nowrap ${corrCursor} relative ${dashClass(
                  "lotBatchNo",
                )}`}
                onClick={corrClick("lotBatchNo")}
                title={
                  selectingCorrections ? "Click to add correction" : undefined
                }
              >
                LOT / BATCH # :
                <ResolveOverlay field="lotBatchNo" />
              </span>

              <FieldErrorBadge name="lotBatchNo" errors={errors} />
              {lock("lotBatchNo") ? (
                <div className="flex-1 min-h-[14px]"> {lotBatchNo}</div>
              ) : (
                <input
                  className={inputClass("lotBatchNo", "flex-1")}
                  value={lotBatchNo}
                  onChange={(e) => {
                    if (selectingCorrections) return;
                    setLotBatchNo(e.target.value);
                    clearError("lotBatchNo");
                    markDirty();
                  }}
                  aria-invalid={!!errors.lotBatchNo}
                />
              )}
            </div>
            <div className="px-2 flex items-center gap-2">
              <span
                className={`font-medium whitespace-nowrap ${corrCursor} relative ${dashClass(
                  "manufactureDate",
                )}`}
                onClick={corrClick("manufactureDate")}
                title={
                  selectingCorrections ? "Click to add correction" : undefined
                }
              >
                MANUFACTURE DATE :
                <ResolveOverlay field="manufactureDate" />
              </span>

              <FieldErrorBadge name="manufactureDate" errors={errors} />
              {lock("manufactureDate") ? (
                <div className="flex-1 min-h-[14px]">
                  {formatDateForInput(manufactureDate)}
                </div>
              ) : (
                <input
                  className={inputClass("manufactureDate", "flex-1")}
                  type="date"
                  // min={todayISO()}
                  value={formatDateForInput(manufactureDate)}
                  onChange={(e) => {
                    if (selectingCorrections) return;
                    setManufactureDate(e.target.value);
                    clearError("manufactureDate");
                    markDirty();
                  }}
                  aria-invalid={!!errors.manufactureDate}
                />
              )}
            </div>
          </div>

          {/* FORMULA / SAMPLE SIZE / NUMBER OF ACTIVES */}
          <div className="grid grid-cols-[35%_30%_35%] border-b border-black text-[12px]">
            <div className="px-2 border-r border-black flex items-center gap-1">
              <span
                className={`whitespace-nowrap font-medium ${corrCursor} relative ${dashClass(
                  "formulaId",
                )}`}
                onClick={corrClick("formulaId")}
                title={
                  selectingCorrections ? "Click to add correction" : undefined
                }
              >
                FORMULA # / ID # :
                <ResolveOverlay field="formulaId" />
              </span>

              <FieldErrorBadge name="formulaId" errors={errors} />
              {lock("formulaId") ? (
                <div className="flex-1 min-h-[14px]">{formulaId}</div>
              ) : (
                <input
                  className={inputClass("formulaId", "w-[140px]")}
                  value={formulaId}
                  onChange={(e) => {
                    if (selectingCorrections) return;
                    setFormulaId(e.target.value);
                    clearError("formulaId");
                    markDirty();
                  }}
                  aria-invalid={!!errors.formulaId}
                />
              )}
            </div>

            <div className="px-2 border-r border-black flex items-center gap-1">
              <span
                className={`whitespace-nowrap font-medium ${corrCursor} relative ${dashClass(
                  "sampleSize",
                )}`}
                onClick={corrClick("sampleSize")}
                title={
                  selectingCorrections ? "Click to add correction" : undefined
                }
              >
                SAMPLE SIZE :
                <ResolveOverlay field="sampleSize" />
              </span>

              <FieldErrorBadge name="sampleSize" errors={errors} />
              {lock("sampleSize") ? (
                <div className="flex-1 min-h-[14px]">{sampleSize}</div>
              ) : (
                <input
                  className={inputClass("sampleSize", "w-[140px]")}
                  value={sampleSize}
                  onChange={(e) => {
                    if (selectingCorrections) return;
                    setSampleSize(e.target.value);
                    clearError("sampleSize");
                    markDirty();
                  }}
                  aria-invalid={!!errors.sampleSize}
                />
              )}
            </div>
          </div>

          {/* SAMPLE TYPE checkboxes */}
          {/* SAMPLE TYPE checkboxes */}
          <div className="px-2 text-[12px] grid grid-cols-[auto_1fr] items-stretch">
            {/* RIGHT: Date received */}
            <div className="flex items-center gap-2 whitespace-nowrap pl-2 py-1">
              <span
                className={`whitespace-nowrap font-medium ${corrCursor} relative ${dashClass(
                  "dateReceived",
                )}`}
                onClick={corrClick("dateReceived")}
                title={
                  selectingCorrections ? "Click to add correction" : undefined
                }
              >
                DATE RECEIVED :
                <ResolveOverlay field="dateReceived" />
              </span>

              {lock("dateReceived") ? (
                <div className="flex-1 min-h-[14px]">
                  {formatDateForInput(dateReceived)}
                </div>
              ) : (
                <input
                  id="f-dateReceived"
                  type="date"
                  min={todayISO()}
                  className={`
                      w-[80px] border-0 border-b outline-none text-[11px]
                      ${
                        errors.dateReceived
                          ? "border-b-red-500 ring-1 ring-red-500"
                          : "border-b-black/60"
                      }
                    `}
                  value={formatDateForInput(dateReceived)}
                  onChange={(e) => {
                    if (selectingCorrections) return;
                    setDateReceived(e.target.value);
                    clearError("dateReceived");
                    markDirty();
                  }}
                  aria-invalid={!!errors.dateReceived}
                />
              )}

              <FieldErrorBadge name="dateReceived" errors={errors} />
            </div>
          </div>
        </div>

        {/* COA SPEC TABLE (from COA) */}
        <div
          className={`mt-3 border text-[11px] relative ${
            errors.coaRows
              ? "border-red-500 ring-1 ring-red-500"
              : "border-black"
          }`}
        >
          <FieldErrorBadge name="coaRows" errors={errors} />

          {/* ✅ show message text */}
          <FieldErrorText name="coaRows" errors={errors} className="px-2" />

          <div className="grid grid-cols-[42%_29%_29%] font-semibold text-center border-b border-black min-h-[24px]">
            <div className="p-1 border-r border-black flex items-center justify-center">
              Item
            </div>
            <div className="p-1 border-r border-black flex items-center justify-center">
              Specification
            </div>
            <div className="p-1 flex items-center justify-center">Result</div>
          </div>

          {(coaRows ?? []).map((row) => {
            const rk = coaRowKey(row.key);
            const kStd = coaCellKey(row.key, "Specification");
            const kRes = coaCellKey(row.key, "result");

            return (
              <div
                key={row.key}
                className="grid grid-cols-[42%_29%_29%] border-b last:border-b-0 border-black relative"
                onClick={(e) => {
                  if (!selectingCorrections) return;
                  e.stopPropagation();
                  pickCorrection(rk);
                }}
                title={
                  selectingCorrections
                    ? "Click to add correction for this row"
                    : undefined
                }
              >
                {/* ITEM (fixed OR editable for OTHER rows) */}
                {/* <div className="p-1 border-r border-black font-medium">
                  {isOtherRow(row.key) &&
                  role === "CLIENT" &&
                  !lock("coaRows") &&
                  !selectingCorrections ? (
                    <input
                      className="w-full border-0 bg-transparent outline-none text-[11px]"
                      value={row.item ?? ""}
                      placeholder={otherLabel(row.key)} // still fine
                      onFocus={() => {
                        const cur = (row.item ?? "").trim().toUpperCase();
                        if (cur === otherLabel(row.key).toUpperCase()) {
                          setCoaRows((prev) =>
                            prev.map((r) =>
                              r.key === row.key ? { ...r, item: "" } : r,
                            ),
                          );
                          markDirty();
                        }
                      }}
                      onBlur={() => {
                        // ✅ if user leaves blank, restore OTHER again
                        const cur = (row.item ?? "").trim();
                        if (!cur) {
                          setCoaRows((prev) =>
                            prev.map((r) =>
                              r.key === row.key
                                ? { ...r, item: otherLabel(row.key) }
                                : r,
                            ),
                          );
                          markDirty();
                        }
                      }}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCoaRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key ? { ...r, item: v } : r,
                          ),
                        );
                        markDirty();
                      }}
                    />
                  ) : (
                    <div className="min-h-[14px]">
                      {(row.item ?? "").trim() ? row.item : "-"}
                    </div>
                  )}
                </div> */}

                {/* ITEM (editable for ALL rows when coaRows is editable) */}
                <div className="p-1 border-r border-black font-medium">
                  {!lock("coaRows") && !selectingCorrections ? (
                    <input
                      className="w-full border-0 bg-transparent outline-none text-[11px]"
                      value={row.item ?? ""}
                      placeholder={otherLabel(row.key)} // optional
                      onChange={(e) => {
                        const v = e.target.value;
                        setCoaRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key ? { ...r, item: v } : r,
                          ),
                        );
                        markDirty();
                      }}
                    />
                  ) : (
                    <div className="min-h-[14px]">
                      {(row.item ?? "").trim() ? row.item : "-"}
                    </div>
                  )}
                </div>

                {/* Specification (client only) */}
                <div
                  className={`border-r border-black px-1 relative ${dashClass(kStd)} ${corrCursor}`}
                  title={
                    !selectingCorrections ? correctionTextFor(kStd) : undefined
                  } // ✅ show reason
                  onClick={(e) => {
                    if (!selectingCorrections) return;
                    e.stopPropagation();
                    pickCorrection(kStd);
                  }}
                >
                  <ResolveOverlay field={kStd} />
                  <CellTextarea
                    value={row.Specification ?? ""}
                    readOnly={
                      lock("coaRows") ||
                      role !== "CLIENT" ||
                      selectingCorrections
                    }
                    onChange={(v) => {
                      if (
                        lock("coaRows") ||
                        role !== "CLIENT" ||
                        selectingCorrections
                      )
                        return;
                      setCoaRows((prev) =>
                        prev.map((r) =>
                          r.key === row.key ? { ...r, Specification: v } : r,
                        ),
                      );
                      markDirty();
                    }}
                  />
                </div>

                {/* RESULT (lab only) */}
                <div
                  className={`px-1 relative ${dashClass(kRes)} ${corrCursor}`}
                  title={
                    !selectingCorrections ? correctionTextFor(kRes) : undefined
                  } // ✅
                  onClick={(e) => {
                    if (!selectingCorrections) return;
                    e.stopPropagation();
                    pickCorrection(kRes);
                  }}
                >
                  <ResolveOverlay field={kRes} />
                  <CellTextarea
                    value={row.result ?? ""}
                    readOnly={
                      lock("coaRows") ||
                      role === "CLIENT" ||
                      selectingCorrections
                    }
                    onChange={(v) => {
                      if (
                        lock("coaRows") ||
                        role === "CLIENT" ||
                        selectingCorrections
                      )
                        return;
                      setCoaRows((prev) =>
                        prev.map((r) =>
                          r.key === row.key ? { ...r, result: v } : r,
                        ),
                      );
                      markDirty();
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Comments + signatures */}
        <div className="mt-2 text-[12px]">
          {/* Comments (3 lines) */}
          <div className="mt-2 text-[12px]">
            <div className="flex items-start gap-2 mb-2">
              <span
                className={`font-medium mt-[2px] ${corrCursor} relative ${dashClass(
                  "comments",
                )}`}
                onClick={corrClick("comments")}
                title={
                  selectingCorrections ? "Click to add correction" : undefined
                }
              >
                Comments :
                <ResolveOverlay field="comments" />
              </span>

              <FieldErrorBadge name="comments" errors={errors} />

              {lock("comments") ? (
                <div className="flex-1 min-h-[42px] whitespace-pre-wrap break-words">
                  {comments}
                </div>
              ) : (
                <textarea
                  className={inputClass(
                    "comments",
                    "flex-1 resize-none leading-[14px] py-[2px]",
                  )}
                  rows={3}
                  value={comments}
                  onChange={(e) => {
                    if (selectingCorrections) return;
                    setComments(e.target.value);
                    clearError("comments");
                    markDirty();
                  }}
                  aria-invalid={!!errors.comments}
                />
              )}
            </div>
          </div>

          {showSignatures && (
            <>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={`font-medium ${corrCursor} relative ${dashClass(
                        "testedBy",
                      )}`}
                      onClick={corrClick("testedBy")}
                      title={
                        selectingCorrections
                          ? "Click to add correction"
                          : undefined
                      }
                    >
                      VERIFIED BY :
                      <ResolveOverlay field="testedBy" />
                    </span>

                    <FieldErrorBadge name="testedBy" errors={errors} />
                    <input
                      className={inputClass(
                        "testedBy",
                        "flex-1 border-0 border-b border-black/60 outline-none",
                      )}
                      value={testedBy}
                      onChange={(e) => {
                        if (selectingCorrections) return;
                        setTestedBy(e.target.value.toUpperCase());
                        clearError("testedBy");
                        markDirty();
                      }}
                      aria-invalid={!!errors.testedBy}
                      readOnly={lock("testedBy")}
                      placeholder="Name"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-medium ${corrCursor} relative ${dashClass(
                        "testedDate",
                      )}`}
                      onClick={corrClick("testedDate")}
                      title={
                        selectingCorrections
                          ? "Click to add correction"
                          : undefined
                      }
                    >
                      DATE :
                      <ResolveOverlay field="testedDate" />
                    </span>
                    <FieldErrorBadge name="testedDate" errors={errors} />
                    <input
                      className={inputClass(
                        "testedDate",
                        "flex-1 border-0 border-b border-black/60 outline-none",
                      )}
                      type="date"
                      min={todayISO()}
                      value={formatDateForInput(testedDate)}
                      onChange={(e) => {
                        if (selectingCorrections) return;
                        setTestedDate(e.target.value);
                        clearError("testedDate");
                        markDirty();
                      }}
                      aria-invalid={!!errors.testedDate}
                      readOnly={lock("testedDate")}
                      placeholder="MM/DD/YYYY"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={`font-medium ${corrCursor} relative ${dashClass(
                        "reviewedBy",
                      )}`}
                      onClick={corrClick("reviewedBy")}
                      title={
                        selectingCorrections
                          ? "Click to add correction"
                          : undefined
                      }
                    >
                      REVIEWED BY :
                      <ResolveOverlay field="reviewedBy" />
                    </span>

                    <FieldErrorBadge name="reviewedBy" errors={errors} />
                    <input
                      className={inputClass(
                        "reviewedBy",
                        "flex-1 border-0 border-b border-black/60 outline-none",
                      )}
                      value={reviewedBy}
                      onChange={(e) => {
                        if (selectingCorrections) return;
                        setReviewedBy(e.target.value.toUpperCase());
                        clearError("reviewedBy");
                        markDirty();
                      }}
                      aria-invalid={!!errors.reviewedBy}
                      readOnly={lock("reviewedBy")}
                      placeholder="Name"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-medium ${corrCursor} relative ${dashClass(
                        "reviewedDate",
                      )}`}
                      onClick={corrClick("reviewedDate")}
                      title={
                        selectingCorrections
                          ? "Click to add correction"
                          : undefined
                      }
                    >
                      REVIEWED DATE :
                      <ResolveOverlay field="reviewedDate" />
                    </span>

                    <FieldErrorBadge name="reviewedDate" errors={errors} />
                    <input
                      className={inputClass(
                        "reviewedDate",
                        "flex-1 border-0 border-b border-black/60 outline-none",
                      )}
                      type="date"
                      min={todayISO()}
                      value={formatDateForInput(reviewedDate)}
                      onChange={(e) => {
                        if (selectingCorrections) return;
                        setReviewedDate(e.target.value);
                        clearError("reviewedDate");
                        markDirty();
                      }}
                      aria-invalid={!!errors.reviewedDate}
                      readOnly={lock("reviewedDate")}
                      placeholder="MM/DD/YYYY"
                    />
                  </div>
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
            {STATUS_TRANSITIONS[status as COAReportStatus]?.next.map(
              (targetStatus: COAReportStatus) => {
                if (
                  STATUS_TRANSITIONS[status as COAReportStatus].canSet.includes(
                    role!,
                  ) &&
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
              },
            )}
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
                  } else if (role === "CHEMISTRY") {
                    navigate("/chemistryDashboard");
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
                  setPickedField(null);
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
                    setPickedField(null);
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
                  <div className="text-[11px] font-bold text-black">
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
