// utils/reportValidation.ts
import { useCallback, useMemo, useState } from "react";

export type Role =
  | "SYSTEMADMIN"
  | "ADMIN"
  | "FRONTDESK"
  | "MICRO"
  | "QA"
  | "CLIENT";

export type ReportStatus =
  | "DRAFT"
  | "SUBMITTED_BY_CLIENT"
  | "CLIENT_NEEDS_PRELIMINARY_CORRECTION"
  | "CLIENT_NEEDS_FINAL_CORRECTION"
  | "UNDER_CLIENT_PRELIMINARY_CORRECTION"
  | "UNDER_CLIENT_FINAL_CORRECTION"
  | "PRELIMINARY_RESUBMISSION_BY_CLIENT"
  | "FINAL_RESUBMISSION_BY_CLIENT"
  | "UNDER_CLIENT_PRELIMINARY_REVIEW"
  | "UNDER_CLIENT_FINAL_REVIEW"
  | "RECEIVED_BY_FRONTDESK"
  | "FRONTDESK_ON_HOLD"
  | "FRONTDESK_NEEDS_CORRECTION"
  | "UNDER_PRELIMINARY_TESTING_REVIEW"
  | "PRELIMINARY_TESTING_ON_HOLD"
  | "PRELIMINARY_TESTING_NEEDS_CORRECTION"
  | "PRELIMINARY_RESUBMISSION_BY_TESTING"
  | "UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW"
  | "FINAL_RESUBMISSION_BY_TESTING"
  | "PRELIMINARY_APPROVED"
  | "UNDER_FINAL_TESTING_REVIEW"
  | "FINAL_TESTING_ON_HOLD"
  | "FINAL_TESTING_NEEDS_CORRECTION"
  | "FINAL_RESUBMISSION_BY_TESTING"
  | "UNDER_FINAL_RESUBMISSION_TESTING_REVIEW"
  | "UNDER_QA_REVIEW"
  | "QA_NEEDS_CORRECTION"
  | "UNDER_ADMIN_REVIEW"
  | "ADMIN_NEEDS_CORRECTION"
  | "ADMIN_REJECTED"
  | "UNDER_FINAL_RESUBMISSION_QA_REVIEW"
  | "UNDER_FINAL_RESUBMISSION_ADMIN_REVIEW"
  | "FINAL_APPROVED"
  | "LOCKED";

// The values your form passes into validation
export type PathRow = {
  checked: boolean;
  key: string;
  label: string;
  grams: string;
  result: "Absent" | "Present" | "";
  spec: "Absent" | "Present" | "";
};
export type MicroMixReportFormValues = {
  client: string;
  dateSent: string;
  typeOfTest: string;
  sampleType: string;
  formulaNo: string;
  description: string;
  lotNo: string;
  manufactureDate: string;

  testSopNo: string;
  dateTested: string;
  preliminaryResults: string;
  preliminaryResultsDate: string;

  tbc_gram: string;
  tbc_result: string;
  tbc_spec: string;
  tmy_gram: string;
  tmy_result: string;
  tmy_spec: string;

  comments: string;
  testedBy: string;
  testedDate: string;
  dateCompleted: string;
  reviewedBy: string;
  reviewedDate: string;

  pathogens: PathRow[];
};

export type MicroMixWaterReportFormValues = {
  client: string;
  dateSent: string;
  typeOfTest: string;
  sampleType: string;
  idNo: string;
  description: string;
  lotNo: string;
  samplingDate: string;

  testSopNo: string;
  dateTested: string;
  preliminaryResults: string;
  preliminaryResultsDate: string;

  tbc_gram: string;
  tbc_result: string;
  tbc_spec: string;
  tmy_gram: string;
  tmy_result: string;
  tmy_spec: string;

  comments: string;
  testedBy: string;
  testedDate: string;
  dateCompleted: string;
  reviewedBy: string;
  reviewedDate: string;

  pathogens: PathRow[];
};

// Centralized field requirements per role (no layout impact)
export const ROLE_FIELDS: Record<Role, string[]> = {
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
    // "reviewedBy",
    // "reviewedDate",
  ],
  FRONTDESK: [],
  MICRO: [
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
    // "comments",
    // "testedBy",
    // "testedDate",
  ],
  QA: ["dateCompleted"],
  CLIENT: [
    "dateSent",
    "typeOfTest",
    "sampleType",
    // "formulaNo",
    "description",
    "lotNo",
    // "manufactureDate",
    "tmy_spec",
    "tbc_spec",
  ],
};

/* =======================
 * MICRO: Phase logic & status buckets
 * ======================= */

export type MicroPhase = "PRELIM" | "FINAL";

