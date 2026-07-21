import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import {
  createCorrections,
  getCorrections,
  resolveCorrection,
} from "../../utils/sterilityReportValidation";
import {
  JJL_SAMPLE_TYPE_OPTIONS,
  JJL_TYPE_OF_TEST_OPTIONS,
  todayISO,
} from "../../utils/microMixReportFormWorkflow";
import {
  STERILITY_STATUS_TRANSITIONS,
  type CorrectionItem,
  type SterilityReportStatus,
} from "../../utils/SterilityReportFormWorkflow";
import {
  canRoleEditApeChildField,
  pickApeChildEditablePayload,
} from "../../utils/apeReportFormWorkflow";

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

type CorrectionLaunchKind = "REQUEST_CHANGE" | "RAISE_CORRECTION";

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
  correctionLaunch?: boolean;
  correctionKinds?: CorrectionLaunchKind[];
  isWorkspaceActive?: boolean;
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

function eSignActionTitle(status?: string | null) {
  const s = String(status || "");

  if (s.includes("APPROVED") || s.includes("FINAL_APPROVED")) {
    return "Electronic Approval";
  }

  if (s.includes("QA") || s.includes("REVIEW")) {
    return "Electronic Review Authorization";
  }

  if (s.includes("LOCKED")) {
    return "Electronic Lock Authorization";
  }

  if (s.includes("CORRECTION")) {
    return "Electronic Correction Authorization";
  }

  return "Electronic Signature Verification";
}

