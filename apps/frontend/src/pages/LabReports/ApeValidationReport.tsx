import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import {
  JJL_SAMPLE_TYPE_OPTIONS,
  JJL_TYPE_OF_TEST_OPTIONS,
  todayISO,
} from "../../utils/microMixReportFormWorkflow";
import {
  APE_STATUS_TRANSITIONS,
  canRoleEditApeChildField,
  pickApeChildEditablePayload,
  type ApeReportStatus,
  type CorrectionItem,
} from "../../utils/apeReportFormWorkflow";
import {
  createCorrections,
  getCorrections,
  resolveCorrection,
} from "../../utils/apeReportValidation";

type Role =
  | "SYSTEMADMIN"
  | "ADMIN"
  | "FRONTDESK"
  | "MICRO"
  | "CHEMISTRY"
  | "QA"
  | "CLIENT"
  | "MC";

type ReportStatus = string;

type BusyAction =
  | null
  | "SAVE"
  | "STATUS"
  | "SEND_CORRECTIONS"
  | "ADD_CORRECTION"
  | "RESOLVE";

type FieldErrors = Record<string, string>;

type CorrectionFieldOption = {
  key: string;
  label: string;
  value: string;
};

type ValidationRow = {
  organism: string;
  control: string;
  avgCfuForTestSample: string;
};

type ValidationSection = {
  key: string;
  title: string;
  rows: ValidationRow[];
};

type ApeValidationReportProps = {
  report?: any;
  onClose?: () => void;
  embedded?: boolean;
  pageMode?: "VIEW" | "UPDATE";
  hideTopActions?: boolean;
  hideBottomActions?: boolean;
  forcePageReadOnly?: boolean;
  onSaved?: (updated: any) => void;
  onStatusChanged?: (updated: any) => void;
  beforeParentStatusChange?: (
    targetStatus: ReportStatus,
    currentChild?: any,
  ) => boolean | Promise<boolean>;
};

const REPORT_TYPE = "APE_VALIDATION_REPORT";
const INITIAL_APE_CHILD_STATUS: ReportStatus = "UNDER_TESTING_REVIEW";

const HIDE_SAVE_FOR = new Set<ReportStatus>([
  "APPROVED",
  "FINAL_APPROVED",
  "LOCKED",
]);

const ALWAYS_SHOW_SIGNATURES = true;

const EDIT_ROLES = new Set<Role>(["MICRO", "MC", "ADMIN", "SYSTEMADMIN"]);

const statusButtons: Record<string, { label: string; color: string }> = {
  UNDER_DRAFT_REVIEW: { label: "Review", color: "bg-slate-700" },
  SUBMITTED_BY_CLIENT: { label: "Submit", color: "bg-green-600" },

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
  UNDER_RESUBMISSION_TESTING_REVIEW: {
    label: "Approve",
    color: "bg-blue-600",
  },

  RECEIVED_BY_FRONTDESK: {
    label: "Approve",
    color: "bg-green-600",
  },

  FRONTDESK_ON_HOLD: { label: "Hold", color: "bg-red-500" },
  FRONTDESK_NEEDS_CORRECTION: {
    label: "Needs Correction",
    color: "bg-yellow-500",
  },

  UNDER_QA_REVIEW: { label: "Approve", color: "bg-green-600" },
  QA_NEEDS_CORRECTION: {
    label: "Needs Correction",
    color: "bg-yellow-500",
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

  UNDER_ADMIN_REVIEW: { label: "Approve", color: "bg-green-700" },
  ADMIN_NEEDS_CORRECTION: {
    label: "Needs Correction",
    color: "bg-yellow-600",
  },
  ADMIN_REJECTED: { label: "Reject", color: "bg-red-700" },

  APPROVED: { label: "Approve", color: "bg-green-700" },
  LOCKED: { label: "Lock", color: "bg-slate-900" },

  CHANGE_REQUESTED: { label: "Request Change", color: "bg-amber-600" },
  UNDER_CHANGE_UPDATE: { label: "Approve", color: "bg-green-800" },
  CORRECTION_REQUESTED: { label: "Request Correction", color: "bg-rose-600" },
  UNDER_CORRECTION_UPDATE: { label: "Approve", color: "bg-green-800" },
};

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

type ParentApeOrganism = {
  key?: string;
  label?: string;
  checked?: boolean;
};

const APE_ORGANISM_OPTIONS = [
  { key: "E_COLI", reportLabel: "Escherichia Coli" },
  { key: "S_AUREUS", reportLabel: "Staphylococcus Aureus" },
  { key: "P_AERUGINOSA", reportLabel: "Pseudomonas Aeruginosa" },
  { key: "C_ALBICANS", reportLabel: "Candida Albicans" },
  { key: "A_NIGER", reportLabel: "Aspergillus Niger" },
  { key: "B_CEPACIA", reportLabel: "B. Cepacia" },
] as const;

const DEFAULT_APE_ORGANISMS = APE_ORGANISM_OPTIONS.filter(
  (item) => item.key !== "B_CEPACIA",
).map((item) => item.reportLabel);

function normalizeOrganismToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function getSelectedApeOrganismNames(value: unknown): string[] {
  let source = value;

  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = [];
    }
  }

  if (!Array.isArray(source) || source.length === 0) {
    return [...DEFAULT_APE_ORGANISMS];
  }

  const selectedTokens = new Set(
    source
      .filter((item: ParentApeOrganism | string) =>
        typeof item === "string" ? true : item?.checked === true,
      )
      .flatMap((item: ParentApeOrganism | string) => {
        if (typeof item === "string") {
          return [normalizeOrganismToken(item)];
        }

        return [
          normalizeOrganismToken(item?.key),
          normalizeOrganismToken(item?.label),
        ];
      })
      .filter(Boolean),
  );

  const selected = APE_ORGANISM_OPTIONS.filter(
    (option) =>
      selectedTokens.has(normalizeOrganismToken(option.key)) ||
      selectedTokens.has(normalizeOrganismToken(option.reportLabel)),
  ).map((option) => option.reportLabel);

  return selected.length ? selected : [...DEFAULT_APE_ORGANISMS];
}

function makeRows(organismNames: string[]): ValidationRow[] {
  return organismNames.map((organism) => ({
    organism,
    control: "",
    avgCfuForTestSample: "",
  }));
}

function makeDefaultSections(organismNames: string[]): ValidationSection[] {
  return [
    {
      key: "NEUTRALIZER_WITH_PRODUCT",
      title: "VALIDATION DATA FOR NEUTRALIZER WITH PRODUCT",
      rows: makeRows(organismNames),
    },
    {
      key: "DILUENT_WITH_PRODUCT",
      title: "VALIDATION DATA FOR DILUENT WITH PRODUCT",
      rows: makeRows(organismNames),
    },
    {
      key: "MEDIA_WITHOUT_PRODUCT",
      title: "VALIDATION DATA FOR MEDIA WITHOUT PRODUCT",
      rows: makeRows(organismNames),
    },
  ];
}