/** Fine-grained MICRO required fields by phase */
export const MICRO_PHASE_FIELDS: Record<MicroPhase, string[]> = {
  PRELIM: [
    "testSopNo",
    "dateTested",
    "preliminaryResults",
    "preliminaryResultsDate",
    "tbc_gram",
    "tbc_result",
  ],
  FINAL: [
    "tmy_gram",
    "tmy_result",
    "pathogens",
    // "comments",
    // "testedBy",
    // "testedDate",
  ],
};

/** Statuses that should validate the MICRO "Preliminary" subset */
export const PRELIM_STATUSES: ReportStatus[] = [
  "UNDER_PRELIMINARY_TESTING_REVIEW",
  "PRELIMINARY_TESTING_ON_HOLD",
  "PRELIMINARY_TESTING_NEEDS_CORRECTION",
  "PRELIMINARY_RESUBMISSION_BY_TESTING",
  "UNDER_PRELIMINARY_RESUBMISSION_TESTING_REVIEW",
  "PRELIMINARY_APPROVED", // up to this point it's still the preliminary pass
];

/** Statuses that should validate the MICRO "Final" subset */
export const FINAL_STATUSES: ReportStatus[] = [
  "UNDER_FINAL_TESTING_REVIEW",
  "FINAL_TESTING_ON_HOLD",
  "FINAL_TESTING_NEEDS_CORRECTION",
  "FINAL_RESUBMISSION_BY_TESTING",
  "UNDER_FINAL_RESUBMISSION_TESTING_REVIEW",
];

/** Helper: derive MICRO phase from a status */
export function deriveMicroPhaseFromStatus(
  status?: ReportStatus
): MicroPhase | undefined {
  if (!status) return undefined;
  if (PRELIM_STATUSES.includes(status)) return "PRELIM";
  if (FINAL_STATUSES.includes(status)) return "FINAL";
  return undefined;
}

// Small helper you can use instead of a local canEdit()
export function canEditBy(
  role: Role | undefined,
  status: ReportStatus | undefined,
  statusTransitions: Record<
    ReportStatus,
    {
      canSet: Role[];
      next: ReportStatus[];
      nextEditableBy: Role[];
      canEdit: Role[];
    }
  >,
  field: string
) {
  if (!role || !status) return false;
  const t = statusTransitions[status];
  if (!t || !t.canEdit?.includes(role)) return false;
  const list = ROLE_FIELDS[role] ?? [];
  return list.includes("*") || list.includes(field);
}

// Non-layout error badge (absolute positioned)
import React from "react";
import { api } from "../lib/api";

export function FieldErrorBadge({
  name,
  errors,
}: {
  name: string;
  errors: Record<string, string>;
}): React.ReactElement | null {
  const msg = errors[name];
  if (!msg) return null;
  return React.createElement(
    "span",
    {
      className:
        "absolute -top-2 right-1 text-[10px] leading-none text-red-600 bg-white px-1 rounded no-print pointer-events-none",
      title: msg,
    },
    msg
  );
}

// const API_BASE = "http://localhost:3000";

export type CorrectionItem = {
  id: string;
  fieldKey: string;
  message: string;
  status: "OPEN" | "RESOLVED";
  requestedByRole: Role;
  createdAt: string;

  // ✅ add
  oldValue?: string | null;
  resolvedAt?: string | null;
  resolvedByRole?: Role | null;
  resolutionNote?: string | null;
};

export async function getCorrections(reportId: string) {
  // const res = await fetch(
  //   `${API_BASE}/reports/${reportId}/corrections`,
  //   {
  //     headers: { Authorization: `Bearer ${token}` },
  //   }
  // );
  return await api<CorrectionItem[]>(`/reports/${reportId}/corrections`);
  // if (!res.ok) throw new Error("Failed to fetch corrections");
  // return (await res.json()) as CorrectionItem[];
}

export async function createCorrections(
  reportId: string,
  items: { fieldKey: string; message: string }[],
  targetStatus?: string,
  reason?: string
) {
  return api<CorrectionItem[]>(`/reports/${reportId}/corrections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, targetStatus, reason }),
  });
}

export async function resolveCorrection(
  reportId: string,
  cid: string,
  resolutionNote?: string
) {
  return api<CorrectionItem>(`/reports/${reportId}/corrections/${cid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resolutionNote }),
  });
}

/* =======================
 * Main validation hook
 * ======================= */

type ValidationOpts = {
  /** If provided, this replaces the required list (wins over phase/status). */
  requiredOverride?: string[];
  /** Force a MICRO phase (wins over status). */
  phase?: MicroPhase;
  /** Current status to infer MICRO phase. */
  status?: ReportStatus;
};

