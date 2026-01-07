

// src/permissions/reportWorkflow.ts
export type Role =
  | "SYSTEMADMIN"
  | "ADMIN"
  | "FRONTDESK"
  | "CHEMISTRY"
  | "QA"
  | "CLIENT";

export type CorrectionItem = {
  id: string;
  fieldKey: string;
  message: string;
  status: "OPEN" | "RESOLVED";
  requestedByRole: Role;
  createdAt: string;
  oldValue?: string | null;
  newValue?: string | null;
  resolvedAt?: string | null;
  resolvedByRole?: Role | null;
  resolutionNote?: string | null;
};

export type ChemistryReportStatus =
  | "DRAFT"
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
  | "UNDER_ADMIN_REVIEW"
  | "ADMIN_NEEDS_CORRECTION"
  | "ADMIN_REJECTED"
  | "UNDER_RESUBMISSION_ADMIN_REVIEW"
  | "APPROVED"
  | "LOCKED";

// 🔁 Keep this in sync with backend
export const STATUS_TRANSITIONS: Record<
  ChemistryReportStatus,
  {
    canSet: Role[];
    next: ChemistryReportStatus[];
    nextEditableBy: Role[];
    canEdit: Role[];
  }
> = {
  DRAFT: {
    canSet: ["CLIENT"],
    next: ["SUBMITTED_BY_CLIENT"],
    nextEditableBy: ["CLIENT", "FRONTDESK"],
    canEdit: ["CLIENT"],
  },
  SUBMITTED_BY_CLIENT: {
    canSet: ["CHEMISTRY"],
    next: ["UNDER_TESTING_REVIEW"],
    nextEditableBy: ["CHEMISTRY"],
    canEdit: [],
  },
  UNDER_CLIENT_REVIEW: {
    canSet: ["CLIENT"],
    next: ["CLIENT_NEEDS_CORRECTION", "APPROVED"],
    nextEditableBy: ["ADMIN"],
    canEdit: [],
  },
  CLIENT_NEEDS_CORRECTION: {
    canSet: ["CHEMISTRY"],
    next: ["UNDER_RESUBMISSION_TESTING_REVIEW"],
    nextEditableBy: ["CHEMISTRY", "ADMIN"],
    canEdit: [],
  },
  UNDER_CLIENT_CORRECTION: {
    canSet: ["CLIENT"],
    next: ["RESUBMISSION_BY_CLIENT"],
    nextEditableBy: ["CHEMISTRY", "ADMIN"],
    canEdit: ["CLIENT"],
  },

  RESUBMISSION_BY_CLIENT: {
    canSet: ["CHEMISTRY"],
    next: ["UNDER_TESTING_REVIEW"],
    nextEditableBy: ["ADMIN", "CHEMISTRY"],
    canEdit: [],
  },
  RECEIVED_BY_FRONTDESK: {
    canSet: ["FRONTDESK"],
    next: ["UNDER_CLIENT_REVIEW", "FRONTDESK_ON_HOLD"],
    nextEditableBy: ["CHEMISTRY"],
    canEdit: [],
  },
  FRONTDESK_ON_HOLD: {
    canSet: ["FRONTDESK"],
    next: ["RECEIVED_BY_FRONTDESK"],
    nextEditableBy: ["FRONTDESK"],
    canEdit: [],
  },
  FRONTDESK_NEEDS_CORRECTION: {
    canSet: ["FRONTDESK", "ADMIN"],
    next: ["SUBMITTED_BY_CLIENT"],
    nextEditableBy: ["CLIENT"],
    canEdit: [],
  },
  UNDER_TESTING_REVIEW: {
    canSet: ["CHEMISTRY"],
    next: ["TESTING_ON_HOLD", "TESTING_NEEDS_CORRECTION", "UNDER_ADMIN_REVIEW"],
    nextEditableBy: ["CHEMISTRY"],
    canEdit: ["CHEMISTRY", "ADMIN"],
  },
  TESTING_ON_HOLD: {
    canSet: ["CHEMISTRY"],
    next: ["UNDER_TESTING_REVIEW"],
    nextEditableBy: ["CHEMISTRY", "ADMIN"],
    canEdit: [],
  },
  TESTING_NEEDS_CORRECTION: {
    canSet: ["CLIENT"],
    next: ["UNDER_CLIENT_CORRECTION"],
    nextEditableBy: ["CLIENT"],
    canEdit: [],
  },
  UNDER_RESUBMISSION_TESTING_REVIEW: {
    canSet: ["CHEMISTRY"],
    next: ["RESUBMISSION_BY_TESTING"],
    nextEditableBy: ["CLIENT"],
    canEdit: ["CHEMISTRY", "ADMIN"],
  },
  RESUBMISSION_BY_TESTING: {
    canSet: ["CLIENT"],
    next: ["UNDER_ADMIN_REVIEW"],
    nextEditableBy: ["CLIENT"],
    canEdit: [],
  },
  UNDER_QA_REVIEW: {
    canSet: ["CHEMISTRY"],
    next: ["QA_NEEDS_CORRECTION", "UNDER_ADMIN_REVIEW"],
    nextEditableBy: ["QA"],
    canEdit: ["QA"],
  },
  QA_NEEDS_CORRECTION: {
    canSet: ["QA"],
    next: ["UNDER_TESTING_REVIEW"],
    nextEditableBy: ["CHEMISTRY"],
    canEdit: [],
  },

  UNDER_ADMIN_REVIEW: {
    canSet: ["ADMIN", "SYSTEMADMIN"],
    next: ["ADMIN_NEEDS_CORRECTION", "ADMIN_REJECTED", "RECEIVED_BY_FRONTDESK"],
    nextEditableBy: ["QA", "ADMIN", "SYSTEMADMIN"],
    canEdit: ["ADMIN"],
  },
  ADMIN_NEEDS_CORRECTION: {
    canSet: ["ADMIN", "SYSTEMADMIN"],
    next: ["UNDER_QA_REVIEW"],
    nextEditableBy: ["QA"],
    canEdit: ["ADMIN"],
  },
  ADMIN_REJECTED: {
    canSet: ["ADMIN", "SYSTEMADMIN"],
    next: ["UNDER_QA_REVIEW"],
    nextEditableBy: ["QA"],
    canEdit: [],
  },
  UNDER_RESUBMISSION_ADMIN_REVIEW: {
    canSet: ["ADMIN"],
    next: ["RECEIVED_BY_FRONTDESK"],
    nextEditableBy: ["CLIENT"],
    canEdit: ["ADMIN"],
  },
  APPROVED: {
    canSet: [],
    next: [],
    nextEditableBy: [],
    canEdit: [],
  },
  LOCKED: {
    canSet: ["CLIENT", "ADMIN", "SYSTEMADMIN"],
    next: [],
    nextEditableBy: [],
    canEdit: [],
  },
};