function eSignButtonText(status?: string | null) {
  const s = String(status || "");

  if (s.includes("APPROVED") || s.includes("FINAL_APPROVED")) {
    return "Verify & Approve";
  }

  if (s.includes("REVIEW")) {
    return "Verify & Continue";
  }

  if (s.includes("LOCKED")) {
    return "Verify & Lock";
  }

  return "Verify Signature";
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

function makeDefaultSections(
  organismNames: string[],
): ValidationSection[] {
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
    [data-correction-state="open"] {
      position: relative;
      outline: 2px dashed #dc2626;
      outline-offset: -2px;
      animation: correction-pulse 1.05s linear infinite;
    }
    [data-correction-state="resolved"] {
      position: relative;
      outline: 2px dashed #16a34a;
      outline-offset: -2px;
    }
    @keyframes correction-pulse {
      50% { outline-color: #fb7185; }
    }
    @media print {
      .dash::after,
      [data-correction-state] { outline: none !important; animation: none !important; }
    }
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

// function isNeedsCorrectionStatus(status: ReportStatus) {
//   return (
//     status === "FRONTDESK_NEEDS_CORRECTION" ||
//     status === "TESTING_NEEDS_CORRECTION" ||
//     status === "QA_NEEDS_CORRECTION" ||
//     status === "ADMIN_NEEDS_CORRECTION" ||
//     status === "CLIENT_NEEDS_CORRECTION" ||
//     status === "CHANGE_REQUESTED" ||
//     status === "CORRECTION_REQUESTED"
//   );
// }

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
  correctionLaunch = false,
  correctionKinds = [],
  isWorkspaceActive = true,
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

  const [showESign, setShowESign] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const [eSignPassword, setESignPassword] = useState("");
  const [showESignPassword, setShowESignPassword] = useState(false);
  const [eSignSubmitting, setESignSubmitting] = useState(false);
  const [eSignError, setESignError] = useState<string | null>(null);
  const [eSignConfirmed, setESignConfirmed] = useState(false);
  const [eSignPos, setESignPos] = useState({ x: 0, y: 0 });

  const eSignDragRef = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  function startESignDrag(e: ReactMouseEvent) {
    eSignDragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: eSignPos.x,
      origY: eSignPos.y,
    };

    window.onmousemove = (event) => {
      if (!eSignDragRef.current.dragging) return;

      setESignPos({
        x:
          eSignDragRef.current.origX +
          event.clientX -
          eSignDragRef.current.startX,
        y:
          eSignDragRef.current.origY +
          event.clientY -
          eSignDragRef.current.startY,
      });
    };

    window.onmouseup = () => {
      eSignDragRef.current.dragging = false;
      window.onmousemove = null;
      window.onmouseup = null;
    };
  }

  useEffect(() => {
    return () => {
      window.onmousemove = null;
      window.onmouseup = null;
    };
  }, []);
  const [pendingCorrections, setPendingCorrections] = useState<
    { fieldKey: string; message: string; oldValue?: string | null }[]
  >([]);
  const [addForField, setAddForField] = useState<string | null>(null);
  const [addMessage, setAddMessage] = useState("");
  const [showCorrTray, setShowCorrTray] = useState(false);
  const [correctionActionOpen, setCorrectionActionOpen] = useState(false);
  const [flash, setFlash] = useState<Record<string, boolean>>({});
  const [resolveTarget, setResolveTarget] = useState<CorrectionItem | null>(null);
  const [resolveFieldTarget, setResolveFieldTarget] = useState<string | null>(null);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveReason, setResolveReason] = useState("");
  const [status, setStatus] = useState<ReportStatus>(
    report?.id
      ? report?.status || detail?.status || INITIAL_APE_CHILD_STATUS
      : INITIAL_APE_CHILD_STATUS,
  );

  const canShowFloatingUi = !embedded || isWorkspaceActive;

  const correctionModeActive =
    (status === "UNDER_CORRECTION_UPDATE" ||
      status === "UNDER_CHANGE_UPDATE") &&
    openCorrections.length > 0;

  function getCentralizedCorrectionStatus(
    kinds: CorrectionLaunchKind[] = [],
  ): ReportStatus {
    if (kinds.includes("RAISE_CORRECTION")) return "CORRECTION_REQUESTED";
    if (kinds.includes("REQUEST_CHANGE")) return "CHANGE_REQUESTED";
    return "CORRECTION_REQUESTED";
  }

  function getWorkflowReturnStatus(current: ReportStatus): ReportStatus {
    if (current === "UNDER_CLIENT_REVIEW") return "UNDER_QA_REVIEW";
    return current;
  }

  useEffect(() => {
    if (!correctionLaunch) return;
    if (pageMode !== "UPDATE" || forcePageReadOnly) return;
    if (!isWorkspaceActive) return;

    setSelectingCorrections(true);
    setPendingCorrections([]);
    setPendingStatus(getCentralizedCorrectionStatus(correctionKinds));
  }, [
    correctionLaunch,
    correctionKinds.join("|"),
    pageMode,
    forcePageReadOnly,
    isWorkspaceActive,
  ]);

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
  >(
    normalizeSections(
      detail?.validationSections,
      selectedApeOrganisms,
    ),
  );

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

  function hasOpenCorrection(fieldKey: string) {
    return openCorrections.some(
      (item) =>
        item.fieldKey === fieldKey ||
        item.fieldKey.startsWith(`${fieldKey}.`) ||
        item.fieldKey.startsWith(`${fieldKey}:`),
    );
  }

  function isFieldRequestedForCorrection(fieldKey: string) {
    return hasOpenCorrection(fieldKey);
  }

  function correctionState(fieldKey: string) {
    if (hasOpenCorrection(fieldKey)) return "open";
    if (flash[fieldKey]) return "resolved";
    return undefined;
  }

  function flashResolved(fieldKey: string) {
    setFlash((prev) => ({ ...prev, [fieldKey]: true }));
    window.setTimeout(
      () => setFlash((prev) => ({ ...prev, [fieldKey]: false })),
      1600,
    );
  }

  function roleCanEditCorrectionField(fieldKey: string) {
    if (!role) return false;
    if (role === "SYSTEMADMIN") return true;
    const baseField = fieldKey.split(/[.:]/)[0];
    return canRoleEditApeChildField(role as any, baseField);
  }

  function handleCorrectionTargetClick(event: ReactPointerEvent<HTMLDivElement>) {
    if (!selectingCorrections) return;

    const target = event.target as HTMLElement;
    const fieldElement = target.closest<HTMLElement>("[data-correction-field]");
    const fieldKey = fieldElement?.dataset.correctionField;

    if (!fieldKey) return;

    event.preventDefault();
    event.stopPropagation();
    setAddForField(fieldKey);
    setAddMessage("");
  }

  function fieldHasChanged(c: CorrectionItem) {
    return (
      normalizeForCompare(getFieldDisplayValue(c.fieldKey)) !==
      normalizeForCompare(c.oldValue)
    );
  }

  function canResolveCorrection(c: CorrectionItem) {
    if (c.status !== "OPEN" || isDirty) return false;
    if (role === "SYSTEMADMIN") return true;
    return roleCanEditCorrectionField(c.fieldKey) && fieldHasChanged(c);
  }

  function canResolveAllForFieldKey(fieldKey: string) {
    const items = openCorrections.filter(
      (item) =>
        item.fieldKey === fieldKey ||
        item.fieldKey.startsWith(`${fieldKey}.`) ||
        item.fieldKey.startsWith(`${fieldKey}:`),
    );

    return items.length > 0 && items.every((item) => canResolveCorrection(item));
  }

  async function resolveField(fieldKey: string, reason = "Fixed") {
    if (!reportIdRef.current) return;

    return runBusy("RESOLVE", async () => {
      const items = openCorrections.filter(
        (item) =>
          item.fieldKey === fieldKey ||
          item.fieldKey.startsWith(`${fieldKey}.`) ||
          item.fieldKey.startsWith(`${fieldKey}:`),
      );

      await Promise.all(
        items.map((item) =>
          resolveCorrection(reportIdRef.current!, item.id, reason),
        ),
      );

      const fresh = await getCorrections(reportIdRef.current!);
      setCorrections(fresh);
      flashResolved(fieldKey);
    });
  }

  function ResolveOverlay({ field }: { field: string }) {
    if (!hasOpenCorrection(field) || !roleCanEditCorrectionField(field)) {
      return null;
    }

    const disabled = !canResolveAllForFieldKey(field);

    return (
      <button
        type="button"
        className={`no-print absolute -right-2 -top-2 z-20 grid h-5 w-5 place-items-center rounded-full text-white shadow ${
          disabled
            ? "cursor-not-allowed bg-emerald-300 opacity-60"
            : "bg-emerald-600 hover:bg-emerald-700"
        }`}
        disabled={disabled || busy !== null}
        title={
          role === "SYSTEMADMIN"
            ? "Resolve with reason"
            : isDirty
              ? "Save the report before resolving"
              : disabled
                ? "Edit this field before resolving"
                : "Mark resolved"
        }
        onClick={(event) => {
          event.stopPropagation();
          if (disabled) return;

          if (role === "SYSTEMADMIN") {
            setResolveTarget(null);
            setResolveFieldTarget(field);
            setResolveReason("");
            setShowResolveModal(true);
            return;
          }

          resolveField(field);
        }}
      >
        ✓
      </button>
    );
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

  async function resolveOneCorrection(
    c: CorrectionItem,
    reason = "Fixed",
  ) {
    if (!reportIdRef.current) return;

    return runBusy("RESOLVE", async () => {
      await resolveCorrection(reportIdRef.current!, c.id, reason);
      const fresh = await getCorrections(reportIdRef.current!);
      setCorrections(fresh);
      flashResolved(c.fieldKey);
    });
  }

  function addPendingCorrection(fieldKey: string) {
    const option = correctionFieldOptions.find((item) => item.key === fieldKey);
    if (!option || !addMessage.trim()) return;

    setPendingCorrections((prev) => [
      ...prev,
      {
        fieldKey: option.key,
        message: addMessage.trim(),
        oldValue: option.value,
      },
    ]);

    setAddForField(null);
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
        const returnStatus = getWorkflowReturnStatus(status);

        await createCorrections(
          reportIdRef.current!,
          pendingCorrections,
          pendingStatus as SterilityReportStatus,
          "Corrections requested",
          reportVersionRef.current,
          {
            kinds:
              correctionKinds.length > 0
                ? correctionKinds
                : pendingStatus === "CHANGE_REQUESTED"
                  ? ["REQUEST_CHANGE"]
                  : ["RAISE_CORRECTION"],
            previousStatus: returnStatus as SterilityReportStatus,
            workflowReturnStatus: returnStatus as SterilityReportStatus,
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
        setAddForField(null);
        setCorrectionActionOpen(false);

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

        alert(`✅ Corrections sent and parent APE status changed to ${pendingStatus}`);
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
      normalizeSections(
        nextDetail?.validationSections,
        selectedApeOrganisms,
      ),
    );

    setComments(nextDetail?.comments || "");
    setTestedBy(nextDetail?.testedBy || "");
    setTestedDate(formatDateForInput(nextDetail?.testedDate));
    setReviewedBy(nextDetail?.reviewedBy || "");
    setReviewedDate(formatDateForInput(nextDetail?.reviewedDate));

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

  function canEditField(
    field: string,
    correctionFieldKey = field,
  ) {
    const roleAllowed =
      canEditForm && canRoleEditApeChildField(role as any, field);

    if (!roleAllowed) return false;
    if (correctionModeActive) {
      return isFieldRequestedForCorrection(correctionFieldKey);
    }

    return true;
  }

  function lock(field: string, correctionFieldKey = field) {
    return !canEditField(field, correctionFieldKey);
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

        let requestPayload = reportId
          ? pickApeChildEditablePayload(role as any, payload)
          : payload;

        if (reportId && correctionModeActive) {
          const requestedBaseFields = new Set(
            openCorrections.map((item) => item.fieldKey.split(/[.:]/)[0]),
          );

          requestPayload = Object.fromEntries(
            Object.entries(requestPayload).filter(([key]) =>
              requestedBaseFields.has(key),
            ),
          );
        }

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

        const nextWorkflowStatus =
          (report as any)?.parentStatus ||
          (report as any)?.workflowStatus ||
          status ||
          INITIAL_APE_CHILD_STATUS;

        setStatus(nextWorkflowStatus);

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
          childStatus: saved?.status,
          status: nextWorkflowStatus,
          parentStatus: nextWorkflowStatus,
          workflowStatus: nextWorkflowStatus,
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

  const previewTestingSignature =
    showESign &&
    status === "UNDER_TESTING_REVIEW" &&
    pendingStatus === "UNDER_QA_REVIEW" &&
    (role === "MICRO" || role === "MC");

  const previewReviewSignature =
    showESign &&
    status === "UNDER_ADMIN_REVIEW" &&
    pendingStatus === "UNDER_CLIENT_REVIEW" &&
    (role === "ADMIN" || role === "SYSTEMADMIN");

  const displayTestedBy = previewTestingSignature
    ? user?.name || user?.email || ""
    : testedBy;

  const displayTestedDate = previewTestingSignature
    ? todayISO()
    : testedDate;

  const displayReviewedBy = previewReviewSignature
    ? user?.name || user?.email || ""
    : reviewedBy;

  const displayReviewedDate = previewReviewSignature
    ? todayISO()
    : reviewedDate;

  const inputClass = (field: string) =>
    `w-full input-editable py-[2px] text-[12px] leading-snug border border-black/70 bg-transparent px-1 outline-none focus:ring-1 focus:ring-blue-400 disabled:cursor-not-allowed disabled:bg-transparent ${fieldErrorClass(field)}`;

  const tableInputClass = (field: string) =>
    `w-full input-editable border border-black/70 bg-transparent px-1 py-[2px] text-[12px] outline-none focus:ring-1 focus:ring-blue-400 disabled:cursor-not-allowed disabled:bg-transparent ${fieldErrorClass(field)}`;

  const signatureInputClass = (field: string) =>
    `flex-1 border-0 border-b border-black/70 text-[12px] outline-none focus:border-blue-500 focus:ring-0 bg-transparent disabled:cursor-not-allowed disabled:bg-transparent ${signatureFieldErrorClass(field)}`;

  const canUseStatusButtons = pageMode === "UPDATE" && !forcePageReadOnly;

  function getNextStatuses() {
    return (
      STERILITY_STATUS_TRANSITIONS?.[status as SterilityReportStatus]?.next ??
      []
    );
  }

  async function canChangeParentStatusWithDashboardGuard(
    targetStatus: ReportStatus,
    currentChildOverride?: any,
  ) {
    if (!beforeParentStatusChange) return true;

    return await beforeParentStatusChange(
      targetStatus,
      currentChildOverride ?? {
        ...report,
        ...makePayload(),
        id: reportIdRef.current,
        reportType: REPORT_TYPE,
        parentReportId: workflowReportIdRef.current,
        status,
        version: reportVersionRef.current,
      },
    );
  }

  type ApeChildSignatureType = "TESTED" | "REVIEWED";

  function getApeChildSignatureType(
    targetStatus: ReportStatus,
  ): ApeChildSignatureType | null {
    if (
      status === "UNDER_TESTING_REVIEW" &&
      targetStatus === "UNDER_QA_REVIEW" &&
      (role === "MICRO" || role === "MC" || role === "SYSTEMADMIN")
    ) {
      return "TESTED";
    }

    if (
      status === "UNDER_ADMIN_REVIEW" &&
      targetStatus === "UNDER_CLIENT_REVIEW" &&
      (role === "ADMIN" || role === "SYSTEMADMIN")
    ) {
      return "REVIEWED";
    }

    return null;
  }

  function hasApeChildSignature(
    child: any,
    signatureType: ApeChildSignatureType,
    targetStatus: ReportStatus,
  ) {
    const signedChildStatus = String(
      child?.childStatus ?? child?.status ?? "",
    );

    if (signedChildStatus !== String(targetStatus)) return false;

    if (signatureType === "TESTED") {
      return !isBlank(child?.testedBy) && !isBlank(child?.testedDate);
    }

    return !isBlank(child?.reviewedBy) && !isBlank(child?.reviewedDate);
  }

  async function fetchSiblingApeChildReport() {
    const parentId = workflowReportIdRef.current;
    if (!parentId) return null;

    const siblingReportType =
      REPORT_TYPE === "APE_VALIDATION_REPORT"
        ? "APE_REPORT"
        : "APE_VALIDATION_REPORT";

    try {
      const sibling = await api<any>(
        `/reports/ape-child/by-parent?parentReportId=${encodeURIComponent(
          parentId,
        )}&reportType=${siblingReportType}&_=${Date.now()}`,
      );

      return sibling?.id ? sibling : null;
    } catch {
      return null;
    }
  }

  const uiNeedsESign = (targetStatus: ReportStatus) =>
    (role === "ADMIN" ||
      role === "SYSTEMADMIN" ||
      role === "FRONTDESK" ||
      role === "MICRO" ||
      role === "MC") &&
    (targetStatus === "UNDER_CLIENT_REVIEW" ||
      targetStatus === "UNDER_QA_REVIEW" ||
      targetStatus === "LOCKED");

  function getDefaultESignReason(
    fromStatus: ReportStatus,
    toStatus: ReportStatus,
  ) {
    return `Electronic signature authorization for status transition from ${formatStatus(
      fromStatus,
    )} to ${formatStatus(toStatus)}.`;
  }

  function closeESignModal() {
    setShowESign(false);
    setPendingStatus(null);
    setShowESignPassword(false);
    setESignPassword("");
    setChangeReason("");
    setESignError(null);
    setESignConfirmed(false);
    setESignPos({ x: 0, y: 0 });
  }

    async function handleStatusChange(
    newStatus: ReportStatus,
    opts?: { reason?: string; eSignPassword?: string },
  ): Promise<boolean> {
    const parentIdForStatus = workflowReportIdRef.current;

    if (!parentIdForStatus) {
      alert("⚠️ Parent APE form id is missing. Cannot change workflow status.");
      return false;
    }

    const okFields = validateForStatusChange(newStatus);
    if (!okFields) {
      alert(
        "⚠️ Please fill the highlighted/missing fields before changing status.",
      );
      return false;
    }

    if (shouldBlockStatusChangeForUnresolvedCorrections()) {
      return false;
    }

    if (!reportIdRef.current || isDirty) {
      const saved = await handleSave();
      if (!saved) return false;
    }

    const result = await runBusy("STATUS", async () => {
      try {
        const signatureType = opts?.eSignPassword
          ? getApeChildSignatureType(newStatus)
          : null;

        let signedCurrentChild: any = null;

        if (signatureType) {
          const signed: any = await api(`/reports/${reportIdRef.current}`, {
            method: "PATCH",
            body: JSON.stringify({
              signatureType,
              reason:
                opts?.reason ??
                "Electronic signature applied to APE Validation Report",
              eSignPassword: opts?.eSignPassword,
              expectedVersion: reportVersionRef.current,
            }),
          });

          const nextChildVersion =
            typeof signed?.version === "number"
              ? signed.version
              : reportVersionRef.current + 1;

          reportVersionRef.current = nextChildVersion;
          setReportVersion(nextChildVersion);

          const signerName =
            signed?.testedBy ||
            signed?.reviewedBy ||
            user?.name ||
            user?.email ||
            "";

          const signedDate =
            formatDateForInput(
              signed?.testedDate || signed?.reviewedDate,
            ) || todayISO();

          if (signatureType === "TESTED") {
            setTestedBy(signed?.testedBy || signerName);
            setTestedDate(
              formatDateForInput(signed?.testedDate) || signedDate,
            );
          } else {
            setReviewedBy(signed?.reviewedBy || signerName);
            setReviewedDate(
              formatDateForInput(signed?.reviewedDate) || signedDate,
            );
          }

          signedCurrentChild = {
            ...report,
            ...makePayload(),
            ...signed,
            id: reportIdRef.current,
            reportType: REPORT_TYPE,
            parentReportId: parentIdForStatus,
            parentStatus: status,
            workflowStatus: status,
            parentVersion: workflowVersionRef.current,
            status,
            childStatus: signed?.status,
            version: nextChildVersion,
            testedBy:
              signatureType === "TESTED"
                ? signed?.testedBy || signerName
                : signed?.testedBy ?? testedBy,
            testedDate:
              signatureType === "TESTED"
                ? formatDateForInput(signed?.testedDate) || signedDate
                : formatDateForInput(signed?.testedDate) || testedDate,
            reviewedBy:
              signatureType === "REVIEWED"
                ? signed?.reviewedBy || signerName
                : signed?.reviewedBy ?? reviewedBy,
            reviewedDate:
              signatureType === "REVIEWED"
                ? formatDateForInput(signed?.reviewedDate) || signedDate
                : formatDateForInput(signed?.reviewedDate) || reviewedDate,
          };

          onSaved?.(signedCurrentChild);

          const sibling = await fetchSiblingApeChildReport();
          const bothReportsSigned =
            hasApeChildSignature(
              signedCurrentChild,
              signatureType,
              newStatus,
            ) &&
            hasApeChildSignature(sibling, signatureType, newStatus);

          if (!bothReportsSigned) {
            const signatureLabel =
              signatureType === "TESTED" ? "testing" : "review";

            alert(
              `✅ APE Validation Report ${signatureLabel} signature saved.\n\n` +
                `Parent APE status remains ${formatStatus(status)}. ` +
                `APE Report must also be electronically signed before the status can change.`,
            );

            return true;
          }
        }

        const canChangeParentStatus =
          await canChangeParentStatusWithDashboardGuard(
            newStatus,
            signedCurrentChild ?? undefined,
          );

        if (!canChangeParentStatus) return false;

        const updated: any = await api(`/reports/${parentIdForStatus}/status`, {
          method: "PATCH",
          body: JSON.stringify({
            status: newStatus,
            reason:
              opts?.reason ??
              "Changing APE parent workflow status from child report",
            eSignPassword: opts?.eSignPassword ?? undefined,
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
          `✅ Both APE reports are signed. Parent APE status changed to ${formatStatus(
            newStatus,
          )}.`,
        );
        return true;
      } catch (err: any) {
        console.error(err);

        const message =
          err?.response?.data?.message ||
          err?.response?.message ||
          err?.message ||
          "Unknown error";

        if (opts?.eSignPassword) {
          throw new Error(
            Array.isArray(message) ? message.join(", ") : String(message),
          );
        }

        alert("❌ Error changing parent APE status: " + message);
        return false;
      }
    });

    return result ?? false;
  }

  async function requestStatusChange(targetStatus: ReportStatus) {
    if (!workflowReportIdRef.current) {
      alert("⚠️ Parent APE form id is missing. Cannot change workflow status.");
      return;
    }

    const isCorrectionAction =
      targetStatus === "CHANGE_REQUESTED" ||
      targetStatus === "CORRECTION_REQUESTED";

    if (isCorrectionAction) {
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
      setPendingStatus(targetStatus);
      setCorrectionActionOpen(false);
      return;
    }

    if (uiNeedsESign(targetStatus)) {
      if (!reportIdRef.current) {
        alert("⚠️ Please save the report before electronic signature.");
        return;
      }

      if (isDirty) {
        alert(
          "⚠️ You have unsaved changes. Please update/save the report before electronic signature.",
        );
        return;
      }

      const okFields = validateForStatusChange(targetStatus);
      if (!okFields) {
        alert("⚠️ Please fill all required fields before electronic signature.");
        return;
      }

      if (shouldBlockStatusChangeForUnresolvedCorrections()) {
        return;
      }

      setESignError(null);
      setESignPassword("");
      setChangeReason(getDefaultESignReason(status, targetStatus));
      setPendingStatus(targetStatus);
      setESignConfirmed(false);
      setShowESignPassword(false);
      setESignPos({ x: 0, y: 0 });
      setShowESign(true);
      return;
    }

    await handleStatusChange(targetStatus);
  }

  return (
    <>
      <div className="sheet mx-auto max-w-[800px] bg-white text-black border border-black shadow print:shadow-none p-4" onPointerDownCapture={handleCorrectionTargetClick}>
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

        {selectingCorrections && (
          <div className="no-print mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Correction selection is active. Click a field in the report to add a correction note.
          </div>
        )}

        {correctionModeActive && (
          <div className="no-print mb-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            Only fields with requested corrections can be edited. Save the report, then resolve each correction.
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
                  {String(
                    (report as any)?.parentReportNumber || reportNumber,
                  )}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Top meta block - same layout as ApeReportForm */}
        <div className="w-full border border-black text-[15px]">
          {/* CLIENT / DATE SENT */}
          <div className="grid grid-cols-[67%_33%] border-b border-black text-[12px] leading-snug">
            <div className="px-2 border-r border-black flex items-center gap-1 relative" data-correction-field="client" data-correction-state={correctionState("client")}>
              <div className="whitespace-nowrap font-medium">CLIENT:</div>
              <ResolveOverlay field="client" />

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

            <div className="px-2 flex items-center gap-1 relative" data-correction-field="dateSent" data-correction-state={correctionState("dateSent")}>
              <div className="whitespace-nowrap font-medium">DATE SENT:</div>
              <ResolveOverlay field="dateSent" />

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
            <div className="px-2 border-r border-black flex items-center gap-1 relative" data-correction-field="typeOfTest" data-correction-state={correctionState("typeOfTest")}>
              <div className="font-medium whitespace-nowrap">TYPE OF TEST:</div>
              <ResolveOverlay field="typeOfTest" />

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

            <div className="px-2 border-r border-black flex items-center gap-1 relative" data-correction-field="sampleType" data-correction-state={correctionState("sampleType")}>
              <div className="font-medium whitespace-nowrap">SAMPLE TYPE:</div>
              <ResolveOverlay field="sampleType" />

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

            <div className="px-2 flex items-center gap-1 relative" data-correction-field="formulaNo" data-correction-state={correctionState("formulaNo")}>
              <div className="font-medium whitespace-nowrap">FORMULA #:</div>
              <ResolveOverlay field="formulaNo" />

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
          <div className="border-b border-black flex items-center gap-2 px-2 text-[12px] leading-snug relative" data-correction-field="description" data-correction-state={correctionState("description")}>
            <div className="w-28 font-medium">DESCRIPTION:</div>
              <ResolveOverlay field="description" />

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
            <div className="px-2 border-r border-black flex items-center gap-1 relative" data-correction-field="lotNo" data-correction-state={correctionState("lotNo")}>
              <div className="font-medium whitespace-nowrap">LOT #:</div>
              <ResolveOverlay field="lotNo" />

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

            <div className="px-2 flex items-center gap-1 relative" data-correction-field="manufactureDate" data-correction-state={correctionState("manufactureDate")}>
              <div className="font-medium whitespace-nowrap">
                MANUFACTURE DATE:
              </div>
              <ResolveOverlay field="manufactureDate" />

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
            <div className="px-2 border-r border-black flex items-center gap-1 relative" data-correction-field="testSopNo" data-correction-state={correctionState("testSopNo")}>
              <div className="font-medium whitespace-nowrap">TEST SOP #:</div>
              <ResolveOverlay field="testSopNo" />

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

            <div className="px-2 flex items-center gap-1 relative" data-correction-field="dateTested" data-correction-state={correctionState("dateTested")}>
              <div className="font-medium whitespace-nowrap">DATE TESTED:</div>
              <ResolveOverlay field="dateTested" />

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
            <div className="px-2 border-r border-black flex items-center gap-1 relative" data-correction-field="testReference" data-correction-state={correctionState("testReference")}>
              <div className="font-medium whitespace-nowrap">
                TEST REFERENCE:
              </div>
              <ResolveOverlay field="testReference" />

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

            <div className="px-2 flex items-center gap-1 relative" data-correction-field="dateCompleted" data-correction-state={correctionState("dateCompleted")}>
              <div className="font-medium whitespace-nowrap">
                DATE COMPLETED:
              </div>
              <ResolveOverlay field="dateCompleted" />

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

                    <div
                      className="border-r border-black px-1 py-[2px] relative"
                      data-correction-field={validationFieldKey(
                        section.key,
                        rowIndex,
                        "control",
                      )}
                      data-correction-state={correctionState(
                        validationFieldKey(section.key, rowIndex, "control"),
                      )}
                    >
                      <ResolveOverlay
                        field={validationFieldKey(
                          section.key,
                          rowIndex,
                          "control",
                        )}
                      />
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
                        disabled={!canEditField("validationSections", validationFieldKey(section.key, rowIndex, "control"))}
                      />
                    </div>

                    <div
                      className="px-1 py-[2px] relative"
                      data-correction-field={validationFieldKey(
                        section.key,
                        rowIndex,
                        "avgCfuForTestSample",
                      )}
                      data-correction-state={correctionState(
                        validationFieldKey(
                          section.key,
                          rowIndex,
                          "avgCfuForTestSample",
                        ),
                      )}
                    >
                      <ResolveOverlay
                        field={validationFieldKey(
                          section.key,
                          rowIndex,
                          "avgCfuForTestSample",
                        )}
                      />
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
                        disabled={!canEditField("validationSections", validationFieldKey(section.key, rowIndex, "avgCfuForTestSample"))}
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
                <div className="font-medium mb-2 flex items-center gap-2 relative" data-correction-field="testedBy" data-correction-state={correctionState("testedBy")}>
                  TESTED BY:
                  <ResolveOverlay field="testedBy" />
                  <input
                    className={signatureInputClass("testedBy")}
                    value={displayTestedBy.toUpperCase()}
                    onChange={(e) => {
                      setTestedBy(e.target.value);
                      clearFieldError("testedBy");
                      markDirty();
                    }}
                    readOnly={lock("testedBy")}
                    placeholder="Name"
                  />
                </div>

                <div className="font-medium mt-2 flex items-center gap-2 relative" data-correction-field="testedDate" data-correction-state={correctionState("testedDate")}>
                  DATE:
                  <ResolveOverlay field="testedDate" />
                  <input
                    className={signatureInputClass("testedDate")}
                    type="date"
                    min={todayISO()}
                    value={formatDateForInput(displayTestedDate)}
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
                <div className="font-medium mb-2 flex items-center gap-2 relative" data-correction-field="reviewedBy" data-correction-state={correctionState("reviewedBy")}>
                  REVIEWED BY:
                  <ResolveOverlay field="reviewedBy" />
                  <input
                    className={signatureInputClass("reviewedBy")}
                    value={displayReviewedBy.toUpperCase()}
                    onChange={(e) => {
                      setReviewedBy(e.target.value);
                      clearFieldError("reviewedBy");
                      markDirty();
                    }}
                    readOnly={lock("reviewedBy")}
                    placeholder="Name"
                  />
                </div>

                <div className="font-medium mt-2 flex items-center gap-2 relative" data-correction-field="reviewedDate" data-correction-state={correctionState("reviewedDate")}>
                  DATE:
                  <ResolveOverlay field="reviewedDate" />
                  <input
                    className={signatureInputClass("reviewedDate")}
                    type="date"
                    min={todayISO()}
                    value={formatDateForInput(displayReviewedDate)}
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

      {!hideBottomActions && !correctionLaunch && (
        <div className="no-print mt-4 flex items-center justify-between">
          {/* Left: status action buttons */}
          <div className="flex flex-wrap gap-2">
            {canUseStatusButtons &&
              (() => {
                const transition =
                  STERILITY_STATUS_TRANSITIONS[
                    status as SterilityReportStatus
                  ];

                if (!transition?.canSet?.includes(role as any)) return null;

                const nextStatuses = getNextStatuses();
                const correctionStatuses = nextStatuses.filter(
                  (target) =>
                    target === "CHANGE_REQUESTED" ||
                    target === "CORRECTION_REQUESTED",
                );
                const normalStatuses = nextStatuses.filter(
                  (target) =>
                    target !== "CHANGE_REQUESTED" &&
                    target !== "CORRECTION_REQUESTED",
                );

                return (
                  <>
                    {correctionStatuses.length > 0 && (
                      <div className="relative">
                        <button
                          type="button"
                          className="flex items-center gap-2 rounded-md border bg-amber-700 px-4 py-2 text-white hover:bg-amber-800 disabled:opacity-60"
                          onClick={() => setCorrectionActionOpen((value) => !value)}
                          disabled={busy !== null}
                        >
                          Corrections ▾
                        </button>

                        {correctionActionOpen && (
                          <div className="absolute left-0 top-full z-30 mt-2 w-40 overflow-hidden rounded-lg border bg-white shadow-lg">
                            {correctionStatuses.includes("CHANGE_REQUESTED") && (
                              <button
                                type="button"
                                className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-cyan-50"
                                onClick={() => requestStatusChange("CHANGE_REQUESTED")}
                              >
                                Request Change
                              </button>
                            )}
                            {correctionStatuses.includes("CORRECTION_REQUESTED") && (
                              <button
                                type="button"
                                className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-yellow-50"
                                onClick={() => requestStatusChange("CORRECTION_REQUESTED")}
                              >
                                Raise Correction
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {normalStatuses.map((targetStatus) => {
                      if (!statusButtons[targetStatus]) return null;
                      const { label, color } = statusButtons[targetStatus];

                      return (
                        <div key={targetStatus} className="relative group">
                          <button
                            type="button"
                            className={`px-4 py-2 rounded-md border text-white ${color} disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2`}
                            onClick={() =>
                              requestStatusChange(
                                targetStatus as SterilityReportStatus,
                              )
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
                  </>
                );
              })()}

            <div className="flex items-center text-sm text-slate-500">
              Status: <b className="ml-1">{formatStatus(status)}</b>
            </div>
          </div>

          {/* Right: close / print / save */}
        </div>
      )}

      {showESign && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Electronic signature"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            style={{ transform: `translate(${eSignPos.x}px, ${eSignPos.y}px)` }}
          >
            <div
              className="mb-4 flex cursor-move select-none items-start gap-3"
              onMouseDown={startESignDrag}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200">
                🔐
              </div>

              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {eSignActionTitle(pendingStatus)}
                </h2>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  21 CFR Part 11 Electronic Signature Authorization
                </p>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Authorization Summary
              </div>

              <div className="space-y-2">
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Document</span>
                  <span className="text-right font-semibold text-slate-800">
                    APE Validation Report
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Current Status</span>
                  <span className="text-right font-semibold text-slate-800">
                    {formatStatus(status)}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">New Status</span>
                  <span className="text-right font-semibold text-blue-700">
                    {formatStatus(String(pendingStatus || ""))}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Parent Report No.</span>
                  <span className="text-right font-semibold text-slate-800">
                    {(report as any)?.parentReportNumber ||
                      reportNumber ||
                      "Not assigned"}
                  </span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-slate-500">Signing By</span>
                  <span className="text-right font-semibold text-slate-800">
                    {user?.name || user?.email || "Current user"}
                  </span>
                </div>
              </div>
            </div>

            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This electronic signature is saved to this report with the user,
              timestamp, and reason. The parent APE status changes only after
              both APE reports have the required electronic signature.
            </p>

            <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={eSignConfirmed}
                onChange={(event) => {
                  setESignConfirmed(event.target.checked);
                  setESignError(null);
                }}
                className="mt-0.5"
              />
              <span>
                I confirm that this electronic signature represents my legally
                binding authorization for this action.
              </span>
            </label>

            <input
              type="text"
              placeholder="Reason for change"
              value={changeReason}
              onChange={(event) => {
                setChangeReason(event.target.value);
                setESignError(null);
              }}
              className="mb-3 mt-3 w-full rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
              disabled={eSignSubmitting}
            />

            <div className="relative">
              <input
                type={showESignPassword ? "text" : "password"}
                value={eSignPassword}
                onChange={(event) => {
                  setESignPassword(event.target.value);
                  setESignError(null);
                }}
                className="w-full rounded-lg border px-3 py-2 pr-10 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
                placeholder="Enter e-signature password"
                autoComplete="current-password"
                disabled={eSignSubmitting}
              />

              <button
                type="button"
                onClick={() => setShowESignPassword((value) => !value)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 transition hover:text-slate-700"
                aria-label={
                  showESignPassword ? "Hide password" : "Show password"
                }
                title={showESignPassword ? "Hide password" : "Show password"}
                disabled={eSignSubmitting}
              >
                {showESignPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {eSignError && (
              <div className="mt-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {eSignError}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                onClick={closeESignModal}
                disabled={eSignSubmitting}
              >
                Cancel
              </button>

              <button
                type="button"
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={
                  eSignSubmitting ||
                  !pendingStatus ||
                  !changeReason.trim() ||
                  !eSignPassword.trim() ||
                  !eSignConfirmed
                }
                onClick={async () => {
                  if (!pendingStatus) return;

                  const reason = changeReason.trim();
                  const password = eSignPassword.trim();

                  if (!reason) {
                    setESignError("Reason is required.");
                    return;
                  }

                  if (!password) {
                    setESignError("E-signature password is required.");
                    return;
                  }

                  if (!eSignConfirmed) {
                    setESignError("Please confirm the electronic-signature statement.");
                    return;
                  }

                  const statusToApply = pendingStatus;
                  setESignSubmitting(true);
                  setESignError(null);

                  try {
                    const success = await handleStatusChange(statusToApply, {
                      reason,
                      eSignPassword: password,
                    });

                    if (!success) {
                      setESignError(
                        "The status change could not be completed. Review the report and try again.",
                      );
                      return;
                    }

                    if (previewTestingSignature) {
                      setTestedBy(user?.name || user?.email || "");
                      setTestedDate(todayISO());
                    }

                    if (previewReviewSignature) {
                      setReviewedBy(user?.name || user?.email || "");
                      setReviewedDate(todayISO());
                    }

                    closeESignModal();
                  } catch (error: any) {
                    const message =
                      error?.response?.data?.message ||
                      error?.response?.message ||
                      error?.message ||
                      "Electronic signature failed.";
                    const normalizedMessage = Array.isArray(message)
                      ? message.join(", ")
                      : String(message);

                    if (
                      normalizedMessage.toLowerCase().includes("password") ||
                      normalizedMessage.toLowerCase().includes("invalid") ||
                      normalizedMessage.toLowerCase().includes("incorrect")
                    ) {
                      setESignError("❌ Incorrect e-signature password.");
                    } else {
                      setESignError(normalizedMessage);
                    }
                  } finally {
                    setESignSubmitting(false);
                  }
                }}
              >
                {eSignSubmitting && <Spinner />}
                {eSignSubmitting
                  ? "Verifying..."
                  : eSignButtonText(pendingStatus)}
              </button>
            </div>
          </div>
        </div>
      )}

      {canShowFloatingUi && selectingCorrections && (
        <div className="fixed bottom-4 left-1/2 z-50 w-[560px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border bg-white/95 p-4 shadow-xl">
          <div className="text-sm font-semibold">Corrections picker</div>
          <div className="text-xs text-slate-600">
            Click a field in the report to add a correction note.
          </div>

          <ul className="mt-3 max-h-32 overflow-auto text-xs">
            {pendingCorrections.map((item, index) => {
              const option = correctionFieldOptions.find(
                (field) => field.key === item.fieldKey,
              );

              return (
                <li
                  key={`${item.fieldKey}-${index}`}
                  className="flex items-center justify-between gap-2 border-b py-1"
                >
                  <span className="truncate">
                    <b>{option?.label ?? item.fieldKey}</b>: {item.message}
                  </span>
                  <button
                    type="button"
                    className="text-rose-600 hover:underline"
                    onClick={() =>
                      setPendingCorrections((prev) =>
                        prev.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    remove
                  </button>
                </li>
              );
            })}
            {pendingCorrections.length === 0 && (
              <li className="text-slate-400">No items yet</li>
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
                setAddForField(null);
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

      {canShowFloatingUi && addForField && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-base font-semibold">Add correction</h3>
            <p className="mb-2 text-xs text-slate-600">
              Field: <b>{correctionFieldOptions.find((item) => item.key === addForField)?.label ?? addForField}</b>
            </p>
            <textarea
              autoFocus
              rows={3}
              value={addMessage}
              onChange={(event) => setAddMessage(event.target.value)}
              placeholder="Describe what needs to be corrected"
              className="w-full rounded-lg border px-3 py-2 text-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-blue-500"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border px-3 py-1.5 text-sm"
                onClick={() => {
                  setAddForField(null);
                  setAddMessage("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!addMessage.trim() || busy !== null}
                onClick={() => addPendingCorrection(addForField)}
              >
                {busy === "ADD_CORRECTION" && <Spinner />}
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {canShowFloatingUi && (
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
      )}

      {canShowFloatingUi && showCorrTray && (
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
                        onClick={() => {
                          if (!canResolve) return;

                          if (role === "SYSTEMADMIN") {
                            setResolveTarget(c);
                            setResolveFieldTarget(null);
                            setResolveReason("");
                            setShowResolveModal(true);
                            return;
                          }

                          resolveOneCorrection(c);
                        }}
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

      {canShowFloatingUi &&
        showResolveModal &&
        (resolveTarget || resolveFieldTarget) && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="mb-2 text-base font-semibold">Resolve Correction</h3>
              <p className="mb-2 text-xs text-slate-600">
                Field: <b>{resolveTarget?.fieldKey ?? resolveFieldTarget}</b>
              </p>
              <textarea
                autoFocus
                rows={3}
                value={resolveReason}
                onChange={(event) => setResolveReason(event.target.value)}
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
                  onClick={async () => {
                    const reason = `SystemAdmin override: ${resolveReason.trim()}`;

                    if (resolveFieldTarget) {
                      await resolveField(resolveFieldTarget, reason);
                    } else if (resolveTarget) {
                      await resolveOneCorrection(resolveTarget, reason);
                    }

                    setShowResolveModal(false);
                    setResolveTarget(null);
                    setResolveFieldTarget(null);
                    setResolveReason("");
                  }}
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
