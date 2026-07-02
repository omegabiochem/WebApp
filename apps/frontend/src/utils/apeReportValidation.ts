// utils/reportValidation.ts
import { useCallback, useMemo, useState } from "react";

export type Role =
  | "SYSTEMADMIN"
  | "ADMIN"
  | "FRONTDESK"
  | "MICRO"
  | "MC"
  | "QA"
  | "CLIENT";

export type ReportStatus =
  | "DRAFT"
  | "UNDER_DRAFT_REVIEW"
  | "SUBMITTED_BY_CLIENT"
  | "CLIENT_NEEDS_CORRECTION"
  | "UNDER_CLIENT_CORRECTION"
  | "RESUBMISSION_BY_CLIENT"
  | "UNDER_CLIENT_REVIEW"
  | "RECEIVED_BY_FRONTDESK"
  | "FRONTDESK_ON_HOLD"
  | "FRONTDESK_NEEDS_CORRECTION"
  | "UNDER_TESTING_REVIEW"
  | "TESTING_ON_HOLD"
  | "TESTING_NEEDS_CORRECTION"
  | "RESUBMISSION_BY_TESTING"
  | "UNDER_RESUBMISSION_TESTING_REVIEW"
  | "UNDER_QA_REVIEW"
  | "QA_NEEDS_CORRECTION"
  | "UNDER_RESUBMISSION_QA_REVIEW"
  | "UNDER_ADMIN_REVIEW"
  | "ADMIN_NEEDS_CORRECTION"
  | "ADMIN_REJECTED"
  | "UNDER_RESUBMISSION_ADMIN_REVIEW"
  | "APPROVED"
  | "LOCKED"
  | "VOID"
  | "CHANGE_REQUESTED"
  | "UNDER_CHANGE_UPDATE"
  | "CORRECTION_REQUESTED"
  | "UNDER_CORRECTION_UPDATE";

export type ApeReportFormValues = {
  client: string;
  dateSent: string;
  typeOfTest: string;
  sampleType: string;
  formulaNo: string;
  description: string;
  lotNo: string;
  manufactureDate: string;
  organisms: {
    key: string;
    label: string;
    checked: boolean;
  }[];
  testSopNo: string;
  dateTested: string;

  comments: string;
  testedBy: string;
  testedDate: string;
  dateCompleted: string;
  reviewedBy: string;
  reviewedDate: string;
};

// Centralized field requirements per role (no layout impact)
export const ROLE_FIELDS: Record<Role, string[]> = {
  SYSTEMADMIN: [],
  ADMIN: [
    "testSopNo",
    "dateTested",

    "comments",
    "testedBy",
    "testedDate",
    "dateCompleted",
    // "reviewedBy",
    // "reviewedDate",
  ],
  FRONTDESK: [],
  MICRO: ["testSopNo", "dateTested", "dateCompleted"],
  MC: ["testSopNo", "dateTested", "dateCompleted"],
  QA: [],
  CLIENT: [
    "dateSent",
    "typeOfTest",
    "sampleType",
    // "formulaNo",
    "description",
    "lotNo",
    "organisms",
    // "manufactureDate",
  ],
};

export type MicroPhase = "PRELIM" | "FINAL";

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
  field: string,
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
    msg,
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
  reason?: string,
  expectedVersion?: number,
  meta?: {
    kinds?: ("REQUEST_CHANGE" | "RAISE_CORRECTION")[];
    previousStatus?: string;
    workflowReturnStatus?: string;
  },
) {
  return api<CorrectionItem[]>(`/reports/${reportId}/corrections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items,
      targetStatus,
      reason,
      expectedVersion,
      ...meta,
    }),
  });
}

export async function resolveCorrection(
  reportId: string,
  cid: string,
  resolutionNote?: string,
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

  //   const currentPhase = useMemo(
  //     () => opts?.phase ?? deriveMicroPhaseFromStatus(opts?.status),
  //     [opts?.phase, opts?.status],
  //   );

  // How to check emptiness using provided values
  const isEmpty = useCallback(
    (field: string, v: ApeReportFormValues): boolean => {
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

          case "organisms":
  return !Array.isArray(v.organisms) || !v.organisms.some((o) => o.checked);

        case "comments":
          return !v.comments?.trim();
        case "testedBy":
          return !v.testedBy?.trim();
        case "testedDate":
          return !v.testedDate;

        case "dateCompleted": {
          return !v.dateCompleted;
        }
        case "reviewedBy":
          return !v.reviewedBy?.trim();
        case "reviewedDate":
          return !v.reviewedDate;

        default:
          return false;
      }
    },
    [],
  );

  const requiredList = useMemo(() => {
    // Base role requireds (fallback)
    const base = (ROLE_FIELDS[(role as Role) || "CLIENT"] ?? []).filter(
      (f) => f !== "*",
    );

    // 1) Absolute override wins
    if (opts?.requiredOverride) return opts.requiredOverride;

    // // 2) If MICRO and explicit phase was provided, use phase lists
    // if ((role === "MICRO" || role === "MC") && opts?.phase) {
    //   return MICRO_PHASE_FIELDS[opts.phase];
    // }

    // // 3) If MICRO and status provided, infer phase from status
    // if ((role === "MICRO" || role === "MC") && opts?.status) {
    //   const phase = deriveMicroPhaseFromStatus(opts.status);
    //   if (phase) return MICRO_PHASE_FIELDS[phase];
    // }

    // 4) Fallback to role defaults
    return base;
  }, [role, opts?.requiredOverride, opts?.phase, opts?.status]);

  /** returns true when valid; sets errors + scrolls to first error */
  const validateAndSetErrors = useCallback(
    (values: ApeReportFormValues): boolean => {
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
    [isEmpty, requiredList],
  );

  return { errors, clearError, validateAndSetErrors };
}
