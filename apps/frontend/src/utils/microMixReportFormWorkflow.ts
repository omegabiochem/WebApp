// src/permissions/reportWorkflow.ts
export type Role =
  | "SYSTEMADMIN"
  | "ADMIN"
  | "FRONTDESK"
  | "MICRO"
  | "MC"
  | "QA"
  | "CLIENT";

export type CorrectionItem = {
  id: string;
  fieldKey: string;
  message: string;
  status: "OPEN" | "RESOLVED";
  requestedByRole: Role;
  createdAt: string;
  oldValue?: any | null; // ✅ snapshot at time of request (string | number | array | object)
  resolvedAt?: string | null; // ✅ ISO
  resolvedByUserId?: string | null;

  resolutionNote?: string | null; // optional
};

export type ReportStatus =
  | "DRAFT"
  | "UNDER_DRAFT_REVIEW"
  | "SUBMITTED_BY_CLIENT"
  | "UNDER_CLIENT_PRELIMINARY_REVIEW"
  | "UNDER_CLIENT_FINAL_REVIEW"
  | "RECEIVED_BY_FRONTDESK"
  | "FRONTDESK_ON_HOLD"
  | "UNDER_PRELIMINARY_TESTING_REVIEW"
  | "PRELIMINARY_TESTING_ON_HOLD"
  | "PRELIMINARY_APPROVED"
  | "UNDER_FINAL_TESTING_REVIEW"
  | "FINAL_TESTING_ON_HOLD"
  | "UNDER_QA_PRELIMINARY_REVIEW"
  | "UNDER_QA_FINAL_REVIEW"
  | "UNDER_ADMIN_REVIEW"
  | "ADMIN_REJECTED"
  | "FINAL_APPROVED"
  | "LOCKED"
  | "VOID"
  | "UNDER_CHANGE_UPDATE"
  | "CORRECTION_REQUESTED"
  | "UNDER_CORRECTION_UPDATE"
  | "CHANGE_REQUESTED";

// 🔁 Keep this in sync with backend
export const STATUS_TRANSITIONS: Record<
  ReportStatus,
  {
    canSet: Role[];
    next: ReportStatus[];
    nextEditableBy: Role[];
    canEdit: Role[];
  }