function normalizeSections(
  value: any,
  organismNames: string[] = DEFAULT_APE_ORGANISMS,
): ValidationSection[] {
  const defaultSections = makeDefaultSections(organismNames);

  if (!Array.isArray(value)) return defaultSections;

  return defaultSections.map((defaultSection) => {
    const existingSection = value.find(
      (section: any) => section?.key === defaultSection.key,
    );

    return {
      key: defaultSection.key,
      title: existingSection?.title || defaultSection.title,
      rows: defaultSection.rows.map((defaultRow) => {
        const existingRow = existingSection?.rows?.find(
          (row: any) => row?.organism === defaultRow.organism,
        );

        return {
          organism: defaultRow.organism,
          control: existingRow?.control ?? "",
          avgCfuForTestSample: existingRow?.avgCfuForTestSample ?? "",
        };
      }),
    };
  });
}

function formatDateForInput(value?: string | null) {
  if (!value) return "";
  if (value === "NA") return "";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);

  return d.toISOString().split("T")[0];
}

const PrintStyles = () => (
  <style>{`
    @media print {
      @page { size: A4 portrait; margin: 14mm; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      .sheet { box-shadow: none !important; border: none !important; }
      input, textarea {
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
      }
    }
  `}</style>
);

function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white ${className}`}
      aria-hidden="true"
    />
  );
}

function SpinnerDark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black/70 ${className}`}
      aria-hidden="true"
    />
  );
}

const DashStyles = () => (
  <style>{`
    .dash { position: relative; z-index: 0; }
    .dash::after{
      content:"";
      position:absolute;
      inset:-4px;
      border-radius:6px;
      pointer-events:none;
      z-index:10;
      background:
        linear-gradient(90deg, var(--dash-color) 0 8px, transparent 8px 16px) 0 0 /16px 2px repeat-x,
        linear-gradient(90deg, var(--dash-color) 0 8px, transparent 8px 16px) 0 100% /16px 2px repeat-x,
        linear-gradient(0deg, var(--dash-color) 0 8px, transparent 8px 16px) 0 0 /2px 16px repeat-y,
        linear-gradient(0deg, var(--dash-color) 0 8px, transparent 8px 16px) 100% 0 /2px 16px repeat-y;
      opacity:0;
      animation: dash-move 1.05s linear infinite;
    }
    .dash-red::after { --dash-color:#dc2626; opacity:1; }
    .dash-green::after { --dash-color:#16a34a; opacity:1; }
    @keyframes dash-move {
      to {
        background-position: 16px 0, -16px 100%, 0 16px, 100% -16px;
      }
    }
    @media (prefers-reduced-motion: reduce) { .dash::after { animation:none; } }
    @media print { .dash::after { display:none; } }
  `}</style>
);

function isBlank(value: unknown) {
  return value === null || value === undefined || String(value).trim() === "";
}

function normalizeForCompare(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();

  try {
    return JSON.stringify(value);
  } catch {
    return String(value).trim();
  }
}

function isNeedsCorrectionStatus(status: ReportStatus) {
  return (
    status === "FRONTDESK_NEEDS_CORRECTION" ||
    status === "TESTING_NEEDS_CORRECTION" ||
    status === "QA_NEEDS_CORRECTION" ||
    status === "ADMIN_NEEDS_CORRECTION" ||
    status === "CLIENT_NEEDS_CORRECTION" ||
    status === "CHANGE_REQUESTED" ||
    status === "CORRECTION_REQUESTED"
  );
}

// function requiresReviewedSignature(targetStatus: ReportStatus) {
//   return (
//     targetStatus === "UNDER_CLIENT_REVIEW" ||
//     targetStatus === "UNDER_ADMIN_REVIEW" ||
//     targetStatus === "APPROVED" ||
//     targetStatus === "LOCKED"
//   );
// }