// Hook that validates based on ROLE_FIELDS and returns boolean
export function useReportValidation(role?: Role, opts?: ValidationOpts) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clearError = useCallback((name: string) => {
    setErrors((prev) => {
      if (!(name in prev)) return prev;
      const { [name]: _omit, ...rest } = prev;
      return rest;
    });
  }, []);

  const currentPhase = useMemo(
    () => opts?.phase ?? deriveMicroPhaseFromStatus(opts?.status),
    [opts?.phase, opts?.status]
  );

  // How to check emptiness using provided values
  const isEmpty = useCallback(
    (field: string, v: MicroMixReportFormValues): boolean => {
      switch (field) {
        // case "client": return !v.client?.trim();
        case "dateSent":
          return !v.dateSent;
        case "typeOfTest":
          return !v.typeOfTest?.trim();
        case "sampleType":
          return !v.sampleType?.trim();
        case "formulaNo":
          return !v.formulaNo?.trim();
        case "description":
          return !v.description?.trim();
        case "lotNo":
          return !v.lotNo?.trim();
        case "manufactureDate": {
          // return !v.manufactureDate;
          // Treat blank as acceptable (will be saved as "NA" in handleSave)
          // Also allow explicit "NA".
          if (!v.manufactureDate || v.manufactureDate === "NA") return false;

          // If you want to only allow valid dates when provided:
          const t = Date.parse(v.manufactureDate);
          if (Number.isNaN(t)) return false; // don't block as "Required"; format is handled elsewhere
          return false;
        }

        case "testSopNo":
          return !v.testSopNo?.trim();
        case "dateTested":
          return !v.dateTested;
        case "preliminaryResults":
          return !v.preliminaryResults?.trim();
        case "preliminaryResultsDate":
          return !v.preliminaryResultsDate;
        case "tbc_gram":
          return !v.tbc_gram?.trim();
        case "tbc_result":
          return !v.tbc_result?.trim();
        case "tbc_spec":
          return !v.tbc_spec?.trim();
        case "tmy_gram":
          return !v.tmy_gram?.trim();
        case "tmy_result":
          return !v.tmy_result?.trim();
        case "tmy_spec":
          return !v.tmy_spec?.trim();
        case "comments":
          return !v.comments?.trim();
        case "testedBy":
          return !v.testedBy?.trim();
        case "testedDate":
          return !v.testedDate;

        case "dateCompleted":
          return !v.dateCompleted;
        case "reviewedBy":
          return !v.reviewedBy?.trim();
        case "reviewedDate":
          return !v.reviewedDate;

        case "pathogens": {
          const rows = v.pathogens || [];
          const anyChecked = rows.some((r) => r.checked);
          if (!anyChecked) return false; // 👉 not required if nothing selected

          // Only enforce results for MICRO/ADMIN in FINAL
          if (
            (role === "MICRO" || role === "ADMIN") &&
            currentPhase === "FINAL"
          ) {
            const missingResult = rows.some(
              (r) =>
                r.checked && r.result !== "Absent" && r.result !== "Present"
            );
            return missingResult;
          }
          return false;
        }
        default:
          return false;
      }
    },
    []
  );

  const requiredList = useMemo(() => {
    // Base role requireds (fallback)
    const base = (ROLE_FIELDS[(role as Role) || "CLIENT"] ?? []).filter(
      (f) => f !== "*"
    );

    // 1) Absolute override wins
    if (opts?.requiredOverride) return opts.requiredOverride;

    // 2) If MICRO and explicit phase was provided, use phase lists
    if (role === "MICRO" && opts?.phase) {
      return MICRO_PHASE_FIELDS[opts.phase];
    }

    // 3) If MICRO and status provided, infer phase from status
    if (role === "MICRO" && opts?.status) {
      const phase = deriveMicroPhaseFromStatus(opts.status);
      if (phase) return MICRO_PHASE_FIELDS[phase];
    }

    // 4) Fallback to role defaults
    return base;
  }, [role, opts?.requiredOverride, opts?.phase, opts?.status]);

  /** returns true when valid; sets errors + scrolls to first error */
  const validateAndSetErrors = useCallback(
    (values: MicroMixReportFormValues): boolean => {
      const next: Record<string, string> = {};
      requiredList.forEach((f) => {
        if (isEmpty(f, values)) next[f] = "Required";
      });
      setErrors(next);

      const firstKey = Object.keys(next)[0];
      if (firstKey) {
        // try to scroll to the field if it exists
        const el = document.getElementById("f-" + firstKey);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return Object.keys(next).length === 0;
    },
    [isEmpty, requiredList]
  );

  return { errors, clearError, validateAndSetErrors };
}