> = {
  DRAFT: {
    canSet: ["CLIENT", "SYSTEMADMIN"],
    next: ["UNDER_DRAFT_REVIEW", "SUBMITTED_BY_CLIENT"],
    nextEditableBy: ["CLIENT", "FRONTDESK", "SYSTEMADMIN"],
    canEdit: ["CLIENT"],
  },
  UNDER_DRAFT_REVIEW: {
    canSet: ["CLIENT", "SYSTEMADMIN"],
    next: ["DRAFT", "SUBMITTED_BY_CLIENT"], // ✅
    nextEditableBy: ["CLIENT", "FRONTDESK", "SYSTEMADMIN"],
    canEdit: ["CLIENT"],
  },
  SUBMITTED_BY_CLIENT: {
    canSet: ["MICRO", "MC", "SYSTEMADMIN"],
    next: ["UNDER_PRELIMINARY_TESTING_REVIEW"],
    nextEditableBy: ["MICRO", "MC", "SYSTEMADMIN"],
    canEdit: ["MICRO", "MC", "SYSTEMADMIN", "ADMIN"],
  },
  UNDER_CLIENT_PRELIMINARY_REVIEW: {
    canSet: ["CLIENT", "SYSTEMADMIN"],
    next: ["CHANGE_REQUESTED","CORRECTION_REQUESTED", "PRELIMINARY_APPROVED"],
    nextEditableBy: ["CLIENT", "SYSTEMADMIN"],
    canEdit: [],
  },

  UNDER_CLIENT_FINAL_REVIEW: {
    canSet: ["CLIENT", "SYSTEMADMIN"],
    next: ["CHANGE_REQUESTED", "CORRECTION_REQUESTED", "FINAL_APPROVED"],
    nextEditableBy: ["ADMIN", "QA", "SYSTEMADMIN"],
    canEdit: [],
  },

  PRELIMINARY_APPROVED: {
    canSet: ["MICRO", "MC", "SYSTEMADMIN"],
    next: ["UNDER_FINAL_TESTING_REVIEW"],
    nextEditableBy: ["MICRO", "MC", "SYSTEMADMIN"],
    canEdit: [],
  },
  RECEIVED_BY_FRONTDESK: {
    canSet: ["FRONTDESK", "SYSTEMADMIN"],
    next: ["UNDER_CLIENT_FINAL_REVIEW", "FRONTDESK_ON_HOLD"],
    nextEditableBy: ["MICRO", "MC", "SYSTEMADMIN"],
    canEdit: [],
  },
  FRONTDESK_ON_HOLD: {
    canSet: ["FRONTDESK", "SYSTEMADMIN"],
    next: ["RECEIVED_BY_FRONTDESK"],
    nextEditableBy: ["FRONTDESK", "SYSTEMADMIN"],
    canEdit: ["FRONTDESK", "SYSTEMADMIN"],
  },

  UNDER_PRELIMINARY_TESTING_REVIEW: {
    canSet: ["MICRO", "MC", "SYSTEMADMIN"],
    next: [
      "PRELIMINARY_TESTING_ON_HOLD",
      "CHANGE_REQUESTED",
      "CORRECTION_REQUESTED",
      "UNDER_QA_PRELIMINARY_REVIEW",
    ],
    nextEditableBy: ["MICRO", "MC", "SYSTEMADMIN"],
    canEdit: ["MICRO", "MC", "ADMIN", "QA", "SYSTEMADMIN"],
  },
  PRELIMINARY_TESTING_ON_HOLD: {
    canSet: ["MICRO", "MC", "SYSTEMADMIN"],
    next: ["UNDER_PRELIMINARY_TESTING_REVIEW"],
    nextEditableBy: ["MICRO", "MC", "ADMIN", "QA", "SYSTEMADMIN"],
    canEdit: ["MICRO", "MC", "ADMIN", "QA", "SYSTEMADMIN"],
  },

  UNDER_QA_PRELIMINARY_REVIEW: {
    canSet: ["QA", "SYSTEMADMIN"],
    next: ["CHANGE_REQUESTED", "CORRECTION_REQUESTED", "UNDER_CLIENT_PRELIMINARY_REVIEW"],
    nextEditableBy: ["MICRO", "MC", "SYSTEMADMIN"],
    canEdit: ["QA", "SYSTEMADMIN"],
  },

  UNDER_FINAL_TESTING_REVIEW: {
    canSet: ["MICRO", "MC", "SYSTEMADMIN"],
    next: [
      "FINAL_TESTING_ON_HOLD",
      "CHANGE_REQUESTED",
      "CORRECTION_REQUESTED",
      "UNDER_QA_FINAL_REVIEW",
    ],
    nextEditableBy: ["QA", "ADMIN", "SYSTEMADMIN"],
    canEdit: ["MICRO", "MC", "SYSTEMADMIN"],
  },
  FINAL_TESTING_ON_HOLD: {
    canSet: ["MICRO", "MC", "SYSTEMADMIN"],
    next: ["CHANGE_REQUESTED", "CORRECTION_REQUESTED", "UNDER_FINAL_TESTING_REVIEW"],
    nextEditableBy: ["CLIENT", "MICRO", "MC", "SYSTEMADMIN"],
    canEdit: ["MICRO", "MC", "ADMIN", "QA", "SYSTEMADMIN"],
  },

  UNDER_QA_FINAL_REVIEW: {
    canSet: ["QA", "SYSTEMADMIN"],
    next: ["CHANGE_REQUESTED", "CORRECTION_REQUESTED", "UNDER_ADMIN_REVIEW"],
    nextEditableBy: ["QA", "SYSTEMADMIN"],
    canEdit: ["QA", "SYSTEMADMIN"],
  },

  UNDER_ADMIN_REVIEW: {
    canSet: ["ADMIN", "SYSTEMADMIN"],
    next: [
      "CHANGE_REQUESTED",
      "CORRECTION_REQUESTED",
      "ADMIN_REJECTED",
      "UNDER_CLIENT_FINAL_REVIEW",
    ],
    nextEditableBy: ["ADMIN", "SYSTEMADMIN"],
    canEdit: ["ADMIN", "SYSTEMADMIN"],
  },

  ADMIN_REJECTED: {
    canSet: ["ADMIN", "SYSTEMADMIN"],
    next: ["UNDER_QA_FINAL_REVIEW"],
    nextEditableBy: ["QA", "SYSTEMADMIN"],
    canEdit: [],
  },

  FINAL_APPROVED: {
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
  VOID: {
    canSet: ["CLIENT", "ADMIN", "SYSTEMADMIN", "QA"], // nobody can set FROM VOID (no transitions out)
    next: [],
    nextEditableBy: ["SYSTEMADMIN"],
    canEdit: [],
  },
  CHANGE_REQUESTED: {
    canSet: ["QA", "ADMIN", "SYSTEMADMIN"],
    next: ["UNDER_CHANGE_UPDATE"],
    nextEditableBy: [
      "CLIENT",
      "FRONTDESK",
      "MICRO",
      "MC",
      "QA",
      "ADMIN",
      "SYSTEMADMIN",
    ],
    canEdit: [],
  },

  UNDER_CHANGE_UPDATE: {
    canSet: [
      "CLIENT",
      "FRONTDESK",
      "MICRO",
      "MC",
      "QA",
      "ADMIN",
      "SYSTEMADMIN",
    ],
    next: [],
    nextEditableBy: [
      "CLIENT",
      "FRONTDESK",
      "MICRO",
      "MC",
      "QA",
      "ADMIN",
      "SYSTEMADMIN",
    ],
    canEdit: [
      "CLIENT",
      "FRONTDESK",
      "MICRO",
      "MC",
      "QA",
      "ADMIN",
      "SYSTEMADMIN",
    ],
  },

  CORRECTION_REQUESTED: {
    canSet: ["QA", "ADMIN", "SYSTEMADMIN"],
    next: ["UNDER_CORRECTION_UPDATE"],
    nextEditableBy: [
      "CLIENT",
      "FRONTDESK",
      "MICRO",
      "MC",
      "QA",
      "ADMIN",
      "SYSTEMADMIN",
    ],
    canEdit: [],
  },

  UNDER_CORRECTION_UPDATE: {
    canSet: [
      "CLIENT",
      "FRONTDESK",
      "MICRO",
      "MC",
      "QA",
      "ADMIN",
      "SYSTEMADMIN",
    ],
    next: [],
    nextEditableBy: [
      "CLIENT",
      "FRONTDESK",
      "MICRO",
      "MC",
      "QA",
      "ADMIN",
      "SYSTEMADMIN",
    ],
    canEdit: [
      "CLIENT",
      "FRONTDESK",
      "MICRO",
      "MC",
      "QA",
      "ADMIN",
      "SYSTEMADMIN",
    ],
  },
};

//  these are designed for readable badges on white UI
export const STATUS_COLORS: Record<ReportStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
  UNDER_DRAFT_REVIEW: "bg-gray-100 text-gray-700 ring-1 ring-gray-500",

  SUBMITTED_BY_CLIENT: "bg-blue-100 text-blue-800 ring-1 ring-blue-200",

  UNDER_CLIENT_PRELIMINARY_REVIEW:
    "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
  UNDER_CLIENT_FINAL_REVIEW:
    "bg-amber-100 text-amber-900 ring-1 ring-amber-200",

  RECEIVED_BY_FRONTDESK: "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200",
  FRONTDESK_ON_HOLD: "bg-orange-100 text-orange-800 ring-1 ring-orange-200",
  // FRONTDESK_NEEDS_CORRECTION: "bg-rose-100 text-rose-800 ring-1 ring-rose-200",

  UNDER_PRELIMINARY_TESTING_REVIEW:
    "bg-sky-100 text-sky-800 ring-1 ring-sky-200",
  PRELIMINARY_TESTING_ON_HOLD:
    "bg-orange-100 text-orange-800 ring-1 ring-orange-200",

  PRELIMINARY_APPROVED:
    "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",

  UNDER_FINAL_TESTING_REVIEW: "bg-sky-100 text-sky-900 ring-1 ring-sky-200",
  FINAL_TESTING_ON_HOLD: "bg-orange-100 text-orange-800 ring-1 ring-orange-200",

  UNDER_QA_PRELIMINARY_REVIEW:
    "bg-purple-100 text-purple-800 ring-1 ring-purple-200",

  UNDER_QA_FINAL_REVIEW: "bg-purple-100 text-purple-800 ring-1 ring-purple-500",

  UNDER_ADMIN_REVIEW: "bg-violet-100 text-violet-800 ring-1 ring-violet-200",

  ADMIN_REJECTED: "bg-red-100 text-red-800 ring-1 ring-red-200",

  FINAL_APPROVED: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
  LOCKED: "bg-slate-200 text-slate-800 ring-1 ring-slate-300",
  VOID: "bg-red-100 text-red-800 ring-1 ring-red-200",

  CHANGE_REQUESTED: "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
  UNDER_CHANGE_UPDATE: "bg-yellow-100 text-yellow-900 ring-1 ring-yellow-200",
  CORRECTION_REQUESTED: "bg-rose-100 text-rose-900 ring-1 ring-rose-200",
  UNDER_CORRECTION_UPDATE:
    "bg-orange-100 text-orange-900 ring-1 ring-orange-200",
};