//  these are designed for readable badges on white UI
export const CHEMISTRY_STATUS_COLORS: Record<ChemistryReportStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",

  SUBMITTED_BY_CLIENT: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",

  UNDER_CLIENT_REVIEW: "bg-amber-100 text-amber-900 ring-1 ring-amber-200",

  CLIENT_NEEDS_CORRECTION: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",

  UNDER_CLIENT_CORRECTION:
    "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200",

  RESUBMISSION_BY_CLIENT: "bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200",

  RECEIVED_BY_FRONTDESK: "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200",
  FRONTDESK_ON_HOLD: "bg-orange-100 text-orange-800 ring-1 ring-orange-200",
  FRONTDESK_NEEDS_CORRECTION: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",

  UNDER_TESTING_REVIEW: "bg-sky-100 text-sky-800 ring-1 ring-sky-200",
  TESTING_ON_HOLD: "bg-orange-100 text-orange-800 ring-1 ring-orange-200",
  TESTING_NEEDS_CORRECTION: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",

  RESUBMISSION_BY_TESTING: "bg-teal-100 text-teal-800 ring-1 ring-teal-200",
  UNDER_RESUBMISSION_TESTING_REVIEW:
    "bg-teal-100 text-teal-900 ring-1 ring-teal-200",

  UNDER_QA_REVIEW: "bg-purple-100 text-purple-800 ring-1 ring-purple-200",
  QA_NEEDS_CORRECTION: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",

  UNDER_ADMIN_REVIEW: "bg-violet-100 text-violet-800 ring-1 ring-violet-200",
  ADMIN_NEEDS_CORRECTION: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",
  ADMIN_REJECTED: "bg-red-100 text-red-800 ring-1 ring-red-200",
  UNDER_RESUBMISSION_ADMIN_REVIEW:
    "bg-violet-100 text-violet-900 ring-1 ring-violet-200",

  APPROVED: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
  LOCKED: "bg-slate-200 text-slate-800 ring-1 ring-slate-300",
};

// Field-level permissions (frontend hint; backend is source of truth)
export const FIELD_EDIT_MAP: Record<Role, string[]> = {
  SYSTEMADMIN: [],
  ADMIN: ["*"],
  FRONTDESK: [],
  CHEMISTRY: [
    "dateReceived",
    "sop",
    "results",
    "dateTested",
    "initial",
    "comments",
    "testedBy",
    "testedDate",
    "actives",
  ],
  QA: ["dateCompleted", "reviewedBy", "reviewedDate"],
  CLIENT: [
    "client",
    "dateSent",
    "sampleDescription",
    "testTypes",
    "sampleCollected",
    "lotBatchNo",
    "manufactureDate",
    "formulaId",
    "sampleSize",
    "numberOfActives",
    "sampleTypes",
    "comments",
    "actives",
    "formulaContent",
  ],
};

// ---------- Helpers ----------
export function canRoleEditInStatus(
  role?: Role,
  status?: ChemistryReportStatus
): boolean {
  if (!role || !status) return false;
  const t = STATUS_TRANSITIONS[status];
  return !!t?.canSet?.includes(role);
}

export function canRoleEditField(
  role: Role | undefined,
  status: ChemistryReportStatus | undefined,
  field: string
): boolean {
  if (!role || !status) return false;
  const t = STATUS_TRANSITIONS[status];
  if (!t || !t.canEdit.includes(role)) return false;

  const fields = FIELD_EDIT_MAP[role] || [];
  if (fields.includes("*")) return true;
  return fields.includes(field);
}

/**
 * Show "Update" button if:
 *  - user can edit in this status (status-level), and
 *  - there is at least one field they’re allowed to edit (field-level).
 * You can pass a list of fields relevant to that screen; default checks any field in the map.
 */
export function canShowChemistryUpdateButton(
  role: Role | undefined,
  status: ChemistryReportStatus | undefined,
  fieldsToConsider?: string[]
): boolean {
  if (!role || !status) return false;
  if (!canRoleEditInStatus(role, status)) return false;

  const allow = FIELD_EDIT_MAP[role] ?? [];
  const effective = allow.includes("*")
    ? fieldsToConsider ?? ["*"]
    : fieldsToConsider ?? allow;
  return (
    effective.length > 0 &&
    (allow.includes("*") || effective.some((f) => allow.includes(f)))
  );
}