// Hook that validates based on ROLE_FIELDS and returns boolean
export function useMicroMixWaterReportValidation(
  role?: Role,
  opts?: ValidationOpts
) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clearError = useCallback((name: string) => {
    setErrors((prev) => {
      if (!(name in prev)) return prev;
      const { [name]: _omit, ...rest } = prev;
      return rest;
    });
  }, []);

  const currentPhase = useMemo(
    () => opts?.phase ?? deriveMicroPhaseFromStatus(opts?.status),
    [opts?.phase, opts?.status]
  );

  // How to check emptiness using provided values
  const isEmpty = useCallback(
    (field: string, v: MicroMixWaterReportFormValues): boolean => {
      switch (field) {
        // case "client": return !v.client?.trim();
        case "dateSent":
          return !v.dateSent;
        case "typeOfTest":
          return !v.typeOfTest?.trim();
        case "sampleType":
          return !v.sampleType?.trim();
        case "idNo":
          return !v.idNo?.trim();
        case "description":
          return !v.description?.trim();
        case "lotNo":
          return !v.lotNo?.trim();
        case "samplingDate": {
          // return !v.manufactureDate;
          // Treat blank as acceptable (will be saved as "NA" in handleSave)
          // Also allow explicit "NA".
          if (!v.samplingDate || v.samplingDate === "NA") return false;

          // If you want to only allow valid dates when provided:
          const t = Date.parse(v.samplingDate);
          if (Number.isNaN(t)) return false; // don't block as "Required"; format is handled elsewhere
          return false;
        }

        case "testSopNo":
          return !v.testSopNo?.trim();
        case "dateTested":
          return !v.dateTested;
        case "preliminaryResults":
          return !v.preliminaryResults?.trim();
        case "preliminaryResultsDate":
          return !v.preliminaryResultsDate;
        case "tbc_gram":
          return !v.tbc_gram?.trim();
        case "tbc_result":
          return !v.tbc_result?.trim();
        case "tbc_spec":
          return !v.tbc_spec?.trim();
        case "tmy_gram":
          return !v.tmy_gram?.trim();
        case "tmy_result":
          return !v.tmy_result?.trim();
        case "tmy_spec":
          return !v.tmy_spec?.trim();
        case "comments":
          return !v.comments?.trim();
        case "testedBy":
          return !v.testedBy?.trim();
        case "testedDate":
          return !v.testedDate;

        case "dateCompleted":
          return !v.dateCompleted;
        case "reviewedBy":
          return !v.reviewedBy?.trim();
        case "reviewedDate":
          return !v.reviewedDate;

        case "pathogens": {
          const rows = v.pathogens || [];
          const anyChecked = rows.some((r) => r.checked);
          if (!anyChecked) return false; // 👉 not required if nothing selected

          // Only enforce results for MICRO/ADMIN in FINAL
          if (
            (role === "MICRO" || role === "ADMIN") &&
            currentPhase === "FINAL"
          ) {
            const missingResult = rows.some(
              (r) =>
                r.checked && r.result !== "Absent" && r.result !== "Present"
            );
            return missingResult;
          }
          return false;
        }
        default:
          return false;
      }
    },
    []
  );

  const requiredList = useMemo(() => {
    // Base role requireds (fallback)
    const base = (ROLE_FIELDS[(role as Role) || "CLIENT"] ?? []).filter(
      (f) => f !== "*"
    );

    // 1) Absolute override wins
    if (opts?.requiredOverride) return opts.requiredOverride;

    // 2) If MICRO and explicit phase was provided, use phase lists
    if (role === "MICRO" && opts?.phase) {
      return MICRO_PHASE_FIELDS[opts.phase];
    }

    // 3) If MICRO and status provided, infer phase from status
    if (role === "MICRO" && opts?.status) {
      const phase = deriveMicroPhaseFromStatus(opts.status);
      if (phase) return MICRO_PHASE_FIELDS[phase];
    }

    // 4) Fallback to role defaults
    return base;
  }, [role, opts?.requiredOverride, opts?.phase, opts?.status]);

  /** returns true when valid; sets errors + scrolls to first error */
  const validateAndSetErrors = useCallback(
    (values: MicroMixWaterReportFormValues): boolean => {
      const next: Record<string, string> = {};
      requiredList.forEach((f) => {
        if (isEmpty(f, values)) next[f] = "Required";
      });
      setErrors(next);

      const firstKey = Object.keys(next)[0];
      if (firstKey) {
        // try to scroll to the field if it exists
        const el = document.getElementById("f-" + firstKey);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return Object.keys(next).length === 0;
    },
    [isEmpty, requiredList]
  );

  return { errors, clearError, validateAndSetErrors };
}