// Field-level permissions (frontend hint; backend is source of truth)
export const FIELD_EDIT_MAP: Record<Role, string[]> = {
  SYSTEMADMIN: ["*"],
  ADMIN: ["*"],
  FRONTDESK: [],
  MICRO: [
    "testSopNo",
    "dateTested",
    "preliminaryResults",
    "preliminaryResultsDate",
    "dateCompleted",
    "tbc_gram",
    "tbc_result",
    "tmy_gram",
    "tmy_result",
    "pathogens",
    "comments",
    "testedBy",
    "testedDate",
  ],
  MC: [
    "testSopNo",
    "dateTested",
    "preliminaryResults",
    "preliminaryResultsDate",
    "dateCompleted",
    "tbc_gram",
    "tbc_result",
    "tmy_gram",
    "tmy_result",
    "pathogens",
    "comments",
    "testedBy",
    "testedDate",
  ],
  QA: ["comments"],
  CLIENT: [
    "client",
    "dateSent",
    "typeOfTest",
    "sampleType",
    "formulaNo",
    "idNo",
    "description",
    "lotNo",
    "manufactureDate",
    "samplingDate",
    "tbc_spec",
    "tmy_spec",
    "pathogens",
  ],
};

// ---------- Helpers ----------
export function canRoleEditInStatus(
  role?: Role,
  status?: ReportStatus,
): boolean {
  if (!role || !status) return false;
  const t = STATUS_TRANSITIONS[status];
  return !!t?.canSet?.includes(role);
}

export function canRoleEditField(
  role: Role | undefined,
  status: ReportStatus | undefined,
  field: string,
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
export function canShowUpdateButton(
  role: Role | undefined,
  status: ReportStatus | undefined,
  fieldsToConsider?: string[],
): boolean {
  if (!role || !status) return false;
  if (!canRoleEditInStatus(role, status)) return false;

  const allow = FIELD_EDIT_MAP[role] ?? [];
  const effective = allow.includes("*")
    ? (fieldsToConsider ?? ["*"])
    : (fieldsToConsider ?? allow);
  return (
    effective.length > 0 &&
    (allow.includes("*") || effective.some((f) => allow.includes(f)))
  );
}

export function todayISO() {
  const d = new Date();
  // local date (not UTC)
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export const JJL_TYPE_OF_TEST_OPTIONS = [
  "TBC/TFC",
  "USP-61/62",
  "APHA-USP-61/62",
] as const;

export const JJL_SAMPLE_TYPE_OPTIONS = [
  "Bulk Micro",
  "Finished Goods Micro",
  "Stability",
  "Package Compatibility",
  "Bulk Cleaning Validation",
  "Finished Goods Cleaning Validation",
  "Bulk Process Validation",
  "Raw Materials",
] as const;