export default function ApeValidationReport({
  report,
  onClose,
  embedded = false,
  pageMode = "UPDATE",
  hideTopActions = false,
  hideBottomActions = false,
  forcePageReadOnly = false,
  onSaved,
  onStatusChanged,
  beforeParentStatusChange,
}: ApeValidationReportProps) {
  const { user } = useAuth();
  const role = user?.role as Role | undefined;
  const navigate = useNavigate();

  const detail = report?.apeValidationReport ?? report ?? {};

  const selectedApeOrganisms = useMemo(
    () =>
      getSelectedApeOrganismNames(
        (report as any)?.organisms ?? detail?.organisms,
      ),
    [(report as any)?.organisms, detail?.organisms],
  );
  const selectedApeOrganismsKey = selectedApeOrganisms.join("|");

  const [isDirty, setIsDirty] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const busyRef = useRef(false);

  const [errors, setErrors] = useState<FieldErrors>({});

  const [corrections, setCorrections] = useState<CorrectionItem[]>([]);
  const openCorrections = useMemo(
    () => corrections.filter((c) => c.status === "OPEN"),
    [corrections],
  );

  const [selectingCorrections, setSelectingCorrections] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<ReportStatus | null>(null);
  type CorrectionRecipientSide = "AUTO" | "CLIENT" | "LAB" | "BOTH";

  const [correctionRecipientSide, setCorrectionRecipientSide] =
    useState<CorrectionRecipientSide>("AUTO");

  const [pendingCorrections, setPendingCorrections] = useState<
    {
      fieldKey: string;
      message: string;
      oldValue?: string | null;
      recipientSide?: Exclude<CorrectionRecipientSide, "AUTO"> | null;
    }[]
  >([]);
  const [selectedCorrectionField, setSelectedCorrectionField] = useState("");
  const [addMessage, setAddMessage] = useState("");
  const [showCorrTray, setShowCorrTray] = useState(false);
  const [status, setStatus] = useState<ReportStatus>(
    report?.id
      ? report?.status || detail?.status || INITIAL_APE_CHILD_STATUS
      : INITIAL_APE_CHILD_STATUS,
  );

  const [reportId, setReportId] = useState<string | null>(report?.id || null);

  const [reportNumber, setReportNumber] = useState<string>(
    report?.reportNumber || "",
  );

  const [reportVersion, setReportVersion] = useState<number>(
    typeof report?.version === "number" ? report.version : 0,
  );

  const reportIdRef = useRef<string | null>(report?.id || null);
  const reportVersionRef = useRef<number>(
    typeof report?.version === "number" ? report.version : 0,
  );

  const workflowReportIdRef = useRef<string | null>(
    (report as any)?.parentReportId ||
      (report as any)?.workflowReportId ||
      null,
  );

  const workflowVersionRef = useRef<number>(
    typeof (report as any)?.parentVersion === "number"
      ? (report as any).parentVersion
      : typeof (report as any)?.workflowVersion === "number"
        ? (report as any).workflowVersion
        : 0,
  );

  const [client, setClient] = useState(detail?.client || "");
  const [dateSent, setDateSent] = useState(() => {
    if (report?.id) return formatDateForInput(detail?.dateSent) || todayISO();
    return todayISO();
  });

  const [typeOfTest, setTypeOfTest] = useState(detail?.typeOfTest || "APE");
  const [sampleType, setSampleType] = useState(detail?.sampleType || "");
  const [formulaNo, setFormulaNo] = useState(detail?.formulaNo || "");
  const [description, setDescription] = useState(detail?.description || "");
  const [lotNo, setLotNo] = useState(detail?.lotNo || "");
  const [manufactureDate, setManufactureDate] = useState(
    formatDateForInput(detail?.manufactureDate),
  );

  const [testSopNo, setTestSopNo] = useState(detail?.testSopNo || "");
  const [dateTested, setDateTested] = useState(
    formatDateForInput(detail?.dateTested),
  );

  const [testReference, setTestReference] = useState(
    detail?.testReference || "USP <51> CURRENT",
  );
  const [dateCompleted, setDateCompleted] = useState(
    formatDateForInput(detail?.dateCompleted),
  );

  const [validationSections, setValidationSections] = useState<
    ValidationSection[]
  >(normalizeSections(detail?.validationSections, selectedApeOrganisms));

  const [, setComments] = useState(detail?.comments || "");
  const [testedBy, setTestedBy] = useState(detail?.testedBy || "");
  const [testedDate, setTestedDate] = useState(
    formatDateForInput(detail?.testedDate),
  );
  const [reviewedBy, setReviewedBy] = useState(detail?.reviewedBy || "");
  const [reviewedDate, setReviewedDate] = useState(
    formatDateForInput(detail?.reviewedDate),
  );

  useEffect(() => {
    if (!reportId) return;

    getCorrections(reportId)
      .then((list) => setCorrections(list))
      .catch(() => {});
  }, [reportId]);

  function addRequiredError(
    nextErrors: FieldErrors,
    key: string,
    label: string,
    value: unknown,
  ) {
    if (isBlank(value)) nextErrors[key] = `${label} is required`;
  }

  function makeCorrectionFieldOptions(): CorrectionFieldOption[] {
    const options: CorrectionFieldOption[] = [
      { key: "client", label: "Client", value: client },
      {
        key: "dateSent",
        label: "Date Sent",
        value: formatDateForInput(dateSent),
      },
      { key: "typeOfTest", label: "Type of Test", value: typeOfTest },
      { key: "sampleType", label: "Sample Type", value: sampleType },
      { key: "formulaNo", label: "Formula #", value: formulaNo },
      { key: "description", label: "Description", value: description },
      { key: "lotNo", label: "Lot #", value: lotNo },
      {
        key: "manufactureDate",
        label: "Manufacture Date",
        value: formatDateForInput(manufactureDate),
      },
      { key: "testSopNo", label: "Test SOP #", value: testSopNo },
      { key: "testReference", label: "Test Reference", value: testReference },
      {
        key: "dateTested",
        label: "Date Tested",
        value: formatDateForInput(dateTested),
      },
      {
        key: "dateCompleted",
        label: "Date Completed",
        value: formatDateForInput(dateCompleted),
      },
      { key: "testedBy", label: "Tested By", value: testedBy },
      {
        key: "testedDate",
        label: "Tested Date",
        value: formatDateForInput(testedDate),
      },
      { key: "reviewedBy", label: "Reviewed By", value: reviewedBy },
      {
        key: "reviewedDate",
        label: "Reviewed Date",
        value: formatDateForInput(reviewedDate),
      },
    ];

    validationSections.forEach((section) => {
      section.rows.forEach((row, rowIndex) => {
        const prefix = `${section.title} - ${row.organism}`;
        options.push(
          {
            key: `validationSections.${section.key}.${rowIndex}.control`,
            label: `${prefix} Control`,
            value: row.control,
          },
          {
            key: `validationSections.${section.key}.${rowIndex}.avgCfuForTestSample`,
            label: `${prefix} Avg CFU for Test Sample`,
            value: row.avgCfuForTestSample,
          },
        );
      });
    });

    return options;
  }

  const correctionFieldOptions = useMemo(
    () => makeCorrectionFieldOptions(),
    [
      client,
      dateSent,
      typeOfTest,
      sampleType,
      formulaNo,
      description,
      lotNo,
      manufactureDate,
      testSopNo,
      testReference,
      dateTested,
      dateCompleted,
      validationSections,
      testedBy,
      testedDate,
      reviewedBy,
      reviewedDate,
    ],
  );

  function getFieldDisplayValue(fieldKey: string) {
    const direct = correctionFieldOptions.find((f) => f.key === fieldKey);
    return direct?.value ?? "";
  }

  function validateForStatusChange(_targetStatus: ReportStatus) {
    const nextErrors: FieldErrors = {};

    addRequiredError(nextErrors, "client", "Client", client);
    addRequiredError(nextErrors, "dateSent", "Date Sent", dateSent);
    addRequiredError(nextErrors, "typeOfTest", "Type of Test", typeOfTest);
    addRequiredError(nextErrors, "sampleType", "Sample Type", sampleType);
    addRequiredError(nextErrors, "formulaNo", "Formula #", formulaNo);
    addRequiredError(nextErrors, "description", "Description", description);
    addRequiredError(nextErrors, "lotNo", "Lot #", lotNo);
    addRequiredError(nextErrors, "testSopNo", "Test SOP #", testSopNo);
    addRequiredError(
      nextErrors,
      "testReference",
      "Test Reference",
      testReference,
    );
    addRequiredError(nextErrors, "dateTested", "Date Tested", dateTested);
    addRequiredError(
      nextErrors,
      "dateCompleted",
      "Date Completed",
      dateCompleted,
    );

    validationSections.forEach((section) => {
      section.rows.forEach((row, rowIndex) => {
        addRequiredError(
          nextErrors,
          `validationSections.${section.key}.${rowIndex}.control`,
          `${section.title} ${row.organism} Control`,
          row.control,
        );
        addRequiredError(
          nextErrors,
          `validationSections.${section.key}.${rowIndex}.avgCfuForTestSample`,
          `${section.title} ${row.organism} Avg CFU for Test Sample`,
          row.avgCfuForTestSample,
        );
      });
    });

    // addRequiredError(nextErrors, "testedBy", "Tested By", testedBy);
    // addRequiredError(nextErrors, "testedDate", "Tested Date", testedDate);

    // if (requiresReviewedSignature(targetStatus)) {
    //   addRequiredError(nextErrors, "reviewedBy", "Reviewed By", reviewedBy);
    //   addRequiredError(nextErrors, "reviewedDate", "Reviewed Date", reviewedDate);
    // }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function clearFieldError(field: string) {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function fieldErrorClass(field: string) {
    return errors[field] ? "border-red-500 ring-1 ring-red-500 bg-red-50" : "";
  }

  function signatureFieldErrorClass(field: string) {
    return errors[field]
      ? "border-b-red-500 ring-1 ring-red-500 bg-red-50"
      : "";
  }

  function fieldHasChanged(c: CorrectionItem) {
    return (
      normalizeForCompare(getFieldDisplayValue(c.fieldKey)) !==
      normalizeForCompare(c.oldValue)
    );
  }

  function canResolveCorrection(c: CorrectionItem) {
    if (role === "SYSTEMADMIN") return !isDirty;
    return !isDirty && fieldHasChanged(c);
  }

  function shouldBlockStatusChangeForUnresolvedCorrections() {
    const pending = openCorrections.filter((c) => fieldHasChanged(c));

    if (pending.length > 0) {
      alert(
        `⚠️ You updated ${pending.length} corrected field(s), but they are still not resolved.\n\n` +
          "Please resolve them from the Corrections tray before changing status.",
      );
      return true;
    }

    return false;
  }

  async function resolveOneCorrection(c: CorrectionItem) {
    if (!reportIdRef.current) return;

    return runBusy("RESOLVE", async () => {
      await resolveCorrection(reportIdRef.current!, c.id, "Fixed");
      const fresh = await getCorrections(reportIdRef.current!);
      setCorrections(fresh);
    });
  }

  function addPendingCorrection() {
    const option = correctionFieldOptions.find(
      (item) => item.key === selectedCorrectionField,
    );

    if (!option || !addMessage.trim()) return;
    const selectedSide =
      correctionRecipientSide === "AUTO" ? null : correctionRecipientSide;
    setPendingCorrections((prev) => [
      ...prev,
      {
        fieldKey: option.key,
        message: addMessage.trim(),
        oldValue: option.value,
        recipientSide: selectedSide,
      },
    ]);
    setSelectedCorrectionField("");
    setAddMessage("");
  }

  async function sendPendingCorrections() {
    if (!pendingStatus || !reportIdRef.current) return;

    const parentIdForStatus = workflowReportIdRef.current;

    if (!parentIdForStatus) {
      alert("⚠️ Parent APE form id is missing. Cannot change workflow status.");
      return;
    }

    const canChangeParentStatus =
      await canChangeParentStatusWithDashboardGuard(pendingStatus);

    if (!canChangeParentStatus) return;

    return runBusy("SEND_CORRECTIONS", async () => {
      try {
        await createCorrections(
          reportIdRef.current!,
          pendingCorrections,
          pendingStatus as ApeReportStatus,
          "Corrections requested",
          reportVersionRef.current,
          {
            previousStatus: status as ApeReportStatus,
            workflowReturnStatus: status as ApeReportStatus,
            recipientSide:
              correctionRecipientSide === "AUTO"
                ? undefined
                : correctionRecipientSide,
          },
        );

        const updated: any = await api(`/reports/${parentIdForStatus}/status`, {
          method: "PATCH",
          body: JSON.stringify({
            status: pendingStatus,
            reason: "Corrections requested from APE child report",
            expectedVersion: workflowVersionRef.current,
          }),
        });

        const nextStatus = updated?.status ?? pendingStatus;
        const nextVersion =
          typeof updated?.version === "number"
            ? updated.version
            : workflowVersionRef.current + 1;

        workflowVersionRef.current = nextVersion;
        setStatus(nextStatus);

        const fresh = await getCorrections(reportIdRef.current!);
        setCorrections(fresh);

        setSelectingCorrections(false);
        setPendingCorrections([]);
        setPendingStatus(null);
        setCorrectionRecipientSide("AUTO");

        onStatusChanged?.({
          ...report,
          ...updated,
          id: parentIdForStatus,
          parentReportId: parentIdForStatus,
          status: nextStatus,
          parentStatus: nextStatus,
          workflowStatus: nextStatus,
          parentVersion: nextVersion,
          version: nextVersion,
        });

        alert(
          `✅ Corrections sent and parent APE status changed to ${pendingStatus}`,
        );
      } catch (err: any) {
        console.error(err);
        alert(
          "❌ Error sending corrections: " + (err?.message || "Unknown error"),
        );
      }
    });
  }

  useEffect(() => {
    const nextDetail =
      report?.apeReport ?? report?.apeValidationReport ?? report ?? {};

    const nextWorkflowId =
      (report as any)?.parentReportId ||
      (report as any)?.workflowReportId ||
      null;

    workflowReportIdRef.current = nextWorkflowId;

    workflowVersionRef.current =
      typeof (report as any)?.parentVersion === "number"
        ? (report as any).parentVersion
        : typeof (report as any)?.workflowVersion === "number"
          ? (report as any).workflowVersion
          : workflowVersionRef.current;

    setReportId(report?.id || null);

    reportIdRef.current = report?.id || null;
    reportVersionRef.current =
      typeof report?.version === "number" ? report.version : 0;

    setStatus(
      (report as any)?.parentStatus ||
        (report as any)?.workflowStatus ||
        report?.status ||
        nextDetail?.status ||
        INITIAL_APE_CHILD_STATUS,
    );

    setReportNumber(report?.reportNumber ? String(report.reportNumber) : "");
    setReportVersion(typeof report?.version === "number" ? report.version : 0);

    setClient(nextDetail?.client || "");
    setDateSent(formatDateForInput(nextDetail?.dateSent) || todayISO());
    setTypeOfTest(nextDetail?.typeOfTest || "APE");
    setSampleType(nextDetail?.sampleType || "");
    setFormulaNo(nextDetail?.formulaNo || "");
    setDescription(nextDetail?.description || "");
    setLotNo(nextDetail?.lotNo || "");
    setManufactureDate(formatDateForInput(nextDetail?.manufactureDate));

    setTestSopNo(nextDetail?.testSopNo || "");
    setDateTested(formatDateForInput(nextDetail?.dateTested));
    setDateCompleted(formatDateForInput(nextDetail?.dateCompleted));

    setValidationSections(
      normalizeSections(nextDetail?.validationSections, selectedApeOrganisms),
    );

    setComments(nextDetail?.comments || "");
    setTestedBy(nextDetail?.testedBy || "");
    setTestedDate(formatDateForInput(nextDetail?.testedDate));
    setReviewedBy(nextDetail?.reviewedBy || "");
    setReviewedDate(formatDateForInput(nextDetail?.reviewedDate));

    setSelectingCorrections(false);
    setPendingCorrections([]);
    setPendingStatus(null);
    setCorrectionRecipientSide("AUTO");
    setSelectedCorrectionField("");
    setAddMessage("");

    setIsDirty(false);
  }, [
    report?.id,
    report?.status,
    report?.reportNumber,
    report?.version,
    (report as any)?.parentVersion,
    selectedApeOrganismsKey,
  ]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const canEditForm = useMemo(() => {
    if (forcePageReadOnly || pageMode === "VIEW") return false;
    if (!role || !EDIT_ROLES.has(role)) return false;
    if (HIDE_SAVE_FOR.has(status)) return false;
    return true;
  }, [forcePageReadOnly, pageMode, role, status]);

  const canShowSaveButton = canEditForm && !HIDE_SAVE_FOR.has(status);

  const showSignatures = ALWAYS_SHOW_SIGNATURES;

  const isJJL = (client ?? "").trim().toUpperCase() === "JJL";

  function markDirty() {
    if (!isDirty) setIsDirty(true);
  }

  function canEditField(field: string) {
    return canEditForm && canRoleEditApeChildField(role as any, field);
  }

  function lock(field: string) {
    return !canEditField(field);
  }

  function validationFieldKey(
    sectionKey: string,
    rowIndex: number,
    field: "control" | "avgCfuForTestSample",
  ) {
    return `validationSections.${sectionKey}.${rowIndex}.${field}`;
  }

  function updateValidationCell(
    sectionIndex: number,
    rowIndex: number,
    field: "control" | "avgCfuForTestSample",
    value: string,
  ) {
    setValidationSections((prev) => {
      const copy = [...prev];
      const section = { ...copy[sectionIndex] };
      const rows = [...section.rows];

      rows[rowIndex] = {
        ...rows[rowIndex],
        [field]: value,
      };

      section.rows = rows;
      copy[sectionIndex] = section;

      return copy;
    });

    const sectionKey = validationSections[sectionIndex]?.key;
    if (sectionKey)
      clearFieldError(validationFieldKey(sectionKey, rowIndex, field));

    markDirty();
  }

  function makePayload() {
    return {
      client,
      dateSent,
      typeOfTest,
      sampleType,
      formulaNo,
      description,
      lotNo,
      manufactureDate: manufactureDate?.trim() ? manufactureDate : null,
      testSopNo,
      testReference,
      dateTested,
      dateCompleted,
      validationSections,
      testedBy,
      testedDate,
      reviewedBy,
      reviewedDate,
    };
  }

  async function runBusy<T>(
    action: Exclude<BusyAction, null>,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(action);

    try {
      return await fn();
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function handleSave(): Promise<boolean> {
    if (!canEditForm) return false;

    // ✅ Show missing required fields in red even during normal Save/Update.
    // Do NOT block save here; only status change blocks.
    validateForStatusChange(status);

    const result = await runBusy("SAVE", async () => {
      try {
        const payload = makePayload();

        const requestPayload = reportId
          ? pickApeChildEditablePayload(role as any, payload)
          : payload;

        let saved: any;

        if (reportId) {
          saved = await api(`/reports/${reportId}`, {
            method: "PATCH",
            body: JSON.stringify({
              ...requestPayload,
              reason: "Saving APE Validation Report",
              expectedVersion: reportVersion,
            }),
          });
        } else {
          saved = await api(`/reports`, {
            method: "POST",
            body: JSON.stringify({
              ...payload,

              // ✅ required for APE child report create
              parentReportId: (report as any)?.parentReportId ?? null,
              clientCode: String(
                (report as any)?.clientCode ||
                  String((report as any)?.formNumber || "").split("-")[0] ||
                  "",
              ).trim(),
              reportType: REPORT_TYPE,
              status: INITIAL_APE_CHILD_STATUS,
            }),
          });
        }

        const nextReportId = saved?.id ?? reportId;
        const nextVersion =
          typeof saved?.version === "number"
            ? saved.version
            : reportVersion + 1;

        reportIdRef.current = nextReportId;
        reportVersionRef.current = nextVersion;

        setReportId(nextReportId);
        setStatus(saved?.status ?? INITIAL_APE_CHILD_STATUS);

        if (saved?.reportNumber != null) {
          setReportNumber(String(saved.reportNumber));
        }

        setReportVersion(nextVersion);
        setIsDirty(false);

        onSaved?.({
          ...report,
          ...payload,
          ...saved,
          id: nextReportId,
          reportType: REPORT_TYPE,
          parentReportId:
            saved?.parentReportId ?? (report as any)?.parentReportId ?? null,
          clientCode:
            saved?.clientCode ??
            (report as any)?.clientCode ??
            String((report as any)?.formNumber || "").split("-")[0] ??
            "",
          version: nextVersion,
        });

        alert("✅ APE Validation Report saved.");
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
          "❌ Error saving APE Validation Report: " +
            (err?.message || "Unknown error"),
        );
        return false;
      }
    });

    return result ?? false;
  }

  function handleClose() {
    if (isDirty) {
      const ok = window.confirm("⚠️ You have unsaved changes. Leave anyway?");
      if (!ok) return;
    }

    if (embedded) {
      onClose?.();
      return;
    }

    if (onClose) {
      onClose();
      return;
    }

    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    if (role === "MICRO") navigate("/microDashboard", { replace: true });
    else if (role === "MC") navigate("/mcDashboard", { replace: true });
    else if (role === "ADMIN") navigate("/adminDashboard", { replace: true });
    else if (role === "SYSTEMADMIN")
      navigate("/systemAdminDashboard", { replace: true });
    else navigate("/", { replace: true });
  }

  const inputClass = (field: string) =>
    `w-full input-editable py-[2px] text-[12px] leading-snug border border-black/70 bg-transparent px-1 outline-none focus:ring-1 focus:ring-blue-400 disabled:cursor-not-allowed disabled:bg-transparent ${fieldErrorClass(field)}`;

  const tableInputClass = (field: string) =>
    `w-full input-editable border border-black/70 bg-transparent px-1 py-[2px] text-[12px] outline-none focus:ring-1 focus:ring-blue-400 disabled:cursor-not-allowed disabled:bg-transparent ${fieldErrorClass(field)}`;

  const signatureInputClass = (field: string) =>
    `flex-1 border-0 border-b border-black/70 text-[12px] outline-none focus:border-blue-500 focus:ring-0 bg-transparent disabled:cursor-not-allowed disabled:bg-transparent ${signatureFieldErrorClass(field)}`;

  const canUseStatusButtons = pageMode === "UPDATE" && !forcePageReadOnly;

  function getNextStatuses() {
    return APE_STATUS_TRANSITIONS?.[status as ApeReportStatus]?.next ?? [];
  }

  async function canChangeParentStatusWithDashboardGuard(
    targetStatus: ReportStatus,
  ) {
    if (!beforeParentStatusChange) return true;

    return await beforeParentStatusChange(targetStatus, {
      ...report,
      ...makePayload(),
      id: reportIdRef.current,
      reportType: REPORT_TYPE,
      parentReportId: workflowReportIdRef.current,
      status,
      version: reportVersionRef.current,
    });
  }

  async function handleStatusChange(newStatus: ReportStatus) {
    const parentIdForStatus = workflowReportIdRef.current;

    if (!parentIdForStatus) {
      alert("⚠️ Parent APE form id is missing. Cannot change workflow status.");
      return;
    }

    const okFields = validateForStatusChange(newStatus);
    if (!okFields) {
      alert(
        "⚠️ Please fill the highlighted/missing fields before changing status.",
      );
      return;
    }

    if (shouldBlockStatusChangeForUnresolvedCorrections()) {
      return;
    }

    if (!reportId || isDirty) {
      const saved = await handleSave();
      if (!saved) return;
    }

    const canChangeParentStatus =
      await canChangeParentStatusWithDashboardGuard(newStatus);

    if (!canChangeParentStatus) return;

    return runBusy("STATUS", async () => {
      try {
        const updated: any = await api(`/reports/${parentIdForStatus}/status`, {
          method: "PATCH",
          body: JSON.stringify({
            status: newStatus,
            reason: "Changing APE parent workflow status from child report",
            expectedVersion: workflowVersionRef.current,
          }),
        });

        const nextStatus = updated?.status ?? newStatus;

        const nextVersion =
          typeof updated?.version === "number"
            ? updated.version
            : workflowVersionRef.current + 1;

        workflowVersionRef.current = nextVersion;

        setStatus(nextStatus);
        setErrors({});

        const mergedParentUpdate = {
          ...report,
          ...updated,

          // ✅ important: this id is parent APE form id
          id: parentIdForStatus,
          parentReportId: parentIdForStatus,

          status: nextStatus,
          parentStatus: nextStatus,
          workflowStatus: nextStatus,
          parentVersion: nextVersion,
          version: nextVersion,
        };

        onStatusChanged?.(mergedParentUpdate);

        alert(`✅ Parent APE status changed to ${newStatus}`);
      } catch (err: any) {
        console.error(err);
        alert(
          "❌ Error changing parent APE status: " +
            (err?.message || "Unknown error"),
        );
      }
    });
  }

  function requestStatusChange(targetStatus: ReportStatus) {
    if (!workflowReportIdRef.current) {
      alert("⚠️ Parent APE form id is missing. Cannot change workflow status.");
      return;
    }

    if (isNeedsCorrectionStatus(targetStatus)) {
      if (!reportIdRef.current) {
        alert("⚠️ Please save the report first before sending corrections.");
        return;
      }

      if (isDirty) {
        alert("⚠️ Please update/save the report before sending corrections.");
        return;
      }

      setSelectingCorrections(true);
      setPendingCorrections([]);
      setCorrectionRecipientSide("AUTO");
      setSelectedCorrectionField("");
      setAddMessage("");
      setPendingStatus(targetStatus);
      return;
    }

    handleStatusChange(targetStatus);
  }

  return (
    <>
      <div className="sheet mx-auto max-w-[800px] bg-white text-black border border-black shadow print:shadow-none p-4">
        <PrintStyles />
        <DashStyles />

        {!hideTopActions && (!embedded || canShowSaveButton) && (
          <div className="no-print mb-4 flex justify-end gap-2">
            {!embedded && (
              <button
                type="button"
                className="px-3 py-1 rounded-md border bg-gray-600 text-white"
                onClick={handleClose}
                disabled={busy !== null}
              >
                {busy ? "Working..." : "Close"}
              </button>
            )}

            {/* <button
              type="button"
              className="px-3 py-1 rounded-md border bg-slate-700 text-white"
              onClick={() => window.print()}
              disabled={busy !== null}
            >
              Print
            </button> */}

            {canShowSaveButton && (
              <button
                className="px-3 py-1 rounded-md border bg-blue-600 text-white disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                onClick={handleSave}
                disabled={busy !== null}
              >
                {busy === "SAVE" && <Spinner />}
                {reportId ? "Update Report" : "Save Report"}
              </button>
            )}
          </div>
        )}

        {/* Letterhead - same as ApeReportForm */}
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
          </div>

          <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="min-w-0 text-left text-[11px] font-bold">
              {(report as any)?.parentFormNumber ||
              (report as any)?.formNumber ? (
                <span className="whitespace-nowrap">
                  FORM NO:{" "}
                  {String(
                    (report as any)?.parentFormNumber ||
                      (report as any)?.formNumber,
                  )}
                </span>
              ) : null}
            </div>

            <div className="text-center text-[18px] font-bold underline">
              APE VALIDATION REPORT
            </div>

            <div className="min-w-0 text-right text-[11px] font-bold">
              {(report as any)?.parentReportNumber || reportNumber ? (
                <span className="whitespace-nowrap">
                  REPORT NO:{" "}
                  {String((report as any)?.parentReportNumber || reportNumber)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Top meta block - same layout as ApeReportForm */}
        <div className="w-full border border-black text-[15px]">
          {/* CLIENT / DATE SENT */}
          <div className="grid grid-cols-[67%_33%] border-b border-black text-[12px] leading-snug">
            <div className="px-2 border-r border-black flex items-center gap-1 relative">
              <div className="whitespace-nowrap font-medium">CLIENT:</div>

              {lock("client") ? (
                <div className="flex-1 min-h-[14px]">{client}</div>
              ) : (
                <input
                  className={inputClass("client")}
                  value={client.toUpperCase()}
                  onChange={(e) => {
                    setClient(e.target.value.toUpperCase());
                    clearFieldError("client");
                    markDirty();
                  }}
                />
              )}
            </div>

            <div className="px-2 flex items-center gap-1 relative">
              <div className="whitespace-nowrap font-medium">DATE SENT:</div>

              {lock("dateSent") ? (
                <div className="flex-1 min-h-[14px]">
                  {formatDateForInput(dateSent)}
                </div>
              ) : (
                <input
                  className={inputClass("dateSent")}
                  type="date"
                  min={role !== "SYSTEMADMIN" ? todayISO() : undefined}
                  value={formatDateForInput(dateSent)}
                  onChange={(e) => {
                    setDateSent(e.target.value);
                    clearFieldError("dateSent");
                    markDirty();
                  }}
                />
              )}
            </div>
          </div>

          {/* TYPE OF TEST / SAMPLE TYPE / FORMULA # */}
          <div className="grid grid-cols-[33%_33%_34%] border-b border-black text-[12px] leading-snug">
            <div className="px-2 border-r border-black flex items-center gap-1 relative">
              <div className="font-medium whitespace-nowrap">TYPE OF TEST:</div>

              {lock("typeOfTest") ? (
                <div className="flex-1 min-h-[14px]">{typeOfTest}</div>
              ) : (
                <div className="flex-1 min-w-0">
                  <input
                    list="ape-validation-typeOfTest-options"
                    className={inputClass("typeOfTest")}
                    value={typeOfTest}
                    onChange={(e) => {
                      setTypeOfTest(e.target.value);
                      clearFieldError("typeOfTest");
                      markDirty();
                    }}
                    placeholder={isJJL ? "Select or type..." : ""}
                  />

                  <datalist id="ape-validation-typeOfTest-options">
                    {(isJJL ? JJL_TYPE_OF_TEST_OPTIONS : []).map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                </div>
              )}
            </div>

            <div className="px-2 border-r border-black flex items-center gap-1 relative">
              <div className="font-medium whitespace-nowrap">SAMPLE TYPE:</div>

              {lock("sampleType") ? (
                <div className="flex-1 min-h-[14px]">{sampleType}</div>
              ) : (
                <div className="flex-1 min-w-0">
                  <input
                    list="ape-validation-sampleType-options"
                    className={inputClass("sampleType")}
                    value={sampleType}
                    onChange={(e) => {
                      setSampleType(e.target.value);
                      clearFieldError("sampleType");
                      markDirty();
                    }}
                    placeholder={isJJL ? "Select or type..." : ""}
                  />

                  <datalist id="ape-validation-sampleType-options">
                    {(isJJL ? JJL_SAMPLE_TYPE_OPTIONS : []).map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                </div>
              )}
            </div>

            <div className="px-2 flex items-center gap-1 relative">
              <div className="font-medium whitespace-nowrap">FORMULA #:</div>

              {lock("formulaNo") ? (
                <div className="flex-1 min-h-[14px]">{formulaNo}</div>
              ) : (
                <input
                  className={inputClass("formulaNo")}
                  value={formulaNo}
                  onChange={(e) => {
                    setFormulaNo(e.target.value);
                    clearFieldError("formulaNo");
                    markDirty();
                  }}
                />
              )}
            </div>
          </div>

          {/* DESCRIPTION */}
          <div className="border-b border-black flex items-center gap-2 px-2 text-[12px] leading-snug relative">
            <div className="w-28 font-medium">DESCRIPTION:</div>

            {lock("description") ? (
              <div className="flex-1 min-h-[14px]">{description}</div>
            ) : (
              <input
                className={inputClass("description")}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  clearFieldError("description");
                  markDirty();
                }}
              />
            )}
          </div>

          {/* LOT # / MANUFACTURE DATE */}
          <div className="grid grid-cols-[55%_45%] border-b border-black text-[12px] leading-snug">
            <div className="px-2 border-r border-black flex items-center gap-1 relative">
              <div className="font-medium whitespace-nowrap">LOT #:</div>

              {lock("lotNo") ? (
                <div className="flex-1 min-h-[14px]">{lotNo}</div>
              ) : (
                <input
                  className={inputClass("lotNo")}
                  value={lotNo}
                  onChange={(e) => {
                    setLotNo(e.target.value);
                    clearFieldError("lotNo");
                    markDirty();
                  }}
                />
              )}
            </div>

            <div className="px-2 flex items-center gap-1 relative">
              <div className="font-medium whitespace-nowrap">
                MANUFACTURE DATE:
              </div>

              {lock("manufactureDate") ? (
                <div className="flex-1 min-h-[14px]">
                  {manufactureDate ? formatDateForInput(manufactureDate) : "NA"}
                </div>
              ) : (
                <input
                  className={inputClass("manufactureDate")}
                  type="date"
                  value={formatDateForInput(manufactureDate)}
                  onChange={(e) => {
                    setManufactureDate(e.target.value);
                    clearFieldError("manufactureDate");
                    markDirty();
                  }}
                />
              )}
            </div>
          </div>

          {/* TEST SOP # / DATE TESTED */}
          <div className="grid grid-cols-[55%_45%] border-b border-black text-[12px] leading-snug">
            <div className="px-2 border-r border-black flex items-center gap-1 relative">
              <div className="font-medium whitespace-nowrap">TEST SOP #:</div>

              {lock("testSopNo") ? (
                <div className="flex-1 min-h-[14px]">{testSopNo}</div>
              ) : (
                <input
                  className={inputClass("testSopNo")}
                  value={testSopNo}
                  onChange={(e) => {
                    setTestSopNo(e.target.value);
                    clearFieldError("testSopNo");
                    markDirty();
                  }}
                />
              )}
            </div>

            <div className="px-2 flex items-center gap-1 relative">
              <div className="font-medium whitespace-nowrap">DATE TESTED:</div>

              {lock("dateTested") ? (
                <div className="flex-1 min-h-[14px]">
                  {formatDateForInput(dateTested)}
                </div>
              ) : (
                <input
                  className={inputClass("dateTested")}
                  type="date"
                  min={todayISO()}
                  value={formatDateForInput(dateTested)}
                  onChange={(e) => {
                    setDateTested(e.target.value);
                    clearFieldError("dateTested");
                    markDirty();
                  }}
                />
              )}
            </div>
          </div>

          {/* DATE COMPLETED */}
          {/* TEST REFERENCE / DATE COMPLETED */}
          <div className="grid grid-cols-[55%_45%] text-[12px] leading-snug">
            <div className="px-2 border-r border-black flex items-center gap-1 relative">
              <div className="font-medium whitespace-nowrap">
                TEST REFERENCE:
              </div>

              {lock("testReference") ? (
                <div className="flex-1 min-h-[14px]">{testReference}</div>
              ) : (
                <input
                  className={inputClass("testReference")}
                  value={testReference}
                  onChange={(e) => {
                    setTestReference(e.target.value);
                    clearFieldError("testReference");
                    markDirty();
                  }}
                />
              )}
            </div>

            <div className="px-2 flex items-center gap-1 relative">
              <div className="font-medium whitespace-nowrap">
                DATE COMPLETED:
              </div>

              {lock("dateCompleted") ? (
                <div className="min-h-[14px] flex-1">
                  {formatDateForInput(dateCompleted)}
                </div>
              ) : (
                <input
                  className={inputClass("dateCompleted")}
                  type="date"
                  min={todayISO()}
                  value={formatDateForInput(dateCompleted)}
                  onChange={(e) => {
                    setDateCompleted(e.target.value);
                    clearFieldError("dateCompleted");
                    markDirty();
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* APE Validation Data Table */}
        <div className="mt-3 border border-black text-[12px]">
          <div className="grid grid-cols-[54%_20%_26%] min-h-[38px] border-b border-black text-center font-bold">
            <div className="border-r border-black p-1" />
            <div className="flex items-end justify-center border-r border-black p-1">
              CONTROL
            </div>
            <div className="flex items-center justify-center p-1">
              AVG CFU FOR TEST
              <br />
              SAMPLE
            </div>
          </div>

          {validationSections.map((section, sectionIndex) => (
            <div key={section.key}>
              <div className="grid grid-cols-[54%_20%_26%] border-b border-black min-h-[26px]">
                <div className="border-r border-black p-1 font-bold">
                  {section.title}
                </div>
                <div className="border-r border-black" />
                <div />
              </div>

              {section.rows.map((row, rowIndex) => {
                const isLastRow =
                  sectionIndex === validationSections.length - 1 &&
                  rowIndex === section.rows.length - 1;

                return (
                  <div
                    key={`${section.key}-${row.organism}`}
                    className={`grid grid-cols-[54%_20%_26%] min-h-[22px] ${
                      isLastRow ? "" : "border-b border-black"
                    }`}
                  >
                    <div className="border-r border-black px-2 py-[2px]">
                      {row.organism}
                    </div>

                    <div className="border-r border-black px-1 py-[2px]">
                      <input
                        className={tableInputClass(
                          validationFieldKey(section.key, rowIndex, "control"),
                        )}
                        value={row.control}
                        onChange={(e) =>
                          updateValidationCell(
                            sectionIndex,
                            rowIndex,
                            "control",
                            e.target.value,
                          )
                        }
                        disabled={!canEditField("validationSections")}
                      />
                    </div>

                    <div className="px-1 py-[2px]">
                      <input
                        className={tableInputClass(
                          validationFieldKey(
                            section.key,
                            rowIndex,
                            "avgCfuForTestSample",
                          ),
                        )}
                        value={row.avgCfuForTestSample}
                        onChange={(e) =>
                          updateValidationCell(
                            sectionIndex,
                            rowIndex,
                            "avgCfuForTestSample",
                            e.target.value,
                          )
                        }
                        disabled={!canEditField("validationSections")}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Signatures */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
          {showSignatures && (
            <>
              <div className="p-2 relative">
                <div className="font-medium mb-2 flex items-center gap-2">
                  TESTED BY:
                  <input
                    className={signatureInputClass("testedBy")}
                    value={testedBy.toUpperCase()}
                    onChange={(e) => {
                      setTestedBy(e.target.value);
                      clearFieldError("testedBy");
                      markDirty();
                    }}
                    readOnly={lock("testedBy")}
                    placeholder="Name"
                  />
                </div>

                <div className="font-medium mt-2 flex items-center gap-2 relative">
                  DATE:
                  <input
                    className={signatureInputClass("testedDate")}
                    type="date"
                    min={todayISO()}
                    value={formatDateForInput(testedDate)}
                    onChange={(e) => {
                      setTestedDate(e.target.value);
                      clearFieldError("testedDate");
                      markDirty();
                    }}
                    readOnly={lock("testedDate")}
                  />
                </div>
              </div>

              <div className="p-2 relative">
                <div className="font-medium mb-2 flex items-center gap-2">
                  REVIEWED BY:
                  <input
                    className={signatureInputClass("reviewedBy")}
                    value={reviewedBy.toUpperCase()}
                    onChange={(e) => {
                      setReviewedBy(e.target.value);
                      clearFieldError("reviewedBy");
                      markDirty();
                    }}
                    readOnly={lock("reviewedBy")}
                    placeholder="Name"
                  />
                </div>

                <div className="font-medium mt-2 flex items-center gap-2 relative">
                  DATE:
                  <input
                    className={signatureInputClass("reviewedDate")}
                    type="date"
                    min={todayISO()}
                    value={formatDateForInput(reviewedDate)}
                    onChange={(e) => {
                      setReviewedDate(e.target.value);
                      clearFieldError("reviewedDate");
                      markDirty();
                    }}
                    readOnly={lock("reviewedDate")}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {!hideBottomActions && (
        <div className="no-print mt-4 flex items-center justify-between">
          {/* Left: status action buttons */}
          <div className="flex flex-wrap gap-2">
            {canUseStatusButtons &&
              getNextStatuses().map((targetStatus) => {
                const transition =
                  APE_STATUS_TRANSITIONS[status as ApeReportStatus];

                if (!transition?.canSet?.includes(role as any)) return null;
                if (!statusButtons[targetStatus]) return null;

                const { label, color } = statusButtons[targetStatus];

                return (
                  <div key={targetStatus} className="relative group">
                    <button
                      type="button"
                      className={`px-4 py-2 rounded-md border text-white ${color} disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2`}
                      onClick={() =>
                        requestStatusChange(targetStatus as ApeReportStatus)
                      }
                      disabled={busy !== null}
                    >
                      {busy === "STATUS" && <Spinner />}
                      {label}
                    </button>

                    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
                      {label} → {formatStatus(targetStatus)}
                    </div>
                  </div>
                );
              })}

            <div className="flex items-center text-sm text-slate-500">
              Status: <b className="ml-1">{formatStatus(status)}</b>
            </div>
          </div>

          {/* Right: close / print / save */}
        </div>
      )}

      {selectingCorrections && (
        <div className="fixed bottom-4 left-1/2 z-50 w-[560px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border bg-white/95 p-4 shadow-xl">
          <div className="text-sm font-semibold">Corrections picker</div>
          <div className="text-xs text-slate-600">
            Select a field, enter correction reason, then send corrections.
          </div>

          <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
            <select
              className="rounded-lg border px-2 py-1 text-xs"
              value={selectedCorrectionField}
              onChange={(e) => setSelectedCorrectionField(e.target.value)}
            >
              <option value="">Select field...</option>
              {correctionFieldOptions.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
            </select>

            <input
              className="rounded-lg border px-2 py-1 text-xs"
              value={addMessage}
              onChange={(e) => setAddMessage(e.target.value)}
              placeholder="Correction note"
            />

            <button
              type="button"
              className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
              disabled={
                !selectedCorrectionField || !addMessage.trim() || busy !== null
              }
              onClick={() =>
                runBusy("ADD_CORRECTION", async () => addPendingCorrection())
              }
            >
              Add
            </button>
          </div>

          {["QA", "ADMIN", "SYSTEMADMIN"].includes(role ?? "") && (
            <div className="mt-3 rounded-lg border bg-slate-50 p-3">
              <div className="mb-2 text-xs font-semibold text-slate-700">
                Send this change/correction to
              </div>

              <div className="grid grid-cols-4 gap-2 text-xs">
                {[
                  ["AUTO", "Auto"],
                  ["CLIENT", "Client"],
                  ["LAB", "Lab"],
                  ["BOTH", "Both"],
                ].map(([value, label]) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-center justify-center rounded-lg border px-2 py-1.5 ${
                      correctionRecipientSide === value
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "bg-white text-slate-700"
                    }`}
                  >
                    <input
                      type="radio"
                      className="mr-1"
                      checked={correctionRecipientSide === value}
                      onChange={() =>
                        setCorrectionRecipientSide(
                          value as CorrectionRecipientSide,
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div className="mt-2 text-[11px] text-slate-500">
                Auto uses field type. For mixed fields, choose Client, Lab, or
                Both.
              </div>
            </div>
          )}

          <ul className="mt-3 max-h-32 overflow-auto text-xs">
            {pendingCorrections.map((c, i) => {
              const option = correctionFieldOptions.find(
                (f) => f.key === c.fieldKey,
              );
              return (
                <li
                  key={`${c.fieldKey}-${i}`}
                  className="flex items-center justify-between gap-2 border-b py-1"
                >
                  <span className="truncate">
                    <b>{option?.label ?? c.fieldKey}</b>: {c.message}
                    {c.recipientSide && (
                      <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        To: {c.recipientSide}
                      </span>
                    )}
                    {!c.recipientSide && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        Auto
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
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
              );
            })}
            {pendingCorrections.length === 0 && (
              <li className="text-slate-400">No correction notes added yet.</li>
            )}
          </ul>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm"
              onClick={() => {
                setSelectingCorrections(false);
                setPendingCorrections([]);
                setPendingStatus(null);
                setCorrectionRecipientSide("AUTO");
                setSelectedCorrectionField("");
                setAddMessage("");
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              disabled={
                !pendingCorrections.length || !pendingStatus || busy !== null
              }
              onClick={sendPendingCorrections}
            >
              {busy === "SEND_CORRECTIONS" && <Spinner />}
              Send corrections
            </button>
          </div>
        </div>
      )}

      <div className="no-print fixed bottom-20 right-6 z-40">
        <button
          type="button"
          onClick={() => setShowCorrTray((s) => !s)}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xl hover:bg-slate-50"
        >
          <span>📝 Corrections</span>
          {openCorrections.length > 0 && (
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">
              {openCorrections.length}
            </span>
          )}
        </button>
      </div>

      {showCorrTray && (
        <div className="no-print fixed bottom-20 right-6 z-40 w-[430px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5">
          <div className="border-b bg-slate-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Correction Review
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Resolve only after the field value has been updated and saved.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
                onClick={() => setShowCorrTray(false)}
              >
                ✕
              </button>
            </div>
          </div>

          <div className="max-h-[430px] overflow-auto bg-slate-50/60 p-3">
            {openCorrections.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
                No open corrections
              </div>
            ) : (
              <div className="space-y-3">
                {openCorrections.map((c, index) => {
                  const option = correctionFieldOptions.find(
                    (f) => f.key === c.fieldKey,
                  );
                  const canResolve = canResolveCorrection(c);

                  return (
                    <div
                      key={c.id}
                      className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">
                            {index + 1}. {option?.label ?? c.fieldKey}
                          </div>
                          <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
                            <span className="font-semibold">Reason:</span>{" "}
                            {c.message}
                          </div>
                          {c.oldValue != null &&
                            String(c.oldValue).trim() !== "" && (
                              <div className="mt-2 rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-700">
                                <span className="font-semibold">
                                  Old Value:
                                </span>{" "}
                                {typeof c.oldValue === "string"
                                  ? c.oldValue
                                  : JSON.stringify(c.oldValue)}
                              </div>
                            )}
                        </div>
                        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                          OPEN
                        </span>
                      </div>

                      <button
                        type="button"
                        className={`mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                          canResolve
                            ? "bg-emerald-600 text-white hover:bg-emerald-700"
                            : "cursor-not-allowed bg-slate-100 text-slate-400"
                        }`}
                        disabled={!canResolve || busy !== null}
                        onClick={() => resolveOneCorrection(c)}
                        title={
                          isDirty
                            ? "Save the report before resolving"
                            : !fieldHasChanged(c) && role !== "SYSTEMADMIN"
                              ? "Edit the field first before resolving"
                              : "Mark resolved"
                        }
                      >
                        {busy === "RESOLVE" ? <SpinnerDark /> : "✓"}
                        Mark Resolved
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
